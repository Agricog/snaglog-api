import express from 'express';
import multer from 'multer';
import { requireAuth } from '@clerk/express';
import { uploadToR2 } from '../lib/r2.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 100, // Max 100 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Create new report and upload photos
router.post('/', requireAuth(), upload.array('photos', 100), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { propertyAddress, propertyType, developerName, inspectionDate } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' });
    }

    if (!propertyAddress) {
      return res.status(400).json({ error: 'Property address is required' });
    }

    // Create report
    const report = await prisma.report.create({
      data: {
        userId,
        propertyAddress,
        propertyType: propertyType || null,
        developerName: developerName || null,
        inspectionDate: inspectionDate ? new Date(inspectionDate) : new Date(),
        status: 'DRAFT',
      },
    });

    // Upload photos to R2 and create snag records
    const snags = await Promise.all(
      req.files.map(async (file, index) => {
        const { publicUrl } = await uploadToR2(
          file.buffer,
          file.mimetype,
          `reports/${report.id}`
        );

        return prisma.snag.create({
          data: {
            reportId: report.id,
            photoUrl: publicUrl,
            displayOrder: index,
          },
        });
      })
    );

    res.json({
      success: true,
      report: {
        id: report.id,
        propertyAddress: report.propertyAddress,
        photoCount: snags.length,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

// Add more photos to existing report
router.post('/:reportId/photos', requireAuth(), upload.array('photos', 100), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId } = req.params;

    // Verify report ownership
    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
      include: { snags: true },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (report.status === 'COMPLETE') {
      return res.status(400).json({ error: 'Cannot add photos to completed report' });
    }

    const startOrder = report.snags.length;

    // Upload new photos
    const newSnags = await Promise.all(
      req.files.map(async (file, index) => {
        const { publicUrl } = await uploadToR2(
          file.buffer,
          file.mimetype,
          `reports/${reportId}`
        );

        return prisma.snag.create({
          data: {
            reportId,
            photoUrl: publicUrl,
            displayOrder: startOrder + index,
          },
        });
      })
    );

    res.json({
      success: true,
      addedPhotos: newSnags.length,
      totalPhotos: startOrder + newSnags.length,
    });
  } catch (error) {
    console.error('Add photos error:', error);
    res.status(500).json({ error: 'Failed to add photos' });
  }
});

export default router;
