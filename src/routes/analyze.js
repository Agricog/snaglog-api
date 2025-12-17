import express from 'express';
import { requireAuth } from '@clerk/express';
import { analyzeSnagPhoto } from '../lib/claude.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Analyze all snags in a report
router.post('/:reportId', requireAuth(), async (req, res) => {
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

    if (report.snags.length === 0) {
      return res.status(400).json({ error: 'No photos to analyze' });
    }

    // Update report status
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'ANALYZING' },
    });

    // Analyze each snag
    const results = await Promise.all(
      report.snags.map(async (snag) => {
        try {
          const analysis = await analyzeSnagPhoto(snag.photoUrl);

          return prisma.snag.update({
            where: { id: snag.id },
            data: {
              defectType: analysis.defectType,
              description: analysis.description,
              severity: analysis.severity,
              suggestedTrade: analysis.suggestedTrade,
              remedialAction: analysis.remedialAction,
              aiConfidence: analysis.confidence,
            },
          });
        } catch (error) {
          console.error(`Error analyzing snag ${snag.id}:`, error);
          return snag;
        }
      })
    );

    // Update report status to review
    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: { status: 'REVIEW' },
      include: { snags: { orderBy: { displayOrder: 'asc' } } },
    });

    res.json({
      success: true,
      report: updatedReport,
    });
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: 'Failed to analyze photos' });
  }
});

// Analyze a single snag (re-analyze)
router.post('/:reportId/snag/:snagId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId, snagId } = req.params;

    // Verify report ownership
    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const snag = await prisma.snag.findFirst({
      where: { id: snagId, reportId },
    });

    if (!snag) {
      return res.status(404).json({ error: 'Snag not found' });
    }

    const analysis = await analyzeSnagPhoto(snag.photoUrl);

    const updatedSnag = await prisma.snag.update({
      where: { id: snagId },
      data: {
        defectType: analysis.defectType,
        description: analysis.description,
        severity: analysis.severity,
        suggestedTrade: analysis.suggestedTrade,
        remedialAction: analysis.remedialAction,
        aiConfidence: analysis.confidence,
        userEdited: false,
      },
    });

    res.json({
      success: true,
      snag: updatedSnag,
    });
  } catch (error) {
    console.error('Re-analyze error:', error);
    res.status(500).json({ error: 'Failed to re-analyze snag' });
  }
});

export default router;
