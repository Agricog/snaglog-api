import express from 'express';
import Stripe from 'stripe';
import { requireAuth } from '@clerk/express';
import prisma from '../lib/prisma.js';
import { generateReportPDF } from '../lib/pdf.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create checkout session for a report
router.post('/checkout/:reportId', requireAuth(), async (req, res) => {
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

    if (report.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'Report already paid' });
    }

    if (report.snags.length === 0) {
      return res.status(400).json({ error: 'No snags in report' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/report/${reportId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/report/${reportId}/review`,
      metadata: {
        reportId,
        userId,
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Verify payment and generate PDF
router.post('/verify/:reportId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId } = req.params;
    const { sessionId } = req.body;

    // Verify report ownership
    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
      include: { snags: { orderBy: { displayOrder: 'asc' } } },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Check if already paid
    if (report.paymentStatus === 'PAID' && report.pdfUrl) {
      return res.json({ success: true, pdfUrl: report.pdfUrl });
    }

    // Verify Stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    if (session.metadata.reportId !== reportId) {
      return res.status(400).json({ error: 'Invalid session' });
    }

    // Update report status
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'GENERATING',
        paymentStatus: 'PAID',
        stripePaymentId: session.payment_intent,
      },
    });

    // Generate PDF
    const pdfUrl = await generateReportPDF(report);

    // Update report with PDF URL
    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'COMPLETE',
        pdfUrl,
      },
    });

    res.json({ success: true, pdfUrl: updatedReport.pdfUrl });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Stripe webhook for payment events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Payment successful for report:', session.metadata.reportId);
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Get payment status
router.get('/status/:reportId', requireAuth(), async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId },
      select: {
        id: true,
        paymentStatus: true,
        pdfUrl: true,
        status: true,
      },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ report });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

export default router;
