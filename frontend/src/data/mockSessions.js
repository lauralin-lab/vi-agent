/**
 * Mock demo sessions — used when API is unreachable to showcase the app.
 * Each entry follows the same shape as a normalized session in HistoryView.
 */

const MOCK_PALAZZO_IMG = '/mock-palazzo.jpg';

// Palazzo Altemps result — Apple Store-like rich UI
const PALAZZO_RESULT_HTML = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;color:#000;max-width:100%;overflow:hidden;">

  <!-- Title section with category pill -->
  <div style="margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:100px;background:#000;color:#fff;font-size:11px;font-weight:600;letter-spacing:0.03em;">LANDMARK</span>
      <span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:100px;background:rgba(0,0,0,0.04);color:rgba(0,0,0,0.4);font-size:11px;font-weight:500;">🇮🇹 Rome</span>
    </div>
    <h1 style="font-size:28px;font-weight:700;margin:0 0 4px 0;letter-spacing:-0.03em;color:#000;line-height:1.15;">
      Palazzo Altemps
    </h1>
    <p style="font-size:14px;color:rgba(0,0,0,0.35);margin:0;font-weight:400;">
      National Roman Museum · Renaissance Architecture
    </p>
  </div>

  <!-- Star rating row -->
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:14px 16px;border-radius:16px;background:rgba(0,0,0,0.02);">
    <div style="display:flex;gap:2px;">
      <span style="color:#000;font-size:14px;">★</span>
      <span style="color:#000;font-size:14px;">★</span>
      <span style="color:#000;font-size:14px;">★</span>
      <span style="color:#000;font-size:14px;">★</span>
      <span style="color:rgba(0,0,0,0.15);font-size:14px;">★</span>
    </div>
    <span style="font-size:15px;font-weight:600;color:#000;">4.8</span>
    <span style="font-size:12px;color:rgba(0,0,0,0.3);">2,847 reviews</span>
    <span style="margin-left:auto;font-size:12px;font-weight:500;color:rgba(0,0,0,0.4);">See all →</span>
  </div>

  <!-- Quick Facts — horizontal scroll pills -->
  <div style="display:flex;gap:8px;margin-bottom:20px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;">
    <div style="flex-shrink:0;padding:12px 16px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,0.06);min-width:110px;">
      <div style="font-size:10px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600;">Built</div>
      <div style="font-size:17px;font-weight:700;color:#000;letter-spacing:-0.02em;">1480s</div>
    </div>
    <div style="flex-shrink:0;padding:12px 16px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,0.06);min-width:110px;">
      <div style="font-size:10px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600;">Style</div>
      <div style="font-size:17px;font-weight:700;color:#000;letter-spacing:-0.02em;">Renaissance</div>
    </div>
    <div style="flex-shrink:0;padding:12px 16px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,0.06);min-width:110px;">
      <div style="font-size:10px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600;">Museum</div>
      <div style="font-size:17px;font-weight:700;color:#000;letter-spacing:-0.02em;">1997</div>
    </div>
    <div style="flex-shrink:0;padding:12px 16px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,0.06);min-width:110px;">
      <div style="font-size:10px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600;">Collection</div>
      <div style="font-size:17px;font-weight:700;color:#000;letter-spacing:-0.02em;">Greek & Roman</div>
    </div>
  </div>

  <!-- About section with highlight card -->
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;font-weight:600;padding-left:2px;">About</div>
    <div style="border-radius:20px;padding:18px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.04);line-height:1.7;">
      <p style="font-size:14px;color:rgba(0,0,0,0.6);margin:0;">
        This is <strong style="color:#000;">Palazzo Altemps</strong>, a stunning Renaissance palace in Rome's historic Piazza di Sant'Apollinare. Originally built for the Riario family in the <strong style="color:#000;">1480s</strong>, it was later acquired by Cardinal Marco Sittico Altemps in 1568.
      </p>
      <div style="height:1px;background:rgba(0,0,0,0.04);margin:14px 0;"></div>
      <p style="font-size:14px;color:rgba(0,0,0,0.6);margin:0;">
        The palace is celebrated for its stunning <strong style="color:#000;">frescoed loggia</strong>, internal courtyard with classical statues, and one of the most important collections of ancient Roman and Greek sculpture in the world.
      </p>
    </div>
  </div>

  <!-- Highlights -->
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;font-weight:600;padding-left:2px;">Highlights</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,0.04);">
        <div style="width:40px;height:40px;border-radius:12px;background:rgba(0,0,0,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:18px;">🏛️</span>
        </div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#000;margin-bottom:2px;">Ludovisi Collection</div>
          <div style="font-size:12px;color:rgba(0,0,0,0.35);">World-famous ancient sculpture collection</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,0.04);">
        <div style="width:40px;height:40px;border-radius:12px;background:rgba(0,0,0,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:18px;">🎨</span>
        </div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#000;margin-bottom:2px;">Painted Loggia</div>
          <div style="font-size:12px;color:rgba(0,0,0,0.35);">Spectacular frescoed open gallery</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,0.04);">
        <div style="width:40px;height:40px;border-radius:12px;background:rgba(0,0,0,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:18px;">🏰</span>
        </div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#000;margin-bottom:2px;">Renaissance Courtyard</div>
          <div style="font-size:12px;color:rgba(0,0,0,0.35);">Beautiful internal garden with classical statues</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Map — static tile image (works inside iframes) -->
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;font-weight:600;padding-left:2px;">Location</div>
    <div style="border-radius:20px;overflow:hidden;border:1px solid rgba(0,0,0,0.04);background:#fff;">
      <a href="https://maps.apple.com/?address=Piazza+di+Sant'Apollinare,+46,+00186+Roma+RM,+Italy&ll=41.9020,12.4720" target="_blank" style="display:block;position:relative;width:100%;height:180px;overflow:hidden;background:#e8edf3;">
        <img
          src="https://tile.openstreetmap.org/15/17425/11908.png"
          alt="Map of Palazzo Altemps"
          style="width:100%;height:100%;object-fit:cover;object-position:center;opacity:0.95;"
          loading="lazy"
        />
        <!-- Pin overlay -->
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-100%);font-size:32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">📍</div>
        <!-- Tap hint -->
        <div style="position:absolute;bottom:10px;right:10px;padding:6px 12px;border-radius:100px;background:rgba(255,255,255,0.92);backdrop-filter:blur(10px);font-size:11px;font-weight:600;color:#000;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          Open in Maps ↗
        </div>
      </a>
      <div style="padding:14px 16px;">
        <div style="font-size:14px;font-weight:600;color:#000;margin-bottom:2px;">Piazza di Sant'Apollinare, 46</div>
        <div style="font-size:12px;color:rgba(0,0,0,0.3);">00186 Roma RM, Italy</div>
      </div>
    </div>
  </div>

  <!-- Visitor Info — iOS settings style -->
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;color:rgba(0,0,0,0.3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;font-weight:600;padding-left:2px;">Visitor Info</div>
    <div style="border-radius:20px;overflow:hidden;background:#fff;border:1px solid rgba(0,0,0,0.04);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.04);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;">🕐</span>
          <span style="font-size:14px;color:rgba(0,0,0,0.5);">Hours</span>
        </div>
        <span style="font-size:14px;font-weight:500;color:#000;">Tue–Sun, 9–7:45PM</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.04);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;">🎫</span>
          <span style="font-size:14px;color:rgba(0,0,0,0.5);">Admission</span>
        </div>
        <span style="font-size:14px;font-weight:500;color:#000;">€12</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.04);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;">🚇</span>
          <span style="font-size:14px;color:rgba(0,0,0,0.5);">Metro</span>
        </div>
        <span style="font-size:14px;font-weight:500;color:#000;">Spagna (A)</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:16px;">📞</span>
          <span style="font-size:14px;color:rgba(0,0,0,0.5);">Phone</span>
        </div>
        <span style="font-size:14px;font-weight:500;color:#000;">+39 06 6833759</span>
      </div>
    </div>
  </div>

  <!-- Quick actions CTA row -->
  <div style="display:flex;gap:8px;margin-bottom:16px;">
    <a href="https://maps.apple.com/?daddr=Piazza+di+Sant'Apollinare,+46,+Rome" target="_blank" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:14px;border-radius:16px;background:#000;color:#fff;font-size:13px;font-weight:600;text-decoration:none;">
      🧭 Directions
    </a>
    <a href="https://www.museonazionaleromano.beniculturali.it" target="_blank" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:14px;border-radius:16px;background:rgba(0,0,0,0.04);color:#000;font-size:13px;font-weight:600;text-decoration:none;border:1px solid rgba(0,0,0,0.06);">
      🌐 Website
    </a>
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
