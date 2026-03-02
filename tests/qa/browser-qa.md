# VI Agent Browser QA Test Suite

**Version:** 1.0
**Target:** React 19 SPA, mobile-first (iPhone 12: 390x844)
**Transport:** LiveKit WebRTC (DataChannel + RPC), SSE fallback, REST polling

---

## Prerequisites

| Setting            | Value                                                    |
|--------------------|----------------------------------------------------------|
| Base URL           | `${VI_TEST_BASE_URL:-http://localhost}`                  |
| Viewport           | iPhone 12 — 390 x 844                                   |
| Screenshot Dir     | `tests/reports/screenshots/`                             |
| Naming Convention  | `{SUITE}-{ID}-{step}.png`                                |
| Test Account       | `test@vi.com` / `test1234`                               |
| Token Storage      | `sessionStorage` key `vi-token`                          |
| Device ID Storage  | `localStorage` key `vi-device-id`                        |
| User ID Storage    | `localStorage` key `vi-user-id`                          |

### Initialization Sequence

```
1. Install browser (ensure Chromium available)
2. Set viewport to 390x844
3. Navigate to ${VI_TEST_BASE_URL:-http://localhost}
4. Wait for network idle (splash screen fades)
5. Take screenshot: INIT-baseline.png
```

---

## Master Overview

| Suite          | ID Range       | Tests | Focus                              | Severity Spread        |
|----------------|----------------|-------|------------------------------------|------------------------|
| APP-LOAD       | APP-01..05     | 5     | First screen, PWA meta, frame      | 2 CRITICAL, 2 HIGH, 1 MED |
| AUTH-FLOW      | AUTH-01..06    | 6     | Login, signup, session persistence | 2 CRITICAL, 2 HIGH, 2 MED |
| CAMERA         | CAM-01..08     | 8     | Camera view, capture, controls     | 3 CRITICAL, 3 HIGH, 2 MED |
| SESSION        | SESS-01..07    | 7     | LiveSessionView timeline & chat    | 2 CRITICAL, 3 HIGH, 2 MED |
| HOME           | HOME-01..06    | 6     | HistoryView task list & FABs       | 1 CRITICAL, 3 HIGH, 2 MED |
| MEMORY         | MEM-01..05     | 5     | MemoryView CRUD                    | 1 CRITICAL, 2 HIGH, 2 MED |
| NAVIGATION     | NAV-01..04     | 4     | Round-trip view transitions        | 2 CRITICAL, 1 HIGH, 1 MED |
| DATA-CHANNEL   | DC-01..04      | 4     | Communication verification         | 1 CRITICAL, 2 HIGH, 1 MED |
| ERROR-HANDLING | ERR-01..04     | 4     | Edge cases & resilience            | 1 CRITICAL, 2 HIGH, 1 MED |
| PERFORMANCE    | PERF-01..05    | 5     | Timing & memory                    | 2 CRITICAL, 2 HIGH, 1 MED |
| **Total**      |                | **54**|                                    |                        |

---

## Suite 1: APP-LOAD -- First Screen & PWA

| ID     | Name                       | Severity | View   |
|--------|----------------------------|----------|--------|
| APP-01 | Page loads within 3s       | CRITICAL | -      |
| APP-02 | React app mounts           | CRITICAL | camera |
| APP-03 | PWA meta tags              | HIGH     | -      |
| APP-04 | Camera permission handling | HIGH     | camera |
| APP-05 | Desktop DeviceFrame        | MED      | camera |

---

### APP-01: Page loads within 3s
> View: - | Severity: CRITICAL | Deps: none

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Wait for page load event
3. Measure load timing
   - Evaluate JS: `performance.getEntriesByType('navigation')[0].domInteractive`
4. Take screenshot
   - Take screenshot: `APP-LOAD-01-loaded.png`

**Assert:**
- `domInteractive` value is less than 3000 (ms) --> PASS_LOAD_TIME
- Page title is `VI` --> PASS_TITLE

**On Fail --> Diagnose:**
- domInteractive > 3000 --> Slow asset delivery or blocking scripts | check: Network waterfall, bundle size, CDN config
- Title missing --> index.html not served | check: nginx config, Docker container health

---

### APP-02: React app mounts
> View: camera | Severity: CRITICAL | Deps: APP-01

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Wait for splash screen to disappear (max 5s)
   - Evaluate JS: `new Promise(r => { const check = () => { const splash = document.getElementById('splash'); if (!splash || splash.classList.contains('hide') || getComputedStyle(splash).opacity === '0') r(true); else setTimeout(check, 200); }; check(); setTimeout(() => r(false), 5000); })`
3. Verify React root has content
   - Evaluate JS: `document.getElementById('root').children.length > 0`
4. Verify interactive elements exist (video or buttons)
   - Evaluate JS: `!!(document.querySelector('video') || document.querySelectorAll('button').length > 0)`
5. Take screenshot
   - Take screenshot: `APP-LOAD-02-mounted.png`

**Assert:**
- Splash screen hidden --> PASS_SPLASH_FADE
- Root element has children --> PASS_REACT_MOUNT
- Interactive elements found --> PASS_INTERACTIVE

**On Fail --> Diagnose:**
- Splash visible after 5s --> React bundle failed to load | check: Browser console for JS errors, Vite build output
- Root empty --> Fatal render error | check: Console for React error boundaries, missing env vars (VITE_API_URL)

---

### APP-03: PWA meta tags
> View: - | Severity: HIGH | Deps: APP-01

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Check viewport meta
   - Evaluate JS: `document.querySelector('meta[name="viewport"]')?.content`
3. Check apple-mobile-web-app-capable
   - Evaluate JS: `document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content`
4. Check theme-color
   - Evaluate JS: `document.querySelector('meta[name="theme-color"]')?.content`
5. Take screenshot
   - Take screenshot: `APP-LOAD-03-meta.png`

**Assert:**
- Viewport contains `viewport-fit=cover` --> PASS_VIEWPORT_FIT
- apple-mobile-web-app-capable is `yes` --> PASS_PWA_CAPABLE
- theme-color is `#000000` --> PASS_THEME_COLOR

**On Fail --> Diagnose:**
- Missing viewport-fit=cover --> Safe area insets will not work on notch devices | check: `frontend/index.html` `<head>` section
- Missing apple-mobile-web-app-capable --> App won't behave as standalone PWA on iOS | check: `frontend/index.html`
- Wrong theme-color --> Status bar color mismatch | check: `frontend/index.html` meta tags

---

### APP-04: Camera permission handling
> View: camera | Severity: HIGH | Deps: APP-02

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Wait 3s for camera initialization
3. Check for video element
   - Evaluate JS: `!!document.querySelector('video')`
4. Check video element attributes
   - Evaluate JS: `(() => { const v = document.querySelector('video'); if (!v) return { exists: false }; return { exists: true, autoplay: v.autoplay, playsInline: v.playsInline, muted: v.muted }; })()`
5. Check for graceful fallback (spinner visible when no camera in headless)
   - Evaluate JS: `!!document.querySelector('.animate-spin')`
6. Take screenshot
   - Take screenshot: `APP-LOAD-04-camera.png`

**Assert:**
- Video element exists OR spinner fallback shown --> PASS_CAMERA_UI
- If video exists: autoplay=true, playsInline=true, muted=true --> PASS_VIDEO_ATTRS

**On Fail --> Diagnose:**
- No video and no spinner --> LiveCameraView component failed to render | check: `frontend/src/components/LiveCameraView.jsx`, LiveKit connection errors
- Missing playsInline --> Video will fullscreen on iOS | check: Video element attribute assignment in LiveCameraView

---

### APP-05: Desktop DeviceFrame
> View: camera | Severity: MED | Deps: APP-02

**Steps:**
1. Resize browser to 1920x1080
2. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
3. Wait 2s for layout
4. Check for phone simulator frame
   - Evaluate JS: `!!document.querySelector('.rounded-\\[55px\\]')`
5. Measure inner content width
   - Evaluate JS: `(() => { const frame = document.querySelector('.rounded-\\[55px\\]'); if (!frame) return null; return frame.getBoundingClientRect().width; })()`
6. Check for Dynamic Island element
   - Evaluate JS: `!!document.querySelector('.rounded-\\[55px\\] .bg-black.rounded-full')`
7. Take screenshot
   - Take screenshot: `APP-LOAD-05-desktop.png`
8. Resize back to 390x844 for subsequent tests

**Assert:**
- Phone simulator frame exists (class `rounded-[55px]`) --> PASS_DEVICE_FRAME
- Inner content width is approximately 393px (within 10px tolerance) --> PASS_INNER_WIDTH
- Dynamic Island element present --> PASS_DYNAMIC_ISLAND

**On Fail --> Diagnose:**
- No device frame --> `useIsMobile()` hook returning true at 1920px | check: `frontend/src/hooks/useIsMobile.js` breakpoint logic
- Width wrong --> DeviceFrame hardcoded dimensions changed | check: `frontend/src/components/DeviceFrame.jsx` `w-[393px]` class

---

## Suite 2: AUTH-FLOW -- Login/Signup

| ID      | Name                         | Severity | View |
|---------|------------------------------|----------|------|
| AUTH-01 | HistoryView loads at /home   | HIGH     | home |
| AUTH-02 | Auth overlay on profile tap  | HIGH     | home |
| AUTH-03 | Signup flow                  | CRITICAL | home |
| AUTH-04 | Logged-in state              | CRITICAL | home |
| AUTH-05 | Session persists on refresh  | MED      | home |
| AUTH-06 | Logout                       | MED      | home |

---

### AUTH-01: HistoryView loads at /home
> View: home | Severity: HIGH | Deps: APP-02

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 2s for view render
3. Verify HistoryView heading
   - Evaluate JS: `(() => { const h1s = document.querySelectorAll('h1'); for (const h of h1s) { if (h.textContent.includes('Home') || h.textContent.includes('History')) return h.textContent; } return null; })()`
4. Verify task list or empty state
   - Evaluate JS: `!!(document.querySelector('[class*="grid"]') || document.querySelector('p')?.textContent?.includes('No tasks yet'))`
5. Take screenshot
   - Take screenshot: `AUTH-FLOW-01-home.png`

**Assert:**
- Heading contains "Home" or "History" --> PASS_HEADING
- Task list grid or "No tasks yet" empty state visible --> PASS_CONTENT

**On Fail --> Diagnose:**
- No heading --> App.jsx viewState routing broken for /home path | check: `App.jsx` `useState(() => { const path = ... })` initialization
- No content --> HistoryView failed to render or API call crashed | check: Browser console, `/api/users/tasks` endpoint

---

### AUTH-02: Auth overlay on profile click
> View: home | Severity: HIGH | Deps: AUTH-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 2s
3. Click the profile avatar button (top-right, User icon)
   - Click: `button` containing User icon (top-right area, `w-12 h-12 rounded-full`)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const rect = b.getBoundingClientRect(); if (rect.right > 300 && rect.top < 100 && b.querySelector('svg')) return b; } return null; })()?.click()`
4. Wait 1s for view transition
5. Note: Profile tap navigates to MemoryView (not an auth overlay). Auth UI appears within MemoryView or via a separate flow. Verify MemoryView loads.
   - Evaluate JS: `(() => { const h1s = document.querySelectorAll('h1'); for (const h of h1s) { if (h.textContent.includes('Memory')) return true; } return false; })()`
6. Take screenshot
   - Take screenshot: `AUTH-FLOW-02-profile.png`

**Assert:**
- MemoryView loaded after profile tap (heading "Memory" visible) --> PASS_PROFILE_NAV

**On Fail --> Diagnose:**
- MemoryView not loaded --> `onProfileTap` handler not wired or view state not changing | check: `App.jsx` `handleProfileTap`, `HistoryView` `onProfileTap` prop

---

### AUTH-03: Signup flow
> View: home | Severity: CRITICAL | Deps: APP-02

**Steps:**
1. Clear existing auth state
   - Evaluate JS: `sessionStorage.removeItem('vi-token'); localStorage.removeItem('vi-user-id'); true`
2. Navigate to base URL to trigger fresh state
   - Navigate to: `${BASE_URL}/`
3. Wait 2s
4. Call signup API directly (UI-independent verification)
   - Evaluate JS: `fetch('${BASE_URL}/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@vi.com', password: 'test1234', display_name: 'Test User' }) }).then(r => r.json()).then(d => { if (d.token) { sessionStorage.setItem('vi-token', d.token); return { success: true, token: d.token.substring(0, 20) + '...' }; } return { success: false, detail: d.detail }; }).catch(e => ({ success: false, error: e.message }))`
5. Verify token stored in sessionStorage
   - Evaluate JS: `!!sessionStorage.getItem('vi-token')`
6. Take screenshot
   - Take screenshot: `AUTH-FLOW-03-signup.png`

**Assert:**
- API returns token (or "already exists" for existing user, which still proves endpoint works) --> PASS_SIGNUP_API
- Token stored in sessionStorage under key `vi-token` --> PASS_TOKEN_STORED

**On Fail --> Diagnose:**
- API error --> Auth endpoint down or DB connection issue | check: `/api/auth/signup` response, api-server logs
- Token not stored --> `ApiClient.setToken()` not persisting to sessionStorage | check: `frontend/src/services/api.js` `setToken()` method

---

### AUTH-04: Logged-in state
> View: home | Severity: CRITICAL | Deps: AUTH-03

**Steps:**
1. Login via API to ensure token is set
   - Evaluate JS: `fetch('${BASE_URL}/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@vi.com', password: 'test1234' }) }).then(r => r.json()).then(d => { if (d.token) sessionStorage.setItem('vi-token', d.token); return !!d.token; }).catch(() => false)`
2. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
3. Wait 2s for render
4. Check for personalized profile avatar (gradient background, first letter of display name)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.style.background?.includes('gradient') && b.querySelector('span')?.textContent?.length === 1) return { authenticated: true, initial: b.querySelector('span').textContent }; } return { authenticated: false }; })()`
5. Take screenshot
   - Take screenshot: `AUTH-FLOW-04-loggedin.png`

**Assert:**
- Profile button shows gradient background with user initial --> PASS_AUTH_PROFILE
- No "Login" text visible --> PASS_NO_LOGIN_CTA

**On Fail --> Diagnose:**
- User icon instead of initial --> `useAuth` hook not detecting token or `/api/auth/me` failed | check: `sessionStorage.getItem('vi-token')`, `/api/auth/me` endpoint
- "Login" button visible --> `isAuthenticated` prop not passed to HistoryView | check: `App.jsx` auth wiring

---

### AUTH-05: Session persists after refresh
> View: home | Severity: MED | Deps: AUTH-04

**Steps:**
1. Verify token currently exists
   - Evaluate JS: `!!sessionStorage.getItem('vi-token')`
2. Note: `vi-token` is stored in sessionStorage, which persists within the same tab on reload but NOT across tabs. `vi-user-id` is in localStorage and persists across all sessions.
3. Reload the page
   - Navigate to: `${BASE_URL}/home`
4. Wait 3s for full re-render
5. Check token still in storage
   - Evaluate JS: `!!sessionStorage.getItem('vi-token')`
6. Check vi-user-id in localStorage
   - Evaluate JS: `!!localStorage.getItem('vi-user-id')`
7. Take screenshot
   - Take screenshot: `AUTH-FLOW-05-persist.png`

**Assert:**
- `vi-token` still in sessionStorage after reload --> PASS_TOKEN_PERSIST
- `vi-user-id` in localStorage --> PASS_USER_ID_PERSIST

**On Fail --> Diagnose:**
- Token cleared --> `useAuth` mount logic calling `api.setToken(null)` on failed `/api/auth/me` | check: `frontend/src/hooks/useAuth.js` error handler, API server health
- User ID cleared --> `ApiClient.setViUserId` called with null | check: LiveKit anonymous token flow

---

### AUTH-06: Logout
> View: home | Severity: MED | Deps: AUTH-04

**Steps:**
1. Ensure logged in (token exists)
   - Evaluate JS: `!!sessionStorage.getItem('vi-token')`
2. Execute logout programmatically (as logout is via `api.logout()`)
   - Evaluate JS: `sessionStorage.removeItem('vi-token'); true`
3. Navigate to /home to trigger fresh state
   - Navigate to: `${BASE_URL}/home`
4. Wait 2s
5. Verify token cleared
   - Evaluate JS: `!sessionStorage.getItem('vi-token')`
6. Verify UI shows anonymous state (User icon, no gradient on profile button)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.style.background?.includes('gradient')) return false; } return true; })()`
7. Take screenshot
   - Take screenshot: `AUTH-FLOW-06-logout.png`

**Assert:**
- `vi-token` cleared from sessionStorage --> PASS_TOKEN_CLEARED
- Profile button shows generic User icon (no gradient) --> PASS_ANONYMOUS_UI

**On Fail --> Diagnose:**
- Token still present --> `api.logout()` not clearing sessionStorage | check: `frontend/src/services/api.js` `logout()` method
- Gradient still showing --> React state not resetting on auth change | check: `useAuth` hook return values, HistoryView `isAuthenticated` prop

---

## Suite 3: CAMERA -- Camera View & Capture

| ID     | Name                         | Severity | View   |
|--------|------------------------------|----------|--------|
| CAM-01 | Video element renders        | CRITICAL | camera |
| CAM-02 | Agent status Card appears    | CRITICAL | camera |
| CAM-03 | Agent connection state       | HIGH     | camera |
| CAM-04 | Shutter button visible       | CRITICAL | camera |
| CAM-05 | Single photo capture         | HIGH     | camera |
| CAM-06 | Multi-photo capture          | HIGH     | camera |
| CAM-07 | Done button after capture    | MED      | camera |
| CAM-08 | Mic toggle                   | MED      | camera |

---

### CAM-01: Camera view renders with video element
> View: camera | Severity: CRITICAL | Deps: APP-02

**Steps:**
1. Navigate to base URL (camera is default view)
   - Navigate to: `${BASE_URL}/`
2. Wait 3s for camera initialization
3. Check for `<video>` element
   - Evaluate JS: `!!document.querySelector('video')`
4. Check video attributes
   - Evaluate JS: `(() => { const v = document.querySelector('video'); if (!v) return null; return { autoplay: v.hasAttribute('autoplay') || v.autoPlay, playsInline: v.hasAttribute('playsinline') || v.playsInline, muted: v.hasAttribute('muted') || v.muted }; })()`
5. Check if video has a stream or fallback spinner is shown
   - Evaluate JS: `(() => { const v = document.querySelector('video'); if (v && v.srcObject) return 'stream_attached'; if (v && v.src) return 'src_attached'; if (document.querySelector('.animate-spin')) return 'spinner_fallback'; return 'no_video'; })()`
6. Take screenshot
   - Take screenshot: `CAMERA-01-video.png`

**Assert:**
- `<video>` element exists OR spinner fallback present --> PASS_VIDEO_ELEMENT
- If video exists: autoPlay=true, playsInline=true, muted=true --> PASS_VIDEO_ATTRS

**On Fail --> Diagnose:**
- No video element --> LiveCameraView not rendering; check `livekit.localVideoTrack` is null | check: LiveKit connection, `useLiveKit.js`
- Missing attributes --> Video element in LiveCameraView.jsx not setting attributes | check: Line ~576-582 of `LiveCameraView.jsx`

---

### CAM-02: Agent status Card appears
> View: camera | Severity: CRITICAL | Deps: CAM-01

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Wait 3s for Card to animate in
3. Look for Card component (bg-black/30 backdrop-blur-2xl rounded-2xl)
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="backdrop-blur"]'); for (const c of cards) { if (c.className.includes('rounded-2xl') && c.querySelector('p')) return { found: true, text: c.querySelector('p')?.textContent?.substring(0, 80) }; } return { found: false }; })()`
4. Check for status label inside Card (uppercase text like "CONNECTING", "OFFLINE", etc.)
   - Evaluate JS: `(() => { const labels = document.querySelectorAll('span'); for (const s of labels) { const text = s.textContent?.trim(); if (['OFFLINE','CONNECTING','LISTENING','THINKING','VIEWING','READY','WEAK SIGNAL'].includes(text?.toUpperCase())) return { status: text }; } return { status: null }; })()`
5. Take screenshot
   - Take screenshot: `CAMERA-02-card.png`

**Assert:**
- Card element with backdrop-blur and rounded-2xl found --> PASS_CARD_VISIBLE
- Card contains text content --> PASS_CARD_TEXT
- Status label present (one of: Offline, Connecting, Listening, Thinking, Viewing, Ready, Weak Signal) --> PASS_STATUS_LABEL

**On Fail --> Diagnose:**
- No Card found --> Card component not rendered or `isVisible` prop false | check: `LiveCameraView.jsx` `showCard` state, `Card.jsx` opacity animation
- No status label --> `computeAgentStatus()` returning unexpected value | check: `Card.jsx` `AGENT_STATUS_CONFIG` keys, `computeAgentStatus` function

---

### CAM-03: Agent connection state
> View: camera | Severity: HIGH | Deps: CAM-02

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Wait 5s for agent connection attempt
3. Detect connection icon in top bar (Wifi/WifiOff/Loader2)
   - Evaluate JS: `(() => { const svgs = document.querySelectorAll('svg'); for (const svg of svgs) { const cls = svg.getAttribute('class') || ''; if (cls.includes('text-green-400') && svg.closest('[class*="absolute"]')) return 'connected'; if (cls.includes('text-red-400') && svg.closest('[class*="absolute"]')) return 'offline'; if (cls.includes('text-yellow-400') && svg.closest('[class*="absolute"]')) return 'weak'; if (cls.includes('animate-spin') && svg.closest('[class*="absolute"]')) return 'connecting'; } return 'unknown'; })()`
4. Read Card status label for state machine status
   - Evaluate JS: `(() => { const labels = document.querySelectorAll('span'); for (const s of labels) { const text = s.textContent?.trim()?.toUpperCase(); if (['OFFLINE','CONNECTING','LISTENING','THINKING','VIEWING','READY','WEAK SIGNAL'].includes(text)) return text; } return null; })()`
5. Verify status color matches expected mapping
   - Evaluate JS: `(() => { const labels = document.querySelectorAll('span'); for (const s of labels) { const text = s.textContent?.trim()?.toUpperCase(); const cls = s.className || ''; if (text === 'OFFLINE') return cls.includes('text-red-400'); if (text === 'CONNECTING') return cls.includes('text-blue-400'); if (text === 'LISTENING') return cls.includes('text-purple-400'); if (text === 'THINKING') return cls.includes('text-cyan-400'); if (text === 'VIEWING') return cls.includes('text-cyan-400'); if (text === 'READY') return cls.includes('text-green-400'); } return null; })()`
6. Take screenshot
   - Take screenshot: `CAMERA-03-status.png`

**Assert:**
- Connection icon detected (one of: connected, offline, weak, connecting) --> PASS_CONN_ICON
- Status label is a valid state --> PASS_STATUS_STATE
- Status color matches the state label --> PASS_STATUS_COLOR

**On Fail --> Diagnose:**
- Unknown connection icon --> SVG class names changed or icon rendering broken | check: LiveCameraView.jsx `connectionIcon` logic (lines ~101-109)
- Color mismatch --> `AGENT_STATUS_CONFIG` in `Card.jsx` out of sync with actual classes | check: `Card.jsx` lines 29-37

---

### CAM-04: Shutter button visible
> View: camera | Severity: CRITICAL | Deps: CAM-01

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Wait 2s
3. Find large circular shutter button (w-[5.5rem] h-[5.5rem] rounded-full)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('rounded-full') && (cls.includes('w-[5.5rem]') || cls.includes('w-\\[5\\.5rem\\]'))) return { found: true, disabled: b.disabled, rect: b.getBoundingClientRect() }; } return { found: false }; })()`
4. Verify button is in bottom-center area of viewport
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const rect = b.getBoundingClientRect(); if (rect.width > 70 && rect.height > 70 && rect.bottom > 700 && rect.left > 100 && rect.right < 290) return { centered: true, y: rect.top, width: rect.width }; } return { centered: false }; })()`
5. Verify inner white circle (the actual clickable area, bg-white rounded-full)
   - Evaluate JS: `(() => { const circles = document.querySelectorAll('.bg-white.rounded-full'); for (const c of circles) { const rect = c.getBoundingClientRect(); if (rect.width > 50 && rect.width < 90) return true; } return false; })()`
6. Take screenshot
   - Take screenshot: `CAMERA-04-shutter.png`

**Assert:**
- Shutter button found with correct size classes --> PASS_SHUTTER_EXISTS
- Button positioned in bottom-center of viewport --> PASS_SHUTTER_POSITION
- Inner white circle present --> PASS_SHUTTER_INNER

**On Fail --> Diagnose:**
- Button not found --> LiveCameraView bottom controls not rendering | check: `LiveCameraView.jsx` bottom controls section (line ~972)
- Wrong position --> CSS layout issue with absolute positioning | check: `z-30` container, `safe-area-top` offsets

---

### CAM-05: Single photo capture
> View: camera | Severity: HIGH | Deps: CAM-04

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Wait 3s for camera setup
3. Record media count before capture
   - Evaluate JS: `document.querySelectorAll('[class*="media-stack"], [class*="w-11"][class*="h-11"]').length`
4. Click the shutter button (large circular button)
   - Click: The large round shutter button in bottom center (white circle, approx 88px diameter)
5. Wait 1.5s for capture animation and thumbnail
6. Check for captured media stack (w-14 h-14 container with stacked thumbnails)
   - Evaluate JS: `(() => { const stacks = document.querySelectorAll('[class*="w-14"][class*="h-14"]'); for (const s of stacks) { if (s.querySelector('img') || s.querySelector('[class*="w-11"]')) return { hasStack: true }; } return { hasStack: false }; })()`
7. Check for count badge (yellow circle with number)
   - Evaluate JS: `(() => { const badges = document.querySelectorAll('.bg-yellow-500'); for (const b of badges) { const text = b.textContent?.trim(); if (text && !isNaN(text)) return { count: parseInt(text) }; } return { count: 0 }; })()`
8. Take screenshot
   - Take screenshot: `CAMERA-05-captured.png`

**Assert:**
- Media stack visible with thumbnail --> PASS_THUMBNAIL
- Count badge shows 1 --> PASS_COUNT_ONE

**On Fail --> Diagnose:**
- No thumbnail --> `capturePhotoFromVideo()` returned null (no video stream in headless) | check: Canvas capture fallback, `videoRef.current.videoWidth` value
- Count badge missing --> `setCapturedMedia` not updating state | check: `LiveCameraView.jsx` `handleShutterUp`/`handleShutterClick` logic

---

### CAM-06: Multi-photo capture
> View: camera | Severity: HIGH | Deps: CAM-05

**Steps:**
1. Continuing from CAM-05 state (1 photo already captured), or navigate fresh and capture once
2. Click shutter button again
   - Click: Shutter button (large circular, bottom center)
3. Wait 1.5s for second capture
4. Check count badge incremented
   - Evaluate JS: `(() => { const badges = document.querySelectorAll('.bg-yellow-500'); for (const b of badges) { const text = b.textContent?.trim(); if (text && !isNaN(text)) return { count: parseInt(text) }; } return { count: 0 }; })()`
5. Take screenshot
   - Take screenshot: `CAMERA-06-multi.png`

**Assert:**
- Count badge shows 2 (or greater than previous) --> PASS_COUNT_INCREMENT

**On Fail --> Diagnose:**
- Count still 1 --> Second capture failed; possible race condition with `capturePhotoFromVideo` | check: `pointerCapturedRef` guard, `handleShutterClick` fallback logic
- Count 0 --> All captured media lost | check: State reset logic, `setCapturedMedia` calls

---

### CAM-07: Done button appears after capture
> View: camera | Severity: MED | Deps: CAM-05

**Steps:**
1. Ensure at least 1 photo captured (from previous tests or capture fresh)
2. Look for Done button (green circle, w-14 h-14 rounded-full bg-green-500)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('bg-green-500') && cls.includes('rounded-full') && cls.includes('w-14')) return { found: true, disabled: b.disabled }; } return { found: false }; })()`
3. Verify Done button contains CheckCircle2 icon
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('bg-green-500') && b.querySelector('svg')) return true; } return false; })()`
4. Take screenshot
   - Take screenshot: `CAMERA-07-done.png`

**Assert:**
- Done button (green, w-14 h-14, rounded-full, bg-green-500) visible --> PASS_DONE_VISIBLE
- Done button contains SVG icon --> PASS_DONE_ICON
- Done button is enabled (not disabled) --> PASS_DONE_ENABLED

**On Fail --> Diagnose:**
- Done not visible --> `capturedMedia.length` is 0 despite captures; AnimatePresence exit animation stuck | check: `LiveCameraView.jsx` line ~1030 conditional render
- Done disabled --> Intention field visible but empty, triggering disabled state | check: `disabled` prop condition on Done button (line ~1038)

---

### CAM-08: Mic toggle
> View: camera | Severity: MED | Deps: CAM-01

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Wait 2s
3. Find mic toggle button (w-14 h-14 rounded-full, contains Mic or MicOff icon)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-14') && cls.includes('h-14') && cls.includes('rounded-full') && !cls.includes('bg-green') && !cls.includes('w-[5.5rem]') && b.querySelector('svg')) return { found: true, classes: cls.substring(0, 150) }; } return { found: false }; })()`
4. Detect initial mic state (purple = on, dim = off)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-14') && cls.includes('h-14') && cls.includes('rounded-full') && !cls.includes('bg-green') && !cls.includes('w-[5.5rem]')) { return { micOn: cls.includes('bg-purple') || cls.includes('text-purple'), classes: cls.substring(0, 200) }; } } return null; })()`
5. Click mic toggle button
   - Click: Mic toggle (w-14 h-14 circle, left of shutter)
6. Wait 500ms
7. Detect new mic state
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-14') && cls.includes('h-14') && cls.includes('rounded-full') && !cls.includes('bg-green') && !cls.includes('w-[5.5rem]')) { return { micOn: cls.includes('bg-purple') || cls.includes('text-purple') }; } } return null; })()`
8. Take screenshot
   - Take screenshot: `CAMERA-08-mic.png`

**Assert:**
- Mic button found (w-14 h-14 rounded-full with SVG) --> PASS_MIC_FOUND
- Mic state toggles between on (purple) and off (dim white) after click --> PASS_MIC_TOGGLE

**On Fail --> Diagnose:**
- Button not found --> Bottom controls layout changed | check: `LiveCameraView.jsx` line ~974 mic button
- State doesn't toggle --> `handleMicToggle` or `livekit.toggleMic()` not working | check: `LiveCameraView.jsx` `handleMicToggle()`, `useLiveKit.js` toggleMic implementation

---

## Suite 4: SESSION -- LiveSessionView

| ID      | Name                        | Severity | View         |
|---------|-----------------------------|----------|--------------|
| SESS-01 | Navigate to session         | CRITICAL | live-session |
| SESS-02 | Header shows intention      | HIGH     | live-session |
| SESS-03 | Photo gallery at top        | HIGH     | live-session |
| SESS-04 | Block timeline renders      | HIGH     | live-session |
| SESS-05 | Chat input at bottom        | CRITICAL | live-session |
| SESS-06 | Send message                | MED      | live-session |
| SESS-07 | Back navigation             | MED      | live-session |

---

### SESS-01: Navigate to session
> View: live-session | Severity: CRITICAL | Deps: CAM-07

**Steps:**
1. Navigate to camera view
   - Navigate to: `${BASE_URL}/`
2. Wait 3s for camera setup
3. Capture a photo (click shutter)
   - Click: Shutter button (large white circle, bottom center)
4. Wait 1.5s
5. Click Done button (green circle)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('bg-green-500') && cls.includes('rounded-full')) { b.click(); return true; } } return false; })()`
6. Wait 2s for session view to load
7. Verify session view rendered (look for ChevronLeft back button + centered title + chat input)
   - Evaluate JS: `(() => { const hasChatInput = !!document.querySelector('input[placeholder*="Ask"]'); const hasBackBtn = !!document.querySelector('svg'); const hasScrollArea = !!document.querySelector('[class*="overflow-y-auto"]'); return { hasChatInput, hasBackBtn, hasScrollArea }; })()`
8. Take screenshot
   - Take screenshot: `SESSION-01-navigate.png`

**Assert:**
- Session view loaded with chat input --> PASS_SESSION_LOADED
- Scrollable content area exists --> PASS_SCROLL_AREA

**On Fail --> Diagnose:**
- Session view not loaded --> `handleDone` or `onViewResult` callback failed; viewState not changing to 'live-session' | check: `LiveCameraView.jsx` `handleDone`, `App.jsx` `handleViewResult`
- No chat input --> LiveSessionView component render error | check: Browser console for React errors

---

### SESS-02: Header shows intention
> View: live-session | Severity: HIGH | Deps: SESS-01

**Steps:**
1. From session view (continuing SESS-01 or navigate fresh via capture+done)
2. Look for header with back button (ChevronLeft) and centered title
   - Evaluate JS: `(() => { const h1s = document.querySelectorAll('h1'); for (const h of h1s) { if (h.className.includes('text-center') || h.className.includes('absolute')) return { title: h.textContent?.trim(), classes: h.className }; } return null; })()`
3. Look for back button (p-2 rounded-full with ChevronLeft SVG)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('rounded-full') && cls.includes('bg-white/5') && b.querySelector('svg')) { const rect = b.getBoundingClientRect(); if (rect.left < 80 && rect.top < 80) return true; } } return false; })()`
4. Take screenshot
   - Take screenshot: `SESSION-02-header.png`

**Assert:**
- Header title element present (h1 with centered text) --> PASS_HEADER_TITLE
- Back button (ChevronLeft) in top-left area --> PASS_BACK_BUTTON

**On Fail --> Diagnose:**
- No title --> `intention` prop empty and `getShortTitle()` returning empty string | check: `LiveSessionView.jsx` header section (line ~817), `utils/text.js` getShortTitle
- No back button --> Header flex layout broken | check: `LiveSessionView.jsx` header JSX (line ~810)

---

### SESS-03: Photo gallery at top
> View: live-session | Severity: HIGH | Deps: SESS-01

**Steps:**
1. From session view with at least 1 captured photo
2. Look for image gallery area (horizontal scrollable strip)
   - Evaluate JS: `(() => { const scrollers = document.querySelectorAll('[class*="overflow-x-auto"][class*="snap-x"]'); for (const s of scrollers) { const imgs = s.querySelectorAll('img'); if (imgs.length > 0) return { found: true, imageCount: imgs.length }; } return { found: false, imageCount: 0 }; })()`
3. Check image source is valid (data URL or S3 URL)
   - Evaluate JS: `(() => { const imgs = document.querySelectorAll('[class*="snap-x"] img, [class*="snap-center"] img'); if (imgs.length === 0) return null; return { src: imgs[0]?.src?.substring(0, 50), count: imgs.length }; })()`
4. Take screenshot
   - Take screenshot: `SESSION-03-gallery.png`

**Assert:**
- Gallery strip with snap-x scroll found --> PASS_GALLERY_EXISTS
- At least 1 image in gallery --> PASS_GALLERY_IMAGES
- Image has valid src (data: or https://) --> PASS_IMAGE_SRC

**On Fail --> Diagnose:**
- No gallery --> `allPhotos` array empty; photos prop not passed correctly | check: `LiveSessionView.jsx` line ~773 `allPhotos` computation, `App.jsx` capturedPhotos state
- Images but no src --> S3 upload failed and data URL was garbage collected | check: S3 upload logs, `uploadToS3` function

---

### SESS-04: Block timeline renders
> View: live-session | Severity: HIGH | Deps: SESS-01

**Steps:**
1. From session view
2. Wait 5s for agent to potentially send blocks
3. Look for the block timeline container (overflow-y-auto scrollable area)
   - Evaluate JS: `(() => { const containers = document.querySelectorAll('[class*="overflow-y-auto"][class*="px-5"]'); for (const c of containers) { return { found: true, children: c.children.length, height: c.scrollHeight }; } return { found: false }; })()`
4. Check if blocks exist (bubbles or HTML blocks) or empty state
   - Evaluate JS: `(() => { const bubbles = document.querySelectorAll('[class*="mb-3"]'); const iframes = document.querySelectorAll('iframe[title="Agent content"]'); const emptyState = document.querySelector('[class*="py-20"]'); const sparkles = document.querySelector('.animate-pulse'); return { bubbleCount: bubbles.length, iframeCount: iframes.length, hasEmptyState: !!emptyState, hasSparkles: !!sparkles }; })()`
5. Take screenshot
   - Take screenshot: `SESSION-04-timeline.png`

**Assert:**
- Timeline container exists with overflow-y-auto --> PASS_TIMELINE_EXISTS
- Either blocks present (bubbles/iframes) OR empty state with "analyzing" message --> PASS_TIMELINE_CONTENT

**On Fail --> Diagnose:**
- No timeline container --> LiveSessionView layout broken | check: `LiveSessionView.jsx` line ~862 scrollable div
- No blocks and no empty state --> React render error in block rendering | check: Browser console, AnimatePresence errors

---

### SESS-05: Chat input at bottom
> View: live-session | Severity: CRITICAL | Deps: SESS-01

**Steps:**
1. From session view
2. Find chat input at bottom
   - Evaluate JS: `(() => { const input = document.querySelector('input[placeholder*="Ask anything"]'); if (!input) return { found: false }; const rect = input.getBoundingClientRect(); return { found: true, placeholder: input.placeholder, y: rect.top, width: rect.width }; })()`
3. Find send button (ArrowUp icon, right of input)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if ((cls.includes('bg-purple-500') || cls.includes('bg-white/[0.06]')) && cls.includes('w-9') && cls.includes('h-9') && cls.includes('rounded-full')) { const rect = b.getBoundingClientRect(); if (rect.top > 600) return { found: true, enabled: !b.disabled }; } } return { found: false }; })()`
4. Find + button (add photo/file, left side)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-9') && cls.includes('h-9') && cls.includes('rounded-full') && b.querySelector('svg')) { const rect = b.getBoundingClientRect(); if (rect.top > 600 && rect.left < 80) return true; } } return false; })()`
5. Find mic toggle in chat bar (small, w-7 h-7)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-7') && cls.includes('h-7') && cls.includes('rounded-full') && b.querySelector('svg')) return true; } return false; })()`
6. Take screenshot
   - Take screenshot: `SESSION-05-chat-input.png`

**Assert:**
- Text input with "Ask anything..." placeholder found --> PASS_CHAT_INPUT
- Send button found --> PASS_SEND_BUTTON
- Plus button found --> PASS_ADD_BUTTON
- Mic toggle found --> PASS_SESSION_MIC

**On Fail --> Diagnose:**
- No input --> LiveSessionView chat bar not rendering | check: `LiveSessionView.jsx` line ~1016 input element
- No send button --> Send button conditional rendering broken | check: `LiveSessionView.jsx` line ~1036 send button
- No mic --> Mic button inside input row missing | check: `LiveSessionView.jsx` line ~1027

---

### SESS-06: Send message
> View: live-session | Severity: MED | Deps: SESS-05

**Steps:**
1. From session view with chat input visible
2. Type a test message into the input
   - Click: Input field with "Ask anything..." placeholder
   - Type: `Hello test message`
3. Verify input has text
   - Evaluate JS: `document.querySelector('input[placeholder*="Ask anything"]')?.value`
4. Click send button or press Enter
   - Evaluate JS: `(() => { const input = document.querySelector('input[placeholder*="Ask anything"]'); if (input) { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; } return false; })()`
5. Wait 1s
6. Verify input cleared after send
   - Evaluate JS: `document.querySelector('input[placeholder*="Ask anything"]')?.value === ''`
7. Check for user bubble in timeline (role=user bubble with purple background)
   - Evaluate JS: `(() => { const ps = document.querySelectorAll('p[class*="bg-purple-500"]'); for (const p of ps) { if (p.textContent.includes('Hello test message')) return true; } return false; })()`
8. Take screenshot
   - Take screenshot: `SESSION-06-send.png`

**Assert:**
- Input clears after sending --> PASS_INPUT_CLEARED
- User message bubble appears in timeline --> PASS_USER_BUBBLE

**On Fail --> Diagnose:**
- Input not cleared --> `handleSendMessage` not calling `setChatText('')` | check: `LiveSessionView.jsx` `handleSendMessage` (line ~389)
- No bubble --> `upsertBlock` not adding user message block | check: `LiveSessionView.jsx` line ~393 user bubble creation

---

### SESS-07: Back navigation
> View: live-session | Severity: MED | Deps: SESS-01

**Steps:**
1. From session view
2. Click back button (ChevronLeft, top-left)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('rounded-full') && cls.includes('bg-white/5') && b.querySelector('svg')) { const rect = b.getBoundingClientRect(); if (rect.left < 80 && rect.top < 80) { b.click(); return true; } } } return false; })()`
3. Wait 1s for transition
4. Verify returned to Home/History view
   - Evaluate JS: `(() => { const h1s = document.querySelectorAll('h1'); for (const h of h1s) { if (h.textContent.includes('Home') || h.textContent.includes('History')) return true; } return false; })()`
5. Take screenshot
   - Take screenshot: `SESSION-07-back.png`

**Assert:**
- Home/History heading visible after back navigation --> PASS_BACK_TO_HOME

**On Fail --> Diagnose:**
- Still on session view --> `onBack` callback not firing or `handleBackToHistory` not setting viewState to 'home' | check: `LiveSessionView.jsx` back button onClick, `App.jsx` `handleBackToHistory`

---

## Suite 5: HOME -- HistoryView

| ID      | Name                | Severity | View |
|---------|---------------------|----------|------|
| HOME-01 | Task list renders   | CRITICAL | home |
| HOME-02 | Active task card    | HIGH     | home |
| HOME-03 | Completed task card | HIGH     | home |
| HOME-04 | Camera FAB          | HIGH     | home |
| HOME-05 | Mic FAB             | MED      | home |
| HOME-06 | Task deletion       | MED      | home |

---

### HOME-01: Task list renders
> View: home | Severity: CRITICAL | Deps: APP-02

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 3s for API fetch (GET /api/users/tasks, GET /api/users/sessions/by-device)
3. Look for task grid or empty state
   - Evaluate JS: `(() => { const grids = document.querySelectorAll('[class*="grid"][class*="grid-cols-2"]'); const empty = document.querySelector('p'); const loading = document.querySelector('.animate-spin'); if (loading) return { state: 'loading' }; if (grids.length > 0) return { state: 'has_tasks', gridCount: grids.length }; if (empty?.textContent?.includes('No tasks yet')) return { state: 'empty' }; return { state: 'unknown' }; })()`
4. Count task cards if present
   - Evaluate JS: `document.querySelectorAll('[class*="grid-cols-2"] > *').length`
5. Take screenshot
   - Take screenshot: `HOME-01-tasklist.png`

**Assert:**
- State is either 'has_tasks' or 'empty' (not stuck on 'loading') --> PASS_TASKS_LOADED
- If has_tasks: at least 1 task card visible --> PASS_TASK_CARDS

**On Fail --> Diagnose:**
- Stuck loading --> API call failed; `/api/users/tasks` or `/api/users/sessions/by-device` returning error | check: Network tab, API server logs, `vi-user-id` in localStorage
- Unknown state --> DOM structure changed in HistoryView | check: `HistoryView.jsx` grid layout (line ~529, ~556)

---

### HOME-02: Active task card
> View: home | Severity: HIGH | Deps: HOME-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 3s
3. Look for active task section ("Current Task" or "Current Tasks" heading)
   - Evaluate JS: `(() => { const headings = document.querySelectorAll('h2'); for (const h of headings) { if (h.textContent.includes('Current')) return { found: true, text: h.textContent }; } return { found: false }; })()`
4. Look for animated glow border (background with gradient animation)
   - Evaluate JS: `(() => { const glows = document.querySelectorAll('[class*="rounded-2xl"][class*="opacity-60"]'); return glows.length > 0; })()`
5. Look for progress bar in active card (bg-gradient-to-r from-cyan-500 to-purple-500)
   - Evaluate JS: `(() => { const bars = document.querySelectorAll('[class*="from-cyan-500"][class*="to-purple-500"]'); return bars.length > 0; })()`
6. Look for Sparkles icon and "Processing Now" or "Queued" label
   - Evaluate JS: `(() => { const spans = document.querySelectorAll('span'); for (const s of spans) { if (s.textContent.includes('Processing Now') || s.textContent.includes('Queued')) return { label: s.textContent }; } return null; })()`
7. Take screenshot
   - Take screenshot: `HOME-02-active.png`

**Assert:**
- Active task section found OR no active tasks (both valid) --> PASS_ACTIVE_SECTION
- If active tasks exist: glow border present AND status label visible --> PASS_ACTIVE_CARD_UI

**On Fail --> Diagnose:**
- Section heading wrong --> `activeTasks` filter not matching status values | check: `HistoryView.jsx` line ~454 filter for 'pending'/'progress'
- No glow --> `ActiveTaskCard` component gradient animation broken | check: `HistoryView.jsx` `ActiveTaskCard` (line ~127-138)

---

### HOME-03: Completed task card
> View: home | Severity: HIGH | Deps: HOME-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 3s
3. Look for "Recent Tasks" heading
   - Evaluate JS: `(() => { const headings = document.querySelectorAll('h2'); for (const h of headings) { if (h.textContent.includes('Recent Tasks')) return true; } return false; })()`
4. Look for completed task cards (aspect-[3/4] rounded-2xl with image or gradient)
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="aspect-"][class*="rounded-2xl"]'); return { count: cards.length, hasImage: cards.length > 0 && !!cards[0].querySelector('img') }; })()`
5. Verify card has title text and timestamp
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="aspect-"][class*="rounded-2xl"]'); if (cards.length === 0) return null; const card = cards[0]; const title = card.querySelector('p[class*="font-semibold"]')?.textContent; const time = card.querySelector('span[class*="text-white/40"]')?.textContent; return { title: title?.substring(0, 40), time }; })()`
6. Take screenshot
   - Take screenshot: `HOME-03-completed.png`

**Assert:**
- "Recent Tasks" heading visible OR no completed tasks --> PASS_RECENT_SECTION
- If tasks exist: cards have title and timestamp --> PASS_CARD_CONTENT

**On Fail --> Diagnose:**
- No cards --> `completedTasks` filter returning empty; status normalization wrong | check: `HistoryView.jsx` line ~455 filter for 'complete'/'error', session status mapping (line ~282)
- Missing title --> `getShortTitle` returning empty | check: `utils/text.js`, task `prompt` field

---

### HOME-04: Camera FAB
> View: home | Severity: HIGH | Deps: HOME-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 2s
3. Find Camera FAB (bottom-right, w-[4.5rem] h-[4.5rem] rounded-full bg-white)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('bg-white') && cls.includes('rounded-full') && (cls.includes('w-[4.5rem]') || cls.includes('w-\\[4\\.5rem\\]'))) { const rect = b.getBoundingClientRect(); return { found: true, x: rect.left, y: rect.top, width: rect.width, height: rect.height }; } } return { found: false }; })()`
4. Verify FAB is positioned bottom-right
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('bg-white') && cls.includes('rounded-full') && b.querySelector('svg')) { const rect = b.getBoundingClientRect(); if (rect.right > 300 && rect.bottom > 700) return true; } } return false; })()`
5. Click Camera FAB
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('bg-white') && cls.includes('rounded-full') && (cls.includes('w-[4.5rem]') || cls.includes('w-\\[4\\.5rem\\]'))) { b.click(); return true; } } return false; })()`
6. Wait 1s for transition
7. Verify navigated to camera view (video element or camera UI)
   - Evaluate JS: `!!(document.querySelector('video') || document.querySelector('.animate-spin'))`
8. Take screenshot
   - Take screenshot: `HOME-04-camera-fab.png`

**Assert:**
- Camera FAB found at bottom-right --> PASS_FAB_EXISTS
- Click navigates to camera view --> PASS_FAB_NAVIGATES

**On Fail --> Diagnose:**
- FAB not found --> HistoryView FAB button removed or class names changed | check: `HistoryView.jsx` line ~622 Camera FAB
- Doesn't navigate --> `onOpenCamera` callback not wired | check: `App.jsx` `handleOpenCamera`

---

### HOME-05: Mic FAB
> View: home | Severity: MED | Deps: HOME-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 2s
3. Find Mic FAB (bottom-left, w-16 h-16 rounded-full)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-16') && cls.includes('h-16') && cls.includes('rounded-full') && b.querySelector('svg')) { const rect = b.getBoundingClientRect(); if (rect.left < 100 && rect.bottom > 700) return { found: true, classes: cls.substring(0, 150) }; } } return { found: false }; })()`
4. Detect initial mic state
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-16') && cls.includes('h-16') && cls.includes('rounded-full')) { return { micEnabled: cls.includes('bg-white/10'), micDisabled: cls.includes('bg-red-500') }; } } return null; })()`
5. Click mic toggle
   - Click: Mic FAB (bottom-left round button)
6. Wait 500ms
7. Verify state changed
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-16') && cls.includes('h-16') && cls.includes('rounded-full') && b.querySelector('svg')) { const rect = b.getBoundingClientRect(); if (rect.left < 100 && rect.bottom > 700) return { classes: cls.substring(0, 150) }; } } return null; })()`
8. Take screenshot
   - Take screenshot: `HOME-05-mic-fab.png`

**Assert:**
- Mic FAB found at bottom-left --> PASS_MIC_FAB
- Mic state toggles on click --> PASS_MIC_TOGGLE

**On Fail --> Diagnose:**
- FAB not found --> HistoryView mic button class names changed | check: `HistoryView.jsx` line ~614 Mic Toggle FAB
- No toggle --> `livekit.toggleMic` not available or crashing | check: `useLiveKit.js` toggleMic, LiveKit connection state

---

### HOME-06: Task deletion
> View: home | Severity: MED | Deps: HOME-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 3s for tasks to load
3. Check that at least 1 task card exists
   - Evaluate JS: `document.querySelectorAll('[class*="grid-cols-2"] > *').length > 0`
4. If no tasks, skip this test (PASS with note "No tasks to delete")
5. Long-press (500ms) on first task card via pointer events
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="grid-cols-2"] > *'); if (cards.length === 0) return 'no_tasks'; const card = cards[0]; const rect = card.getBoundingClientRect(); const cx = rect.left + rect.width / 2; const cy = rect.top + rect.height / 2; card.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true })); return 'pressed'; })()`
6. Wait 600ms (long-press threshold is 500ms)
7. Fire pointerup
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="grid-cols-2"] > *'); if (cards.length === 0) return false; const card = cards[0]; card.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; })()`
8. Wait 500ms for bottom sheet
9. Check for delete confirmation bottom sheet
   - Evaluate JS: `(() => { const sheet = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-[60]"]'); if (!sheet) return { found: false }; const deleteBtn = sheet.querySelector('button.text-red-400') || sheet.querySelector('[class*="text-red-400"]'); const cancelBtn = sheet.querySelector('button'); return { found: true, hasDeleteBtn: !!deleteBtn, prompt: sheet.querySelector('p')?.textContent?.substring(0, 50) }; })()`
10. Take screenshot
    - Take screenshot: `HOME-06-delete.png`

**Assert:**
- Delete confirmation bottom sheet appears after long-press --> PASS_DELETE_SHEET
- Sheet contains "Delete" and "Cancel" buttons --> PASS_DELETE_BUTTONS
- Sheet shows "Delete this task?" prompt --> PASS_DELETE_PROMPT

**On Fail --> Diagnose:**
- No bottom sheet --> Long-press handler `handlePointerDown` not firing or timer not reaching 500ms | check: `HistoryView.jsx` lines ~221-228 long-press logic
- No delete button --> Bottom sheet JSX structure changed | check: `HistoryView.jsx` lines ~630-683 delete confirmation

---

## Suite 6: MEMORY -- MemoryView

| ID     | Name                | Severity | View   |
|--------|---------------------|----------|--------|
| MEM-01 | Navigate to memory  | CRITICAL | memory |
| MEM-02 | Memory file list    | HIGH     | memory |
| MEM-03 | Create new memory   | HIGH     | memory |
| MEM-04 | Edit memory         | MED      | memory |
| MEM-05 | Delete memory       | MED      | memory |

---

### MEM-01: Navigate to memory
> View: memory | Severity: CRITICAL | Deps: AUTH-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 2s
3. Click profile avatar button (top-right)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-12') && cls.includes('h-12') && cls.includes('rounded-full')) { const rect = b.getBoundingClientRect(); if (rect.right > 300 && rect.top < 100) { b.click(); return true; } } } return false; })()`
4. Wait 1s for transition
5. Verify MemoryView loaded (heading "Memory")
   - Evaluate JS: `(() => { const h1s = document.querySelectorAll('h1'); for (const h of h1s) { if (h.textContent.includes('Memory')) return true; } return false; })()`
6. Verify back button present
   - Evaluate JS: `!!document.querySelector('button svg')`
7. Verify "+ New" button present
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.textContent.includes('New')) return true; } return false; })()`
8. Take screenshot
   - Take screenshot: `MEMORY-01-navigate.png`

**Assert:**
- "Memory" heading visible --> PASS_MEMORY_HEADING
- Back button present --> PASS_BACK_BUTTON
- "+ New" button present --> PASS_NEW_BUTTON

**On Fail --> Diagnose:**
- Memory heading not found --> MemoryView not rendered; viewState not set to 'memory' | check: `App.jsx` `handleProfileTap`, MemoryView component
- No "+ New" --> MemoryView header changed | check: `MemoryView.jsx` line ~283 New button

---

### MEM-02: Memory file list
> View: memory | Severity: HIGH | Deps: MEM-01

**Steps:**
1. From MemoryView (navigate via profile tap)
2. Wait 3s for API fetch (GET /api/users/memory)
3. Check for file cards or empty state
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="bg-white/\\[0\\.04\\]"]'); const empty = document.querySelectorAll('p'); const loading = document.querySelector('.animate-spin'); if (loading) return { state: 'loading' }; if (cards.length > 0) return { state: 'has_files', count: cards.length }; for (const p of empty) { if (p.textContent.includes('No memories yet')) return { state: 'empty' }; } return { state: 'unknown', cardCount: cards.length }; })()`
4. If files exist, verify card structure (filename, Edit, Delete buttons)
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="rounded-2xl"][class*="border"]'); for (const c of cards) { const hasEdit = !!Array.from(c.querySelectorAll('button')).find(b => b.textContent.includes('Edit')); const hasDelete = !!Array.from(c.querySelectorAll('button')).find(b => b.textContent.includes('Delete')); const filename = c.querySelector('[class*="text-white/90"]')?.textContent; if (hasEdit || hasDelete) return { filename: filename?.substring(0, 30), hasEdit, hasDelete }; } return null; })()`
5. Take screenshot
   - Take screenshot: `MEMORY-02-list.png`

**Assert:**
- State is 'has_files' or 'empty' (not loading) --> PASS_FILES_LOADED
- If has_files: card has filename, Edit button, Delete button --> PASS_CARD_STRUCTURE

**On Fail --> Diagnose:**
- Stuck loading --> `/api/users/memory` or `/api/users/memory/by-device` failed | check: API server memory endpoints, vi_user_id
- Missing buttons --> MemoryCard component structure changed | check: `MemoryView.jsx` `MemoryCard` component (lines ~10-52)

---

### MEM-03: Create new memory
> View: memory | Severity: HIGH | Deps: MEM-01

**Steps:**
1. From MemoryView
2. Click "+ New" button
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.textContent.includes('New')) { b.click(); return true; } } return false; })()`
3. Wait 500ms for edit mode to appear
4. Verify edit mode (filename input + content textarea + Save button)
   - Evaluate JS: `(() => { const filenameInput = document.querySelector('input[placeholder*="memory-name"]'); const textarea = document.querySelector('textarea[placeholder*="Write your memory"]'); const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save')); return { hasFilenameInput: !!filenameInput, hasTextarea: !!textarea, hasSaveBtn: !!saveBtn }; })()`
5. Fill in filename
   - Click: Filename input field
   - Type: `test-memory`
   - Evaluate JS: `(() => { const input = document.querySelector('input[placeholder*="memory-name"]'); if (input) { const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; nativeInputValueSetter.call(input, 'test-memory'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; } return false; })()`
6. Fill in content
   - Click: Content textarea
   - Type: `This is a test memory entry created by QA.`
   - Evaluate JS: `(() => { const ta = document.querySelector('textarea[placeholder*="Write your memory"]'); if (ta) { const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; nativeTextAreaValueSetter.call(ta, 'This is a test memory entry created by QA.'); ta.dispatchEvent(new Event('input', { bubbles: true })); return true; } return false; })()`
7. Click Save
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.textContent.includes('Save') && !b.disabled) { b.click(); return true; } } return false; })()`
8. Wait 2s for save + list refresh
9. Verify returned to file list and new file appears
   - Evaluate JS: `(() => { const texts = document.querySelectorAll('[class*="text-white/90"]'); for (const t of texts) { if (t.textContent.includes('test-memory')) return true; } return false; })()`
10. Take screenshot
    - Take screenshot: `MEMORY-03-create.png`

**Assert:**
- Edit mode has filename input, textarea, Save button --> PASS_EDIT_MODE
- After save, file "test-memory" appears in list --> PASS_FILE_CREATED

**On Fail --> Diagnose:**
- Edit mode missing elements --> `handleNew` not setting editing state | check: `MemoryView.jsx` `handleNew` (line ~127), edit mode render (line ~171)
- Save failed --> API PUT /api/users/memory endpoint error | check: API server logs, memory_center service
- File not in list --> `loadFiles()` not called after save | check: `handleSave` (line ~136) `await loadFiles()` call

---

### MEM-04: Edit memory
> View: memory | Severity: MED | Deps: MEM-03

**Steps:**
1. From MemoryView with at least 1 file (from MEM-03)
2. Find an "Edit" button on a card and click it
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.textContent.trim() === 'Edit') { b.click(); return true; } } return false; })()`
3. Wait 1s for edit mode
4. Verify edit mode loaded with existing content
   - Evaluate JS: `(() => { const ta = document.querySelector('textarea'); if (!ta) return { found: false }; return { found: true, hasContent: ta.value.length > 0, content: ta.value.substring(0, 50) }; })()`
5. Modify content
   - Evaluate JS: `(() => { const ta = document.querySelector('textarea'); if (!ta) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(ta, ta.value + ' EDITED'); ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`
6. Click Save
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.textContent.includes('Save') && !b.disabled) { b.click(); return true; } } return false; })()`
7. Wait 2s
8. Take screenshot
   - Take screenshot: `MEMORY-04-edit.png`

**Assert:**
- Edit mode opens with pre-filled content --> PASS_EDIT_PREFILLED
- Content can be modified and saved --> PASS_EDIT_SAVED

**On Fail --> Diagnose:**
- No content pre-filled --> `handleEdit` not fetching file content via `api.getMemory()` | check: `MemoryView.jsx` `handleEdit` (line ~114)
- Save fails --> PUT endpoint error | check: `/api/users/memory/{filename}` endpoint

---

### MEM-05: Delete memory
> View: memory | Severity: MED | Deps: MEM-03

**Steps:**
1. From MemoryView with at least 1 file
2. Count files before deletion
   - Evaluate JS: `document.querySelectorAll('[class*="bg-white/\\[0\\.04\\]"]').length`
3. Click "Delete" button on a card
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.textContent.trim() === 'Delete') { b.click(); return true; } } return false; })()`
4. Wait 500ms for confirmation bottom sheet
5. Verify delete confirmation dialog
   - Evaluate JS: `(() => { const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]'); if (!overlay) return { found: false }; const deleteBtn = Array.from(overlay.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delete'); const cancelBtn = Array.from(overlay.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel'); return { found: true, hasDeleteBtn: !!deleteBtn, hasCancelBtn: !!cancelBtn }; })()`
6. Click "Delete" in confirmation
   - Evaluate JS: `(() => { const overlay = document.querySelector('[class*="fixed"][class*="inset-0"][class*="z-50"]'); if (!overlay) return false; const btns = overlay.querySelectorAll('button'); for (const b of btns) { if (b.textContent.trim() === 'Delete' && b.className.includes('text-red-400')) { b.click(); return true; } } return false; })()`
7. Wait 2s for deletion + list refresh
8. Count files after deletion
   - Evaluate JS: `document.querySelectorAll('[class*="bg-white/\\[0\\.04\\]"]').length`
9. Take screenshot
   - Take screenshot: `MEMORY-05-delete.png`

**Assert:**
- Delete confirmation bottom sheet appears --> PASS_DELETE_CONFIRM
- File count decreases after deletion --> PASS_FILE_DELETED

**On Fail --> Diagnose:**
- No confirmation --> `handleDelete` not setting `deleting` state | check: `MemoryView.jsx` `handleDelete` (line ~154)
- File not removed --> `confirmDelete` API call failed or `loadFiles()` not refreshing | check: `MemoryView.jsx` `confirmDelete` (line ~158), DELETE endpoint

---

## Suite 7: NAVIGATION -- Round-trip Flows

| ID     | Name                              | Severity | View     |
|--------|-----------------------------------|----------|----------|
| NAV-01 | Camera -> Session -> Home         | CRITICAL | multiple |
| NAV-02 | Home -> Camera FAB -> Camera      | CRITICAL | multiple |
| NAV-03 | Home -> Memory -> Home            | HIGH     | multiple |
| NAV-04 | Multiple round-trips (stability)  | MED      | multiple |

---

### NAV-01: Camera -> Done -> Session -> Back -> Home
> View: multiple | Severity: CRITICAL | Deps: CAM-04, SESS-01

**Steps:**
1. Navigate to camera
   - Navigate to: `${BASE_URL}/`
2. Wait 3s
3. Capture photo
   - Click: Shutter button
4. Wait 1.5s
5. Click Done
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.className.includes('bg-green-500') && b.className.includes('rounded-full')) { b.click(); return true; } } return false; })()`
6. Wait 2s -- verify session view
   - Evaluate JS: `!!document.querySelector('input[placeholder*="Ask anything"]')`
7. Take screenshot: `NAV-01-session.png`
8. Click back button in session
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('rounded-full') && cls.includes('bg-white/5') && b.querySelector('svg')) { const rect = b.getBoundingClientRect(); if (rect.left < 80 && rect.top < 80) { b.click(); return true; } } } return false; })()`
9. Wait 1s -- verify home view
   - Evaluate JS: `(() => { const h1s = document.querySelectorAll('h1'); for (const h of h1s) { if (h.textContent.includes('Home')) return true; } return false; })()`
10. Take screenshot: `NAV-01-home.png`

**Assert:**
- Session view loads after Done (chat input visible) --> PASS_TO_SESSION
- Home view loads after Back (Home heading visible) --> PASS_TO_HOME

**On Fail --> Diagnose:**
- Session not loaded --> `handleViewResult` or viewState transition failed | check: `App.jsx` viewState management
- Home not loaded --> `handleBackToHistory` failed | check: `App.jsx` `handleBackToHistory`

---

### NAV-02: Home -> Camera FAB -> Camera
> View: multiple | Severity: CRITICAL | Deps: HOME-04

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 2s
3. Click Camera FAB
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('bg-white') && cls.includes('rounded-full') && (cls.includes('w-[4.5rem]') || cls.includes('w-\\[4\\.5rem\\]'))) { b.click(); return true; } } return false; })()`
4. Wait 2s
5. Verify camera view active (video element or shutter button)
   - Evaluate JS: `!!(document.querySelector('video') || document.querySelector('[class*="w-\\[5\\.5rem\\]"]'))`
6. Take screenshot
   - Take screenshot: `NAV-02-camera.png`

**Assert:**
- Camera view active with video or shutter button --> PASS_CAMERA_RESUME

**On Fail --> Diagnose:**
- Not on camera --> `handleOpenCamera` not setting viewState to 'camera' | check: `App.jsx` `handleOpenCamera`

---

### NAV-03: Home -> Profile -> Memory -> Back -> Home
> View: multiple | Severity: HIGH | Deps: MEM-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 2s
3. Click profile avatar
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('w-12') && cls.includes('h-12') && cls.includes('rounded-full')) { const rect = b.getBoundingClientRect(); if (rect.right > 300 && rect.top < 100) { b.click(); return true; } } } return false; })()`
4. Wait 1s -- verify Memory view
   - Evaluate JS: `(() => { const h1s = document.querySelectorAll('h1'); for (const h of h1s) { if (h.textContent.includes('Memory')) return true; } return false; })()`
5. Take screenshot: `NAV-03-memory.png`
6. Click back button (ChevronLeft)
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.querySelector('svg')) { const rect = b.getBoundingClientRect(); if (rect.left < 80 && rect.top < 80) { b.click(); return true; } } } return false; })()`
7. Wait 1s -- verify Home view
   - Evaluate JS: `(() => { const h1s = document.querySelectorAll('h1'); for (const h of h1s) { if (h.textContent.includes('Home')) return true; } return false; })()`
8. Take screenshot: `NAV-03-back.png`

**Assert:**
- Memory view loads after profile tap --> PASS_TO_MEMORY
- Home view loads after back --> PASS_BACK_TO_HOME

**On Fail --> Diagnose:**
- Memory not loaded --> `handleProfileTap` or viewState transition broken | check: `App.jsx` `handleProfileTap`
- Home not loaded --> MemoryView `onBack` not calling `handleBackToHistory` | check: `MemoryView.jsx` `onBack` prop, `App.jsx` wiring

---

### NAV-04: Multiple round-trips without degradation
> View: multiple | Severity: MED | Deps: NAV-01

**Steps:**
1. Record initial JS heap size
   - Evaluate JS: `performance.memory ? performance.memory.usedJSHeapSize : null`
2. Perform 3 capture-session-back cycles:
   - **Cycle 1-3:** Navigate to `/`, wait 2s, click shutter, wait 1.5s, click Done, wait 2s, click back, wait 1s
   - Evaluate JS for each cycle: `(() => { /* This is a manual multi-step test — execute each sub-step separately */ return 'cycle_n_complete'; })()`
3. Record final JS heap size
   - Evaluate JS: `performance.memory ? performance.memory.usedJSHeapSize : null`
4. Calculate heap growth
   - Compare initial vs final heap size
5. Check for console errors accumulated
   - Evaluate JS: `window.__qa_errors ? window.__qa_errors.length : 'not_tracked'`
6. Take screenshot
   - Take screenshot: `NAV-04-stability.png`

**Assert:**
- All 3 cycles complete without crash --> PASS_STABILITY
- Heap growth < 50MB over 3 cycles (if `performance.memory` available) --> PASS_MEMORY_STABLE
- No console errors during cycles --> PASS_NO_ERRORS

**On Fail --> Diagnose:**
- Crash during cycle --> Memory leak or event listener accumulation | check: `useEffect` cleanup functions, LiveKit track detach, `sessionCacheRef` eviction
- Heap growing > 50MB --> Possible iframe/canvas leak | check: `PersistentHtmlRenderer` cleanup, `StaticHtmlBlock` iframe disposal, captured media blob URLs

---

## Suite 8: DATA-CHANNEL -- Communication Verification

| ID    | Name                      | Severity | View         |
|-------|---------------------------|----------|--------------|
| DC-01 | Agent transcript updates  | CRITICAL | camera       |
| DC-02 | Gateway streaming         | HIGH     | live-session |
| DC-03 | Action card from agent    | HIGH     | camera       |
| DC-04 | SSE fallback              | MED      | home         |

---

### DC-01: Agent transcript updates Card text
> View: camera | Severity: CRITICAL | Deps: CAM-02

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Record initial Card text
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="backdrop-blur"]'); for (const c of cards) { if (c.className.includes('rounded-2xl')) return c.querySelector('p')?.textContent; } return null; })()`
3. Wait 10s for agent to connect and send transcript
4. Record Card text again
   - Evaluate JS: `(() => { const cards = document.querySelectorAll('[class*="backdrop-blur"]'); for (const c of cards) { if (c.className.includes('rounded-2xl')) return c.querySelector('p')?.textContent; } return null; })()`
5. Compare initial vs current text
6. Take screenshot
   - Take screenshot: `DC-01-transcript.png`

**Assert:**
- Card text changed from initial "Connecting to AI..." to agent transcript --> PASS_TRANSCRIPT_UPDATE
- OR: Card still shows connection text (agent not available) -- note this as SKIP with reason

**On Fail --> Diagnose:**
- Text never changes --> Agent not connecting or `livekit.lastAgentText` not updating | check: `useLiveKit.js` agent text handling, LiveKit room connection, agent process running
- Card disappears --> `showCard` set to false | check: `LiveCameraView.jsx` Card visibility logic

---

### DC-02: Gateway streaming
> View: live-session | Severity: HIGH | Deps: SESS-01

**Steps:**
1. Navigate to camera, capture photo, click Done to reach session view
2. Wait 15s for gateway to dispatch and stream results
3. Check for HTML block iframes in session timeline
   - Evaluate JS: `(() => { const iframes = document.querySelectorAll('iframe[title="Agent content"]'); return { count: iframes.length }; })()`
4. Check for streaming progress bar (animated gradient bar at top of block)
   - Evaluate JS: `(() => { const bars = document.querySelectorAll('[class*="bg-gradient-to-r"][class*="from-purple-500"]'); return bars.length > 0; })()`
5. Check for "preparing..." or "streaming..." text
   - Evaluate JS: `(() => { const spans = document.querySelectorAll('span'); for (const s of spans) { const text = s.textContent.toLowerCase(); if (text.includes('preparing') || text.includes('streaming') || text.includes('loading')) return { status: text }; } return null; })()`
6. Take screenshot
   - Take screenshot: `DC-02-streaming.png`

**Assert:**
- HTML blocks appear (iframes > 0) OR streaming status visible --> PASS_GATEWAY_ACTIVE
- OR: Empty state with "analyzing" spinner (gateway pending) -- note as PARTIAL

**On Fail --> Diagnose:**
- No blocks and no spinner --> `livekit.sendDispatchTask` failed or gateway not reachable | check: LiveKit RPC dispatch, gateway service health, `task_dispatcher.py`
- Blocks appear but empty --> iframe srcDoc not set correctly | check: `StaticHtmlBlock` wrappedHtml construction, `ActiveHtmlBlock` PersistentHtmlRenderer

---

### DC-03: Action card from agent
> View: camera | Severity: HIGH | Deps: DC-01

**Steps:**
1. Navigate to camera view
   - Navigate to: `${BASE_URL}/`
2. Wait 10s for agent to potentially send an action card
3. Check for action card overlay (bg-neutral-900/90 rounded-2xl with options)
   - Evaluate JS: `(() => { const overlays = document.querySelectorAll('[class*="bg-neutral-900/90"][class*="rounded-2xl"]'); for (const o of overlays) { const title = o.querySelector('p[class*="font-medium"]')?.textContent; const options = o.querySelectorAll('button[class*="bg-purple-500/20"]'); if (options.length > 0) return { found: true, title, optionCount: options.length }; } return { found: false }; })()`
4. If action card found, click an option
   - Evaluate JS: `(() => { const options = document.querySelectorAll('button[class*="bg-purple-500/20"]'); if (options.length > 0) { options[0].click(); return { clicked: options[0].textContent }; } return null; })()`
5. Take screenshot
   - Take screenshot: `DC-03-action-card.png`

**Assert:**
- Action card renders with title and clickable options --> PASS_ACTION_CARD
- OR: No action card (agent did not send one) -- note as SKIP with reason "Agent-dependent"

**On Fail --> Diagnose:**
- Action card visible but options don't click --> `handleActionCardOption` not wired | check: `LiveCameraView.jsx` line ~542
- Overlay stuck after click --> `livekit.dismissActionCard()` not clearing state | check: `useLiveKit.js` dismissActionCard

---

### DC-04: SSE fallback
> View: home | Severity: MED | Deps: HOME-01

**Steps:**
1. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
2. Wait 2s
3. Check if SSE connection would be attempted (vi-user-id exists and LiveKit is disconnected)
   - Evaluate JS: `(() => { const viUserId = localStorage.getItem('vi-user-id'); return { viUserId: !!viUserId, id: viUserId?.substring(0, 10) }; })()`
4. Verify SSE endpoint is available
   - Evaluate JS: `(() => { const viUserId = localStorage.getItem('vi-user-id'); if (!viUserId) return 'no_user_id'; return fetch('/api/users/events?vi_user_id=' + encodeURIComponent(viUserId), { method: 'GET', headers: { 'Accept': 'text/event-stream' } }).then(r => ({ status: r.status, ok: r.ok, type: r.headers.get('content-type') })).catch(e => ({ error: e.message })); })()`
5. Take screenshot
   - Take screenshot: `DC-04-sse.png`

**Assert:**
- vi-user-id exists in localStorage --> PASS_USER_ID
- SSE endpoint returns 200 with text/event-stream content type --> PASS_SSE_ENDPOINT

**On Fail --> Diagnose:**
- No vi-user-id --> Anonymous LiveKit token flow never completed | check: `api.getAnonymousLiveKitToken()`, `/api/livekit/anonymous` endpoint
- SSE endpoint error --> Events route not registered or Redis not connected | check: `api-server/app/routes/events.py`, Redis connection

---

## Suite 9: ERROR-HANDLING -- Edge Cases

| ID     | Name                       | Severity | View   |
|--------|----------------------------|----------|--------|
| ERR-01 | Agent disconnect graceful  | CRITICAL | camera |
| ERR-02 | Rapid button tapping       | HIGH     | camera |
| ERR-03 | Console error-free         | HIGH     | -      |
| ERR-04 | Empty Done prevented       | MED      | camera |

---

### ERR-01: Agent disconnect graceful
> View: camera | Severity: CRITICAL | Deps: CAM-02

**Steps:**
1. Navigate to camera view
   - Navigate to: `${BASE_URL}/`
2. Wait 3s for initial state
3. Record current Card status
   - Evaluate JS: `(() => { const labels = document.querySelectorAll('span'); for (const s of labels) { const text = s.textContent?.trim()?.toUpperCase(); if (['OFFLINE','CONNECTING','LISTENING','THINKING','VIEWING','READY','WEAK SIGNAL'].includes(text)) return text; } return null; })()`
4. Verify no crash indicators (ErrorBoundary, white screen, blank page)
   - Evaluate JS: `(() => { const root = document.getElementById('root'); if (!root || root.children.length === 0) return 'blank_page'; const bodyText = document.body.textContent || ''; if (bodyText.includes('Something went wrong') || bodyText.includes('Error')) return 'error_boundary'; return 'ok'; })()`
5. Check Card shows appropriate offline/reconnecting state rather than crashing
   - Evaluate JS: `(() => { const cardText = (() => { const cards = document.querySelectorAll('[class*="backdrop-blur"]'); for (const c of cards) { if (c.className.includes('rounded-2xl')) return c.querySelector('p')?.textContent; } return null; })(); return { cardText: cardText?.substring(0, 60), hasUI: document.querySelectorAll('button').length > 0 }; })()`
6. Take screenshot
   - Take screenshot: `ERR-01-disconnect.png`

**Assert:**
- Page not blank or error boundary --> PASS_NO_CRASH
- Card shows status text (any valid state) --> PASS_GRACEFUL_STATE
- UI remains interactive (buttons present) --> PASS_UI_INTACT

**On Fail --> Diagnose:**
- Blank page --> Unhandled error in LiveKit connection lifecycle | check: `useLiveKit.js` error handling, `ErrorBoundary.jsx`
- Error boundary triggered --> React component threw during render | check: Browser console stack trace, ErrorBoundary component

---

### ERR-02: Rapid button tapping
> View: camera | Severity: HIGH | Deps: CAM-04

**Steps:**
1. Navigate to camera view
   - Navigate to: `${BASE_URL}/`
2. Wait 3s
3. Set up console error tracking
   - Evaluate JS: `window.__qa_errors = []; window.__qa_origError = console.error; console.error = function() { window.__qa_errors.push(Array.from(arguments).join(' ')); window.__qa_origError.apply(console, arguments); }; true`
4. Rapidly click shutter 5 times with minimal delay
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); let shutter = null; for (const b of btns) { if (b.className.includes('rounded-full') && (b.className.includes('w-[5.5rem]') || b.className.includes('w-\\[5\\.5rem\\]'))) { shutter = b; break; } } if (!shutter) return 'shutter_not_found'; for (let i = 0; i < 5; i++) { shutter.click(); } return 'clicked_5_times'; })()`
5. Wait 3s for all animations to settle
6. Check for errors
   - Evaluate JS: `({ errorCount: window.__qa_errors.length, errors: window.__qa_errors.slice(0, 3) })`
7. Check page is still functional
   - Evaluate JS: `document.querySelectorAll('button').length > 0`
8. Restore console.error
   - Evaluate JS: `if (window.__qa_origError) console.error = window.__qa_origError; true`
9. Take screenshot
   - Take screenshot: `ERR-02-rapid.png`

**Assert:**
- No fatal errors (page still functional with buttons) --> PASS_NO_CRASH
- Error count is 0 or only non-critical warnings --> PASS_NO_ERRORS

**On Fail --> Diagnose:**
- Crash --> Race condition in `handleShutterClick`/`handleShutterUp` or `capturePhotoFromVideo` | check: `pointerCapturedRef` guard, `isLongPressRef` guard
- Console errors --> Unhandled promise rejection or state update on unmounted component | check: Browser console details

---

### ERR-03: Console error-free
> View: - | Severity: HIGH | Deps: APP-02

**Steps:**
1. Install console error listener before page load
   - Evaluate JS: `window.__qa_page_errors = []; window.addEventListener('error', (e) => { window.__qa_page_errors.push({ message: e.message, source: e.filename, line: e.lineno }); }); window.addEventListener('unhandledrejection', (e) => { window.__qa_page_errors.push({ message: 'Unhandled rejection: ' + e.reason }); }); true`
2. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
3. Wait 5s for full initialization
4. Navigate to /home
   - Navigate to: `${BASE_URL}/home`
5. Wait 3s
6. Navigate back to /
   - Navigate to: `${BASE_URL}/`
7. Wait 3s
8. Check accumulated errors
   - Evaluate JS: `({ count: window.__qa_page_errors.length, errors: window.__qa_page_errors.slice(0, 5) })`
9. Take screenshot
   - Take screenshot: `ERR-03-console.png`

**Assert:**
- Zero `[PAGE_ERROR]` entries during normal navigation flow --> PASS_CLEAN_CONSOLE
- OR: Only expected warnings (e.g., WebSocket reconnect, getUserMedia denied) --> PASS_EXPECTED_ONLY

**On Fail --> Diagnose:**
- Unhandled rejections --> Async code missing `.catch()` | check: Specific error message for source file
- Render errors --> React component throwing | check: Stack trace in error details

---

### ERR-04: Empty Done prevented
> View: camera | Severity: MED | Deps: CAM-04

**Steps:**
1. Navigate to camera view
   - Navigate to: `${BASE_URL}/`
2. Wait 2s
3. Verify Done button is NOT visible when no photos captured
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { const cls = b.className || ''; if (cls.includes('bg-green-500') && cls.includes('rounded-full') && cls.includes('w-14')) return { visible: true }; } return { visible: false }; })()`
4. Verify the Done button container exists but is empty (AnimatePresence hiding it)
   - Evaluate JS: `(() => { const containers = document.querySelectorAll('.w-14.h-14'); for (const c of containers) { if (!c.className.includes('bg-') && c.children.length === 0) return { emptyContainer: true }; } return { emptyContainer: false }; })()`
5. Take screenshot
   - Take screenshot: `ERR-04-empty-done.png`

**Assert:**
- Done button NOT visible when capturedMedia is empty --> PASS_DONE_HIDDEN

**On Fail --> Diagnose:**
- Done visible with no photos --> `capturedMedia.length > 0` condition broken in AnimatePresence | check: `LiveCameraView.jsx` line ~1030 conditional

---

## Suite 10: PERFORMANCE -- Timing

| ID      | Name                     | Severity | View   |
|---------|--------------------------|----------|--------|
| PERF-01 | Initial load < 3s        | CRITICAL | -      |
| PERF-02 | Agent connection < 5s    | CRITICAL | camera |
| PERF-03 | Photo capture < 200ms    | HIGH     | camera |
| PERF-04 | Done -> Session < 500ms  | HIGH     | camera |
| PERF-05 | Memory stable            | MED      | camera |

---

### PERF-01: Initial load < 3s
> View: - | Severity: CRITICAL | Deps: none

**Steps:**
1. Clear browser cache/storage
   - Evaluate JS: `sessionStorage.clear(); true`
2. Record start time
   - Evaluate JS: `window.__qa_loadStart = Date.now(); true`
3. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
4. Wait for React mount (splash hidden)
   - Evaluate JS: `new Promise(r => { const check = () => { const splash = document.getElementById('splash'); const root = document.getElementById('root'); if ((!splash || getComputedStyle(splash).opacity === '0') && root?.children.length > 0) { r(Date.now()); } else { setTimeout(check, 100); } }; check(); setTimeout(() => r(Date.now()), 5000); })`
5. Measure via Navigation Timing API
   - Evaluate JS: `(() => { const nav = performance.getEntriesByType('navigation')[0]; return { domInteractive: Math.round(nav?.domInteractive), domContentLoaded: Math.round(nav?.domContentLoadedEventEnd), loadEvent: Math.round(nav?.loadEventEnd) }; })()`
6. Take screenshot
   - Take screenshot: `PERF-01-load.png`

**Assert:**
- `domInteractive` < 3000ms --> PASS_DOM_INTERACTIVE
- `domContentLoaded` < 4000ms --> PASS_DCL

**On Fail --> Diagnose:**
- domInteractive > 3000 --> Large bundle size or render-blocking resources | check: Vite build output, chunk splitting, font loading strategy
- DCL > 4000 --> Heavy initialization (LiveKit SDK, WebSocket connections) | check: Dynamic import strategy, lazy loading

---

### PERF-02: Agent connection < 5s
> View: camera | Severity: CRITICAL | Deps: APP-02

**Steps:**
1. Navigate to base URL
   - Navigate to: `${BASE_URL}/`
2. Record start time
   - Evaluate JS: `window.__qa_connStart = Date.now(); true`
3. Poll for agent identity in Card (max 10s)
   - Evaluate JS: `new Promise(r => { const check = () => { const labels = document.querySelectorAll('span'); for (const s of labels) { const text = s.textContent?.trim()?.toUpperCase(); if (['LISTENING','THINKING','VIEWING','READY'].includes(text)) { r({ connected: true, status: text, elapsed: Date.now() - window.__qa_connStart }); return; } } setTimeout(check, 500); }; check(); setTimeout(() => r({ connected: false, elapsed: Date.now() - window.__qa_connStart }), 10000); })`
4. Take screenshot
   - Take screenshot: `PERF-02-connection.png`

**Assert:**
- Agent reaches a connected state (LISTENING/THINKING/VIEWING/READY) within 5000ms --> PASS_AGENT_CONN
- OR: Agent connects within 10s but > 5s --> WARN_SLOW_CONN (note elapsed time)
- OR: Agent never connects within 10s --> SKIP_NO_AGENT (environment-dependent)

**On Fail --> Diagnose:**
- Status stays CONNECTING > 5s --> LiveKit token exchange or room join slow | check: `/api/livekit/anonymous` response time, LiveKit server health
- Status stays OFFLINE --> Agent process not running or room mismatch | check: `realtime/src/agent.py`, LiveKit room configuration

---

### PERF-03: Photo capture < 200ms
> View: camera | Severity: HIGH | Deps: CAM-04

**Steps:**
1. Navigate to camera view
   - Navigate to: `${BASE_URL}/`
2. Wait 3s for camera setup
3. Record pre-capture timestamp
   - Evaluate JS: `window.__qa_captureStart = Date.now(); true`
4. Click shutter
   - Click: Shutter button
5. Detect capture animation (white flash overlay with bg-white class)
   - Evaluate JS: `new Promise(r => { const check = () => { const flash = document.querySelector('.bg-white.pointer-events-none, [class*="bg-white"][class*="inset-0"]'); if (flash) { r({ detected: true, elapsed: Date.now() - window.__qa_captureStart }); } else { setTimeout(check, 20); } }; check(); setTimeout(() => r({ detected: false, elapsed: Date.now() - window.__qa_captureStart }), 2000); })`
6. Take screenshot
   - Take screenshot: `PERF-03-capture.png`

**Assert:**
- Capture animation (flash) detected within 200ms of shutter tap --> PASS_CAPTURE_SPEED
- OR: Detected within 500ms --> WARN_SLOW_CAPTURE

**On Fail --> Diagnose:**
- No flash detected --> `showCaptureAnim` state not being set | check: `LiveCameraView.jsx` `handleShutterUp` line ~428
- Slow (> 200ms) --> Canvas capture from video taking too long | check: `capturePhotoFromVideo` function, video resolution

---

### PERF-04: Done -> Session < 500ms
> View: camera | Severity: HIGH | Deps: CAM-07

**Steps:**
1. From camera with captured photo(s)
2. Record timestamp before clicking Done
   - Evaluate JS: `window.__qa_doneStart = Date.now(); true`
3. Click Done button
   - Evaluate JS: `(() => { const btns = document.querySelectorAll('button'); for (const b of btns) { if (b.className.includes('bg-green-500') && b.className.includes('rounded-full')) { b.click(); return true; } } return false; })()`
4. Detect session view (chat input appears)
   - Evaluate JS: `new Promise(r => { const check = () => { if (document.querySelector('input[placeholder*="Ask anything"]')) { r({ loaded: true, elapsed: Date.now() - window.__qa_doneStart }); } else { setTimeout(check, 20); } }; check(); setTimeout(() => r({ loaded: false, elapsed: Date.now() - window.__qa_doneStart }), 3000); })`
5. Take screenshot
   - Take screenshot: `PERF-04-done-session.png`

**Assert:**
- Session view rendered within 500ms of Done tap --> PASS_TRANSITION_SPEED
- OR: Rendered within 1000ms --> WARN_SLOW_TRANSITION

**On Fail --> Diagnose:**
- > 500ms --> AnimatePresence exit/enter animation slow or heavy state computation | check: `App.jsx` viewState transition, `LiveSessionView.jsx` initial render weight
- Never loads --> `handleDone` or `onViewResult` callback failing | check: `LiveCameraView.jsx` `handleDone`, `App.jsx` `handleViewResult`

---

### PERF-05: Memory stable
> View: camera | Severity: MED | Deps: CAM-05

**Steps:**
1. Navigate to camera
   - Navigate to: `${BASE_URL}/`
2. Wait 3s
3. Record initial heap (if available)
   - Evaluate JS: `performance.memory ? { usedHeap: performance.memory.usedJSHeapSize, totalHeap: performance.memory.totalJSHeapSize } : null`
4. Perform 3 captures
   - Click shutter, wait 1.5s (repeat 3 times)
5. Record post-capture heap
   - Evaluate JS: `performance.memory ? { usedHeap: performance.memory.usedJSHeapSize, totalHeap: performance.memory.totalJSHeapSize } : null`
6. Calculate growth
   - Compare usedHeap values
7. Take screenshot
   - Take screenshot: `PERF-05-memory.png`

**Assert:**
- Heap growth < 30MB after 3 captures --> PASS_HEAP_STABLE
- OR: `performance.memory` not available (non-Chrome) --> SKIP_NO_MEMORY_API

**On Fail --> Diagnose:**
- Heap growing > 30MB --> Data URL blobs from `canvas.toDataURL()` not being released, or `capturedMedia` array retaining references | check: `setCapturedMedia` max 8 slice, `uploadToS3` blob lifecycle
- Continuous growth pattern --> Canvas or MediaRecorder not cleaned up | check: `useEffect` cleanup in `LiveCameraView.jsx` (line ~254)

---

## Report Generation

After running all tests, generate a structured report file at `tests/reports/qa_report.md` with the following format:

```markdown
# QA Report — VI Agent Browser Tests
**Date:** {YYYY-MM-DD HH:mm}
**Environment:** {BASE_URL}
**Viewport:** 390x844 (iPhone 12)
**Browser:** {browser_name} {version}

## Summary
| Status  | Count |
|---------|-------|
| PASS    | {n}   |
| FAIL    | {n}   |
| SKIP    | {n}   |
| WARN    | {n}   |
| TOTAL   | {n}   |

## Results by Suite

### {Suite Name}
| ID     | Name                | Result | Duration | Notes |
|--------|---------------------|--------|----------|-------|
| {id}   | {name}              | {P/F/S}| {ms}     | {msg} |

## Failed Tests — Diagnosis

### {ID}: {Name}
**Result:** FAIL
**Screenshot:** `{path}`
**Expected:** {what was expected}
**Actual:** {what happened}
**Diagnosis:** {root cause analysis}
**Files to inspect:**
- `{filepath}` — {reason}

## Screenshots Index
| File | Test | Step |
|------|------|------|
| {filename} | {ID} | {description} |
```

### Report Generation Rules
1. Record start/end timestamps for each test
2. Capture screenshots at every `Take screenshot:` step
3. For FAIL results: include the JS evaluation output and diagnosis
4. For SKIP results: include the reason (e.g., "Agent not available", "No tasks in DB")
5. For WARN results: include the measured value vs threshold
6. Do NOT modify any application code based on failures -- diagnosis only
7. Save all screenshots to `tests/reports/screenshots/` with the naming convention specified
