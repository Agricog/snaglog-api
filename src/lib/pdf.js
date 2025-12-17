import puppeteer from 'puppeteer';
import { uploadToR2 } from './r2.js';

export async function generateReportPDF(report) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const html = generateReportHTML(report);
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });

    const { publicUrl } = await uploadToR2(pdfBuffer, 'application/pdf', `pdfs/${report.id}`);
    return publicUrl;
  } finally {
    await browser.close();
  }
}

function generateReportHTML(report) {
  const snagsByRoom = groupSnagsByRoom(report.snags);
  const severityCounts = {
    minor: report.snags.filter((s) => s.severity === 'MINOR').length,
    moderate: report.snags.filter((s) => s.severity === 'MODERATE').length,
    major: report.snags.filter((s) => s.severity === 'MAJOR').length,
  };

  const roomRows = Object.entries(snagsByRoom).map(([room, snags]) => `
    <tr>
      <td>${escapeHtml(room)}</td>
      <td>${snags.filter(s => s.severity === 'MINOR').length}</td>
      <td>${snags.filter(s => s.severity === 'MODERATE').length}</td>
      <td>${snags.filter(s => s.severity === 'MAJOR').length}</td>
      <td>${snags.length}</td>
    </tr>
  `).join('');

  const tradeRows = Object.entries(groupSnagsByTrade(report.snags)).map(([trade, snags]) => `
    <tr>
      <td>${escapeHtml(trade)}</td>
      <td>${snags.length}</td>
    </tr>
  `).join('');

  const snagSections = Object.entries(snagsByRoom).map(([room, snags]) => `
    <h2>${escapeHtml(room)} (${snags.length} snags)</h2>
    ${snags.map((snag, index) => `
      <div class="snag-card">
        <div class="snag-header">
          <span class="snag-title">#${String(index + 1).padStart(3, '0')} - ${escapeHtml(snag.defectType || 'Defect')}</span>
          <span class="severity severity-${snag.severity.toLowerCase()}">${snag.severity}</span>
        </div>
        <div class="snag-body">
          <img src="${snag.photoUrl}" class="snag-photo" />
          <div class="snag-details">
            <div class="snag-description">${escapeHtml(snag.description || 'No description')}</div>
            <div class="snag-meta">
              <strong>Trade:</strong> ${escapeHtml(snag.suggestedTrade || 'TBC')} |
              <strong>Action:</strong> ${escapeHtml(snag.remedialAction || 'Review required')}
            </div>
          </div>
        </div>
      </div>
    `).join('')}
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; line-height: 1.5; font-size: 11px; }
    .cover-page { height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
    .logo { font-size: 52px; font-weight: bold; color: #EA580C; margin-bottom: 5px; }
    .tagline { font-size: 14px; color: #475569; margin-bottom: 40px; }
    .report-title { font-size: 26px; font-weight: bold; color: #1e293b; margin-bottom: 30px; }
    .property-details { text-align: left; margin-bottom: 30px; }
    .property-row { display: flex; margin-bottom: 8px; }
    .property-label { width: 140px; font-weight: bold; color: #475569; text-align: right; padding-right: 15px; }
    .property-value { color: #1e293b; }
    .summary-box { border: 1px solid #EA580C; border-radius: 4px; overflow: hidden; width: 350px; margin-top: 20px; }
    .summary-header { background: #EA580C; color: white; padding: 12px; font-weight: bold; font-size: 13px; }
    .summary-body { background: #FFF7ED; padding: 15px; font-size: 12px; }
    .page { page-break-after: always; padding: 10px 0; }
    .page:last-child { page-break-after: avoid; }
    h1 { font-size: 18px; color: #1e293b; border-bottom: 2px solid #EA580C; padding-bottom: 8px; margin-bottom: 20px; }
    h2 { font-size: 14px; color: #EA580C; margin: 20px 0 12px 0; }
    .snag-card { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 15px; overflow: hidden; }
    .snag-header { background: #f8fafc; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
    .snag-title { font-weight: bold; color: #1e293b; }
    .severity { padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
    .severity-minor { background: #dcfce7; color: #16a34a; }
    .severity-moderate { background: #fef9c3; color: #ca8a04; }
    .severity-major { background: #fee2e2; color: #dc2626; }
    .snag-body { padding: 12px; display: flex; gap: 15px; }
    .snag-photo { width: 120px; height: 90px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
    .snag-details { flex: 1; }
    .snag-description { margin-bottom: 8px; color: #475569; }
    .snag-meta { font-size: 10px; color: #64748b; }
    .snag-meta strong { color: #475569; }
    .summary-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .summary-table th, .summary-table td { padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    .summary-table th { background: #1e293b; color: white; font-weight: bold; }
    .summary-table tr:nth-child(even) { background: #f8fafc; }
    .footer-cta { text-align: center; margin-top: 40px; padding-top: 30px; border-top: 1px solid #e2e8f0; }
    .cta-text { font-size: 16px; color: #EA580C; font-weight: bold; margin-bottom: 5px; }
    .cta-url { font-size: 22px; color: #1e293b; font-weight: bold; }
    .report-footer { margin-top: 20px; font-size: 9px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="logo">SnagLog</div>
    <div class="tagline">Photos In. Snag List Out.</div>
    <div class="report-title">SNAGGING INSPECTION REPORT</div>
    <div class="property-details">
      <div class="property-row">
        <span class="property-label">Property Address:</span>
        <span class="property-value">${escapeHtml(report.propertyAddress)}</span>
      </div>
      ${report.propertyType ? `<div class="property-row"><span class="property-label">Property Type:</span><span class="property-value">${escapeHtml(report.propertyType)}</span></div>` : ''}
      ${report.developerName ? `<div class="property-row"><span class="property-label">Developer:</span><span class="property-value">${escapeHtml(report.developerName)}</span></div>` : ''}
      <div class="property-row">
        <span class="property-label">Inspection Date:</span>
        <span class="property-value">${formatDate(report.inspectionDate)}</span>
      </div>
      <div class="property-row">
        <span class="property-label">Report ID:</span>
        <span class="property-value">${report.id.slice(0, 8).toUpperCase()}</span>
      </div>
    </div>
    <div class="summary-box">
      <div class="summary-header">TOTAL SNAGS IDENTIFIED: ${report.snags.length}</div>
      <div class="summary-body">Minor: ${severityCounts.minor} | Moderate: ${severityCounts.moderate} | Major: ${severityCounts.major}</div>
    </div>
  </div>

  <div class="page">
    <h1>Executive Summary</h1>
    <p style="margin-bottom: 15px;">This snagging inspection was conducted on ${formatDate(report.inspectionDate)} at ${escapeHtml(report.propertyAddress)}. The inspection identified <strong>${report.snags.length} defects</strong> requiring attention.</p>
    <h2>Snags by Location</h2>
    <table class="summary-table">
      <tr><th>Location</th><th>Minor</th><th>Moderate</th><th>Major</th><th>Total</th></tr>
      ${roomRows}
    </table>
    <h2>Snags by Trade</h2>
    <table class="summary-table">
      <tr><th>Trade</th><th>Count</th></tr>
      ${tradeRows}
    </table>
  </div>

  <div class="page">
    <h1>Detailed Snag List</h1>
    ${snagSections}
  </div>

  <div class="footer-cta">
    <div class="cta-text">Generate your own snagging report in minutes</div>
    <div class="cta-url">snaglog.co.uk</div>
  </div>
  <div class="report-footer">Report ID: ${report.id.slice(0, 8).toUpperCase()} | Generated: ${formatDate(new Date())} | Powered by SnagLog AI</div>
</body>
</html>`;
}

function groupSnagsByRoom(snags) {
  return snags.reduce((acc, snag) => {
    const room = snag.room || 'Unassigned';
    if (!acc[room]) acc[room] = [];
    acc[room].push(snag);
    return acc;
  }, {});
}

function groupSnagsByTrade(snags) {
  return snags.reduce((acc, snag) => {
    const trade = snag.suggestedTrade || 'Unassigned';
    if (!acc[trade]) acc[trade] = [];
    acc[trade].push(snag);
    return acc;
  }, {});
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export default { generateReportPDF };
