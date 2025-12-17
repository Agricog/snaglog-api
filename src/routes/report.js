import express from 'express';
import { requireAuth } from '@clerk/express';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Get all reports for user
router.get('/', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;

    const reports = await prisma.report.findMany({
      where: { userId },
      include: {
        snags: {
          select: { id: true, severity: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reportsWithCounts = reports.map((report) => ({
      id: report.id,
      propertyAddress: report.propertyAddress,
      propertyType: report.propertyType,
      inspectionDate: report.inspectionDate,
      status: report.status,
      paymentStatus: report.paymentStatus,
      pdfUrl: report.pdfUrl,
      createdAt: report.createdAt,
      snagCount: report.snags.length,
      severityCounts: {
        minor: report.snags.filter((s) => s.severity === 'MINOR').length,
        moderate: report.snags.filter((s) => s.severity === 'MODERATE').length,
        major: report.snags.filter((s) => s.severity === 'MAJOR').length,
      },
    }));

    res.json({ reports: reportsWithCounts });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

// Get single report with all snags
router.get('/:reportId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
      include: {
        snags: { orderBy: { displayOrder: 'asc' } },
      },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ report });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// Update report details
router.patch('/:reportId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId } = req.params;
    const { propertyAddress, propertyType, developerName, inspectionDate } = req.body;

    // Verify ownership
    const existing = await prisma.report.findFirst({
      where: { id: reportId, userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        ...(propertyAddress && { propertyAddress }),
        ...(propertyType && { propertyType }),
        ...(developerName !== undefined && { developerName }),
        ...(inspectionDate && { inspectionDate: new Date(inspectionDate) }),
      },
    });

    res.json({ success: true, report });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Update a snag
router.patch('/:reportId/snag/:snagId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId, snagId } = req.params;
    const { room, defectType, description, severity, suggestedTrade, remedialAction } = req.body;

    // Verify ownership
    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const snag = await prisma.snag.update({
      where: { id: snagId },
      data: {
        ...(room !== undefined && { room }),
        ...(defectType && { defectType }),
        ...(description && { description }),
        ...(severity && { severity }),
        ...(suggestedTrade && { suggestedTrade }),
        ...(remedialAction && { remedialAction }),
        userEdited: true,
      },
    });

    res.json({ success: true, snag });
  } catch (error) {
    console.error('Update snag error:', error);
    res.status(500).json({ error: 'Failed to update snag' });
  }
});

// Delete a snag
router.delete('/:reportId/snag/:snagId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId, snagId } = req.params;

    // Verify ownership
    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    await prisma.snag.delete({
      where: { id: snagId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete snag error:', error);
    res.status(500).json({ error: 'Failed to delete snag' });
  }
});

// Delete entire report
router.delete('/:reportId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId } = req.params;

    // Verify ownership
    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Cascade delete will remove snags
    await prisma.report.delete({
      where: { id: reportId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

export default router;
