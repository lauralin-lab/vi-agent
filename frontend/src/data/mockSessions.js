/**
 * Mock demo sessions — used when API is unreachable to showcase the app.
 * Each entry follows the same shape as a normalized session in HistoryView.
 */

const MOCK_PALAZZO_IMG = '/mock-palazzo.jpg';

// Palazzo Altemps result — light theme
const PALAZZO_RESULT_HTML = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#000;max-width:100%;overflow:hidden;">

  <!-- Title -->
  <h1 style="font-size:24px;font-weight:700;margin:0 0 4px 0;letter-spacing:-0.02em;color:#000;">
    Palazzo Altemps
  </h1>
  <p style="font-size:13px;color:rgba(0,0,0,0.35);margin:0 0 16px 0;">
    National Roman Museum · Rome, Italy
  </p>

  <!-- Quick facts -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
    <div style="background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:16px;padding:14px;">
      <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Built</div>
      <div style="font-size:15px;font-weight:600;color:#000;">15th Century</div>
    </div>
    <div style="background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:16px;padding:14px;">
      <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Style</div>
      <div style="font-size:15px;font-weight:600;color:#000;">Renaissance</div>
    </div>
    <div style="background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:16px;padding:14px;">
      <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Museum Since</div>
      <div style="font-size:15px;font-weight:600;color:#000;">1997</div>
    </div>
    <div style="background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:16px;padding:14px;">
      <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Collection</div>
      <div style="font-size:15px;font-weight:600;color:#000;">Greek & Roman</div>
    </div>
  </div>

  <!-- Description -->
  <div style="background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:20px;padding:16px;margin-bottom:16px;line-height:1.6;">
    <p style="font-size:14px;color:rgba(0,0,0,0.55);margin:0;">
      This is <strong style="color:#000;">Palazzo Altemps</strong>, a Renaissance palace in Rome's Piazza di Sant'Apollinare. Originally built for the Riario family in the 1480s, it was later acquired by Cardinal Marco Sittico Altemps in 1568. The palace is known for its stunning frescoed loggia, internal courtyard with classical statues, and one of the most important collections of ancient Roman and Greek sculpture in the world.
    </p>
  </div>

  <!-- Map -->
  <div style="border-radius:20px;overflow:hidden;margin-bottom:16px;border:1px solid rgba(0,0,0,0.06);background:#fff;">
    <div style="min-height:140px;background:linear-gradient(135deg,#e8e6f0,#dde4ec);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;">
      <div style="font-size:32px;">📍</div>
      <div style="font-size:14px;font-weight:600;color:rgba(0,0,0,0.6);">Palazzo Altemps</div>
      <div style="font-size:12px;color:rgba(0,0,0,0.3);">Piazza di Sant'Apollinare 46, Rome</div>
    </div>
    <div style="padding:12px 14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">📍</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:rgba(0,0,0,0.7);">Piazza di Sant'Apollinare, 46</div>
          <div style="font-size:11px;color:rgba(0,0,0,0.3);">00186 Roma RM, Italy</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Visiting info -->
  <div style="background:#fff;border:1px solid rgba(0,0,0,0.06);border-radius:20px;padding:16px;margin-bottom:8px;">
    <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;font-weight:600;">Visitor Info</div>
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04);">
      <span style="font-size:13px;color:rgba(0,0,0,0.4);">Hours</span>
      <span style="font-size:13px;font-weight:500;color:rgba(0,0,0,0.7);">Tue–Sun, 9AM–7:45PM</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04);">
      <span style="font-size:13px;color:rgba(0,0,0,0.4);">Admission</span>
      <span style="font-size:13px;font-weight:500;color:rgba(0,0,0,0.7);">€12 (combined ticket)</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:6px 0;">
      <span style="font-size:13px;color:rgba(0,0,0,0.4);">Nearest Metro</span>
      <span style="font-size:13px;font-weight:500;color:rgba(0,0,0,0.7);">Spagna (Line A)</span>
    </div>
  </div>
</div>
`;

export const MOCK_SESSIONS = [
  {
    id: 'mock-palazzo-altemps',
    prompt: 'What is this place? It looks like a classical Italian palazzo with statues.',
    status: 'complete',
    result: { content: PALAZZO_RESULT_HTML, type: 'html' },
    result_html: PALAZZO_RESULT_HTML,
    result_summary: 'Identified as Palazzo Altemps, a Renaissance museum in Rome housing ancient Greek and Roman sculpture.',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    context: {
      photos: [MOCK_PALAZZO_IMG],
    },
    timeline: [
      { type: 'user', content: 'What is this place? It looks like a classical Italian palazzo with statues.', ts: Date.now() - 3600000 },
      { type: 'agent', content: 'I can see a Renaissance palazzo corridor with classical marble statues. Let me identify this location...', ts: Date.now() - 3595000 },
      { type: 'agent', content: 'This is Palazzo Altemps in Rome!', ts: Date.now() - 3590000 },
    ],
  },
];
