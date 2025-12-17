import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '@clerk/express';
import prisma from '../lib/prisma.js';
import { uploadToR2 } from '../lib/r2.js';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/octet-stream'
    ];
    if (file.mimetype.startsWith('image/') || allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.log('Rejected file type:', file.mimetype);
      cb(new Error('Only image files are allowed'));
    }
  },
});

async function processImage(buffer, mimetype, originalName) {
  try {
    // Check if HEIC by mimetype or file extension
    const isHeic = mimetype === 'image/heic' || 
                   mimetype === 'image/heif' || 
                   originalName?.toLowerCase().endsWith('.heic') ||
                   originalName?.toLowerCase().endsWith('.heif') ||
                   mimetype === 'application/octet-stream';
    
    let imageBuffer = buffer;
    
    // Convert HEIC to JPEG first
    if (isHeic) {
      console.log('Converting HEIC image...');
      try {
        const converted = await heicConvert({
          buffer: buffer,
          format: 'JPEG',
          quality: 0.85
        });
        imageBuffer = Buffer.from(converted);
        console.log('HEIC conversion successful');
      } catch (heicError) {
        console.error('HEIC conversion failed:', heicError.message);
        // Try with sharp as fallback
      }
    }
    
    // Process with sharp (rotate, compress)
    const processed = await sharp(imageBuffer)
      .rotate()
      .jpeg({ quality: 85 })
      .toBuffer();
    
    return {
      buffer: processed,
      mimetype: 'image/jpeg',
      extension: 'jpg'
    };
  } catch (error) {
    console.error('Image processing error:', error.message);
    // Return original if all processing fails
    const ext = mimetype.split('/')[1] || 'jpg';
    return {
      buffer,
      mimetype,
      extension: ext
    };
  }
}

router.post('/', requireAuth(), upload.array('photos', 100), async (req, res) => {
  try {
    const { userId } = req.auth;
    const { propertyAddress, propertyType, developerName } = req.body;

    if (!propertyAddress) {
      return res.status(400).json({ error: 'Property address is required' });
    }

    const report = await prisma.report.create({
      data: {
        userId,
        propertyAddress,
        propertyType: propertyType || null,
        developerName: developerName || null,
        inspectionDate: new Date(),
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
      },
    });

    const snags = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      console.log(`Processing file: ${file.originalname}, type: ${file.mimetype}`);
      const processed = await processImage(file.buffer, file.mimetype, file.originalname);
      
      const { publicUrl } = await uploadToR2(
        processed.buffer,
        processed.mimetype,
        `reports/${report.id}`
      );

      const snag = await prisma.snag.create({
        data: {
          reportId: report.id,
          photoUrl: publicUrl,
          displayOrder: i,
        },
      });

      snags.push(snag);
    }

    res.json({ report, snags });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

router.post('/:reportId/photos', requireAuth(), upload.array('photos', 100), async (req, res) => {
  try {
    const { userId } = req.auth;
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
      include: { snags: true },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const startOrder = report.snags.length;
    const snags = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      console.log(`Processing file: ${file.originalname}, type: ${file.mimetype}`);
      const processed = await processImage(file.buffer, file.mimetype, file.originalname);
      
      const { publicUrl } = await uploadToR2(
        processed.buffer,
        processed.mimetype,
        `reports/${report.id}`
      );

      const snag = await prisma.snag.create({
        data: {
          reportId: report.id,
          photoUrl: publicUrl,
          displayOrder: startOrder + i,
        },
      });

      snags.push(snag);
    }

    res.json({ snags });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
});

export default router;
