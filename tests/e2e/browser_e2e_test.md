# Browser E2E Test Handbook — VI-Agent Frontend

## Purpose & Scope

This document is the **complete, self-contained guide** for a Claude Code agent to execute browser-based end-to-end tests against the VI-Agent frontend using Playwright MCP tools. It covers 50 test cases across 8 suites, performance profiling, visual evidence capture, and structured QA reporting.

**Target URL:** `http://YOUR_SERVER_IP` (override with `VI_TEST_BASE_URL` environment variable)
**Application:** React SPA served by nginx, communicating with API server (port 8000, proxied at `/api/`), LiveKit (WebRTC), and Google Cloud Storage.
**Test executor:** Claude Code agent with Playwright MCP tool access
**Default viewport:** iPhone 12 — 390x844

---

## 1. Prerequisites / 前置条件

### 1.1 Required Playwright MCP Tools

The following MCP tools MUST be available to the executing agent:

| Tool | Purpose |
|---|---|
| `browser_install` | Install browser binaries if not present |
| `browser_navigate` | Navigate to a URL |
| `browser_snapshot` | Capture DOM accessibility tree (primary inspection tool) |
| `browser_click` | Click an element by ref ID or selector |
| `browser_fill_form` | Fill an input/textarea with a value |
| `browser_take_screenshot` | Capture a PNG screenshot |
| `browser_evaluate` | Execute JavaScript in page context |
| `browser_wait_for` | Wait for an element or condition |
| `browser_press_key` | Simulate a keyboard key press |
| `browser_resize` | Change the browser viewport dimensions |
| `browser_console_messages` | Retrieve browser console output |
| `browser_tabs` | List open browser tabs |

### 1.2 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VI_TEST_BASE_URL` | `http://YOUR_SERVER_IP` | Base URL of the deployed VI-Agent frontend |

The agent should resolve the base URL at the start of the test run:

```
Step: browser_evaluate
Script: window.__TEST_BASE_URL = '<value of VI_TEST_BASE_URL or default>'
```

Throughout this document, `$BASE_URL` refers to this resolved value.

### 1.3 Test Account

| Field | Value |
|---|---|
| Email | `test@vi.com` |
| Password | `test1234` |
| Display Name | `Test User` |

If the account does not exist, the AUTH-03 signup test will create it. Tests should be runnable with or without a pre-existing account.

### 1.4 Viewport Configuration

Before any tests, set the viewport to iPhone 12 dimensions:

```
Tool: browser_resize
Parameters: width=390, height=844
```

### 1.5 Screenshot Storage

All screenshots are saved to: `tests/reports/screenshots/`
Naming convention: `{SUITE}-{TEST_ID}-{step_description}.png`
Example: `AUTH-AUTH_03-form_filled.png`

### 1.6 Initialization Sequence

The executing agent MUST perform these steps before running any test suite:

1. **Install browser** (if needed):
   ```
   Tool: browser_install
   ```

2. **Set viewport to iPhone 12:**
   ```
   Tool: browser_resize
   Parameters: width=390, height=844
   ```

3. **Record start time:**
   ```
   Tool: browser_evaluate
   Script: window.__testRunStart = Date.now(); window.__testRunStart
   ```

4. **Navigate to base URL:**
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

5. **Take baseline screenshot:**
   ```
   Tool: browser_take_screenshot
   (Save as: INIT-baseline.png)
   ```

---

## 2. Test Suites / 测试套件

---

### Suite 1: APP-LOAD — First Screen & PWA / 首屏与PWA

**Purpose:** Verify the application loads correctly, the React app mounts, PWA metadata is present, and desktop/mobile layouts render appropriately.

**Preconditions:** Browser installed, viewport set to 390x844, no prior navigation.

---

#### APP-01: Page loads within 3 seconds

**ID:** APP-01
**Name:** Page Load Time
**Preconditions:** Clean browser state
**Steps:**

1. Record navigation start time:
   ```
   Tool: browser_evaluate
   Script: window.__navStart = performance.now(); window.__navStart
   ```

2. Navigate to base URL:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

3. Wait for page content to appear:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded (or wait for any visible text/element)
   ```

4. Measure load time:
   ```
   Tool: browser_evaluate
   Script: performance.now() - (performance.timing.navigationStart ? (Date.now() - performance.timing.navigationStart) : 0)
   ```

   Alternative (more reliable — use Navigation Timing API):
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
     loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
     domInteractive: performance.timing.domInteractive - performance.timing.navigationStart
   })
   ```

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: APP-APP_01-page_loaded.png)
   ```

**Expected Result:** `domInteractive` < 3000ms
**Pass Criteria:** Navigation Timing `domInteractive` value is less than 3000 milliseconds.
**Fail Criteria:** Load time exceeds 3000ms or page shows a blank/error screen.

---

#### APP-02: Splash screen appears then React app mounts

**ID:** APP-02
**Name:** Splash Screen & React Mount
**Preconditions:** APP-01 passed
**Steps:**

1. Navigate to base URL (fresh load):
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

2. Immediately take snapshot to capture any splash/loading state:
   ```
   Tool: browser_snapshot
   ```

3. Check for splash screen or loading indicator. Look in the accessibility tree for:
   - An element with text "Loading" or "VI" or a loading spinner
   - The `#root` div may initially be empty or show a placeholder

4. Wait for React to mount — look for the main application container:
   ```
   Tool: browser_wait_for
   Parameters: text="camera" or any interactive element (e.g., a button)
   ```

5. Take snapshot after mount:
   ```
   Tool: browser_snapshot
   ```

6. Verify the accessibility tree now contains interactive elements (buttons, video, cards).

7. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: APP-APP_02-react_mounted.png)
   ```

**Expected Result:** After initial load, interactive UI elements are present in the DOM. The `#root` element contains rendered React components (not empty).
**Pass Criteria:** `browser_snapshot` after wait shows interactive elements (buttons, video elements, or text content).
**Fail Criteria:** `#root` is empty, or only a loading spinner persists beyond 5 seconds.

---

#### APP-03: PWA meta tags present

**ID:** APP-03
**Name:** PWA Meta Tags
**Preconditions:** Page loaded
**Steps:**

1. Evaluate meta tags in the document head:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     viewportFit: document.querySelector('meta[name="viewport"]')?.content,
     appleMobileWebAppCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
     themeColor: document.querySelector('meta[name="theme-color"]')?.content,
     manifest: document.querySelector('link[rel="manifest"]')?.href || null
   })
   ```

2. Take screenshot (optional — meta tags are invisible):
   ```
   Tool: browser_take_screenshot
   (Save as: APP-APP_03-pwa_meta.png)
   ```

**Expected Result:**
- `viewport` content includes `viewport-fit=cover`
- `apple-mobile-web-app-capable` is `yes`
- `theme-color` is defined

**Pass Criteria:** At minimum, `viewport-fit=cover` is present in the viewport meta tag.
**Fail Criteria:** Missing viewport meta tag or no `viewport-fit=cover`.

---

#### APP-04: Camera permission prompt or fallback video

**ID:** APP-04
**Name:** Camera Permission Handling
**Preconditions:** Page loaded, camera view active
**Steps:**

1. Navigate to base URL (camera is default view):
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

2. Wait for video element:
   ```
   Tool: browser_wait_for
   Parameters: selector=video (or look for video in snapshot)
   ```

3. Take snapshot to inspect the DOM:
   ```
   Tool: browser_snapshot
   ```

4. Check for video element state:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     videoElements: document.querySelectorAll('video').length,
     hasVideoSrc: !!document.querySelector('video')?.srcObject || !!document.querySelector('video')?.src,
     videoReadyState: document.querySelector('video')?.readyState,
     cameraPermission: await navigator.permissions.query({name: 'camera'}).then(r => r.state).catch(() => 'unavailable')
   })
   ```

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: APP-APP_04-camera_state.png)
   ```

**Expected Result:** Either a live camera feed is active (video element with srcObject), or a fallback static video/image is shown. In headless Playwright mode, camera will not be available — the test should verify the app handles this gracefully (no crash, fallback displayed).
**Pass Criteria:** Video element exists in DOM AND (has a srcObject/src OR a fallback image/video is shown). No JavaScript errors related to camera in console.
**Fail Criteria:** No video element found, or unhandled error in console about camera access.

---

#### APP-05: Desktop view shows DeviceFrame phone simulator

**ID:** APP-05
**Name:** Desktop DeviceFrame
**Preconditions:** Page loaded
**Steps:**

1. Resize viewport to desktop (1920x1080):
   ```
   Tool: browser_resize
   Parameters: width=1920, height=1080
   ```

2. Navigate to base URL:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

3. Wait for page to render:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

4. Take snapshot to look for DeviceFrame wrapper:
   ```
   Tool: browser_snapshot
   ```

5. Look in the accessibility tree for the DeviceFrame component. It should render a phone-shaped container with rounded corners, a notch, and constrained dimensions.

6. Verify DeviceFrame is present:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     bodyWidth: document.body.clientWidth,
     hasPhoneFrame: !!document.querySelector('[class*="device"], [class*="frame"], [class*="phone"], [class*="simulator"]'),
     innerAppWidth: document.querySelector('#root > div')?.clientWidth || 0
   })
   ```

7. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: APP-APP_05-desktop_device_frame.png)
   ```

8. **Reset viewport back to iPhone 12:**
   ```
   Tool: browser_resize
   Parameters: width=390, height=844
   ```

**Expected Result:** On desktop viewport, the app is wrapped inside a phone simulator frame. The inner app width should be significantly less than 1920px (likely around 390-430px).
**Pass Criteria:** Screenshot shows a phone-shaped frame centered on the desktop viewport. Inner app width < 500px.
**Fail Criteria:** App stretches to full desktop width with no phone frame, or layout is broken.

---

### Suite 2: AUTH-FLOW — Login/Signup / 登录注册流程

**Purpose:** Verify the complete authentication lifecycle: anonymous browsing, signup, login, session persistence, and logout.

**Preconditions:** App loaded at `$BASE_URL`, viewport at 390x844.

---

#### AUTH-01: HistoryView loads at /home

**ID:** AUTH-01
**Name:** HistoryView Route
**Preconditions:** App loaded
**Steps:**

1. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

2. Wait for content to render:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

3. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

4. Look for HistoryView indicators in the accessibility tree:
   - Task cards or "No tasks yet" empty state
   - Camera FAB button (floating action button)
   - Profile/avatar icon area

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: AUTH-AUTH_01-history_view.png)
   ```

**Expected Result:** HistoryView renders showing either a list of tasks or an empty state message. Navigation to `/home` does not result in a 404 or redirect to an unexpected page.
**Pass Criteria:** Snapshot contains recognizable HistoryView elements (task list, FAB, or empty state).
**Fail Criteria:** Page shows 404, blank screen, or unrelated view.

---

#### AUTH-02: Auth overlay appears on profile click

**ID:** AUTH-02
**Name:** Auth Overlay Trigger
**Preconditions:** AUTH-01 passed, user is anonymous
**Steps:**

1. Ensure at /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

2. Take snapshot to find the profile/auth button:
   ```
   Tool: browser_snapshot
   ```

3. Look for a profile icon, avatar placeholder, or "Login"/"Sign in" button in the accessibility tree. Common patterns:
   - A button in the top-right area
   - An icon that looks like a user silhouette
   - Text saying "Login", "Sign in", or "Profile"

4. Click the profile/auth button:
   ```
   Tool: browser_click
   Parameters: element=<ref_id from snapshot> (the profile/auth button)
   ```

5. Wait for auth overlay to appear:
   ```
   Tool: browser_snapshot
   ```

6. Verify auth overlay contains:
   - Email input field
   - Password input field
   - Submit button (Login/Signup)
   - Possibly a toggle between Login and Signup modes

7. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: AUTH-AUTH_02-auth_overlay.png)
   ```

**Expected Result:** An authentication overlay/modal appears with email and password input fields and a submit button.
**Pass Criteria:** Snapshot shows input fields for email and password within an overlay/modal.
**Fail Criteria:** No overlay appears, or overlay is missing input fields.

---

#### AUTH-03: Signup flow

**ID:** AUTH-03
**Name:** New Account Signup
**Preconditions:** AUTH-02 passed, auth overlay visible
**Steps:**

1. If not already on signup mode, look for a "Sign up" or "Register" toggle in the snapshot and click it:
   ```
   Tool: browser_snapshot
   ```
   ```
   Tool: browser_click
   Parameters: element=<signup toggle ref_id if present>
   ```

2. Fill the email field:
   ```
   Tool: browser_fill_form
   Parameters: element=<email input ref_id>, value=test_e2e_<timestamp>@vi.com
   ```
   (Use a unique email to avoid collisions. Generate timestamp via browser_evaluate first.)

   To generate a unique email:
   ```
   Tool: browser_evaluate
   Script: window.__testEmail = 'test_e2e_' + Date.now() + '@vi.com'; window.__testEmail
   ```

3. Fill the password field:
   ```
   Tool: browser_fill_form
   Parameters: element=<password input ref_id>, value=test1234
   ```

4. If display_name field exists, fill it:
   ```
   Tool: browser_fill_form
   Parameters: element=<display_name input ref_id>, value=E2E Test User
   ```

5. Take screenshot before submission:
   ```
   Tool: browser_take_screenshot
   (Save as: AUTH-AUTH_03-form_filled.png)
   ```

6. Click submit/signup button:
   ```
   Tool: browser_click
   Parameters: element=<submit button ref_id>
   ```

7. Wait for auth overlay to close (indicating success):
   ```
   Tool: browser_wait_for
   Parameters: state=hidden (auth overlay) — or wait 3 seconds then snapshot
   ```

8. Verify token is stored:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     sessionToken: sessionStorage.getItem('vi_token') || sessionStorage.getItem('token') || sessionStorage.getItem('auth_token'),
     localToken: localStorage.getItem('vi_token') || localStorage.getItem('token') || localStorage.getItem('auth_token')
   })
   ```

9. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: AUTH-AUTH_03-signup_complete.png)
   ```

**Expected Result:** Signup succeeds, auth overlay closes, and a token is stored in sessionStorage or localStorage.
**Pass Criteria:** Token value is non-null after signup. Auth overlay is no longer visible.
**Fail Criteria:** Error message displayed, overlay remains open, or no token stored.

---

#### AUTH-04: Logged-in state verification

**ID:** AUTH-04
**Name:** Verify Logged-In State
**Preconditions:** AUTH-03 passed (user signed up)
**Steps:**

1. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

2. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

3. Look for logged-in indicators:
   - Profile avatar (personalized, not a generic placeholder)
   - User display name visible
   - No "Login" or "Sign in" button — replaced by profile icon

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: AUTH-AUTH_04-logged_in.png)
   ```

**Expected Result:** The UI reflects a logged-in state with a personalized profile indicator.
**Pass Criteria:** No "Login"/"Sign in" call-to-action visible; profile area shows user identity.
**Fail Criteria:** Login button still visible, or user appears anonymous.

---

#### AUTH-05: Session persists after page refresh

**ID:** AUTH-05
**Name:** Session Persistence
**Preconditions:** AUTH-04 passed
**Steps:**

1. Record current token:
   ```
   Tool: browser_evaluate
   Script: sessionStorage.getItem('vi_token') || sessionStorage.getItem('token') || localStorage.getItem('vi_token') || localStorage.getItem('token') || localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
   ```

2. Refresh the page:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

3. Wait for page load:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

4. Check token is still present:
   ```
   Tool: browser_evaluate
   Script: sessionStorage.getItem('vi_token') || sessionStorage.getItem('token') || localStorage.getItem('vi_token') || localStorage.getItem('token') || localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
   ```

5. Take snapshot to verify logged-in UI:
   ```
   Tool: browser_snapshot
   ```

6. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: AUTH-AUTH_05-session_persisted.png)
   ```

**Expected Result:** Token is still present after refresh, and the UI still shows logged-in state.
**Pass Criteria:** Token value matches pre-refresh value (or a valid refreshed token exists). UI shows logged-in state.
**Fail Criteria:** Token is null after refresh, or user is shown the anonymous/login view.

---

#### AUTH-06: Logout clears session

**ID:** AUTH-06
**Name:** Logout Flow
**Preconditions:** AUTH-05 passed (user logged in)
**Steps:**

1. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

2. Take snapshot to find logout mechanism:
   ```
   Tool: browser_snapshot
   ```

3. Look for logout button. Common patterns:
   - Click profile avatar → dropdown with "Logout" option
   - Settings icon → Logout button
   - Direct "Logout" text/button

4. Click profile/settings to reveal logout option:
   ```
   Tool: browser_click
   Parameters: element=<profile icon ref_id>
   ```

5. Take snapshot to find logout button:
   ```
   Tool: browser_snapshot
   ```

6. Click logout:
   ```
   Tool: browser_click
   Parameters: element=<logout button ref_id>
   ```

7. Wait for state change:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

8. Verify token is cleared:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     sessionToken: sessionStorage.getItem('vi_token') || sessionStorage.getItem('token') || sessionStorage.getItem('auth_token'),
     localToken: localStorage.getItem('vi_token') || localStorage.getItem('token') || localStorage.getItem('auth_token')
   })
   ```

9. Take snapshot to verify anonymous state:
   ```
   Tool: browser_snapshot
   ```

10. Take screenshot:
    ```
    Tool: browser_take_screenshot
    (Save as: AUTH-AUTH_06-logged_out.png)
    ```

**Expected Result:** All auth tokens are cleared from storage. UI returns to anonymous mode.
**Pass Criteria:** Token values are null. UI shows login/signup prompts or anonymous state.
**Fail Criteria:** Tokens remain, or UI still shows logged-in indicators.

---

### Suite 3: CAMERA — Camera View & Capture / 相机视图与拍照

**Purpose:** Verify camera view rendering, agent status display, photo capture, multi-photo workflow, and navigation to session view.

**Preconditions:** User logged in (run AUTH-03 or use test@vi.com credentials). Viewport at 390x844.

**Login Helper (run before CAMERA suite if not already logged in):**

```
1. browser_navigate → $BASE_URL/home
2. browser_snapshot → find auth/login button
3. browser_click → auth button
4. browser_fill_form → email: test@vi.com
5. browser_fill_form → password: test1234
6. browser_click → submit
7. browser_wait_for → auth overlay closes
```

---

#### CAM-01: Camera view renders with video element

**ID:** CAM-01
**Name:** Camera View Render
**Preconditions:** User logged in
**Steps:**

1. Navigate to base URL (camera is default):
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

2. Wait for video element:
   ```
   Tool: browser_evaluate
   Script: new Promise(resolve => {
     const check = () => {
       const video = document.querySelector('video');
       if (video) resolve(true);
       else setTimeout(check, 500);
     };
     check();
     setTimeout(() => resolve(false), 5000);
   })
   ```

3. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

4. Verify video element properties:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     videoCount: document.querySelectorAll('video').length,
     videoWidth: document.querySelector('video')?.videoWidth,
     videoHeight: document.querySelector('video')?.videoHeight,
     playing: !document.querySelector('video')?.paused,
     readyState: document.querySelector('video')?.readyState
   })
   ```

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: CAM-CAM_01-camera_view.png)
   ```

**Expected Result:** At least one `<video>` element is present in the DOM. In headless mode, it may not have an active camera stream, but the element should exist and the fallback should be handled gracefully.
**Pass Criteria:** `videoCount >= 1`. No unhandled errors in console.
**Fail Criteria:** No video element found, or JavaScript errors related to camera/media.

---

#### CAM-02: Agent status Card component appears

**ID:** CAM-02
**Name:** Agent Status Card
**Preconditions:** CAM-01 passed, camera view active
**Steps:**

1. Take snapshot of camera view:
   ```
   Tool: browser_snapshot
   ```

2. Look for the Card component in the accessibility tree. It typically appears as a floating overlay with:
   - Agent name or status text
   - A colored indicator (dot or border)
   - Possibly a transcript area

3. Verify Card is present:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     cardElements: document.querySelectorAll('[class*="card"], [class*="Card"], [class*="agent"], [class*="status"]').length,
     cardText: document.querySelector('[class*="card"], [class*="Card"], [class*="agent"]')?.textContent?.substring(0, 100)
   })
   ```

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: CAM-CAM_02-agent_card.png)
   ```

**Expected Result:** An agent status card is visible overlaying the camera view, showing connection state information.
**Pass Criteria:** Card element found in DOM with status-related text content.
**Fail Criteria:** No card/status element found.

---

#### CAM-03: Agent connection state indicators

**ID:** CAM-03
**Name:** Agent Connection State
**Preconditions:** CAM-02 passed
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Evaluate agent state from the Card component. The Card uses color-coded states:
   - `offline` (red) — no agent identity
   - `connecting` (blue, pulsing) — greeting not received
   - `listening` (purple) — user speaking
   - `thinking` (cyan, pulsing) — generating
   - `viewing` (cyan) — camera active
   - `waiting` (green) — ready
   - `weak_connection` (yellow) — quality lost

3. Check for state-related CSS classes or styles:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     cardClasses: document.querySelector('[class*="card"], [class*="Card"]')?.className,
     cardStyle: document.querySelector('[class*="card"], [class*="Card"]')?.style.cssText,
     hasColorIndicator: !!document.querySelector('[class*="pulse"], [class*="glow"], [style*="background-color"]'),
     stateText: document.querySelector('[class*="card"], [class*="Card"]')?.textContent?.substring(0, 200)
   })
   ```

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: CAM-CAM_03-agent_state.png)
   ```

**Expected Result:** Card shows a recognizable connection state (likely "connecting" or "waiting" initially). A color indicator is visible.
**Pass Criteria:** Card text or styling indicates one of the known states (offline, connecting, listening, thinking, viewing, waiting, weak_connection).
**Fail Criteria:** Card shows no state information or unknown/error state.

---

#### CAM-04: Shutter button visible and interactive

**ID:** CAM-04
**Name:** Shutter Button
**Preconditions:** Camera view active
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Look for the shutter button in the accessibility tree. It should be:
   - Located at bottom center of the viewport
   - A circular button (large, prominent)
   - May have an aria-label like "capture", "shutter", "take photo"

3. Verify shutter button properties:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     buttons: Array.from(document.querySelectorAll('button')).map(b => ({
       text: b.textContent?.substring(0, 50),
       classes: b.className,
       ariaLabel: b.getAttribute('aria-label'),
       rect: b.getBoundingClientRect()
     })).filter(b => b.rect.bottom > 600) // bottom area buttons
   })
   ```

4. Identify the shutter button from the results (the large circular button at bottom center, typically x position around 150-240 for a 390px viewport, y position > 700).

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: CAM-CAM_04-shutter_button.png)
   ```

**Expected Result:** A prominent shutter/capture button is visible at the bottom center of the camera view.
**Pass Criteria:** A button matching shutter characteristics is found in the bottom portion of the viewport.
**Fail Criteria:** No button found in the expected position, or button is not interactive (disabled).

---

#### CAM-05: Single photo capture

**ID:** CAM-05
**Name:** Photo Capture
**Preconditions:** CAM-04 passed, shutter button identified
**Steps:**

1. Take snapshot to get shutter button ref:
   ```
   Tool: browser_snapshot
   ```

2. Click the shutter button:
   ```
   Tool: browser_click
   Parameters: element=<shutter button ref_id>
   ```

3. Wait briefly for capture animation/preview:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 1000)); 'waited'
   ```

4. Take snapshot to see the result:
   ```
   Tool: browser_snapshot
   ```

5. Look for:
   - A photo preview/thumbnail appearing
   - A photo strip at the bottom
   - A canvas element that was used for capture
   - A "Done" button appearing

6. Verify capture state:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     canvasElements: document.querySelectorAll('canvas').length,
     imgElements: document.querySelectorAll('img[src*="blob"], img[src*="data:"]').length,
     thumbnails: document.querySelectorAll('[class*="thumb"], [class*="preview"], [class*="strip"], [class*="gallery"]').length,
     hasDoneButton: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.toLowerCase().includes('done'))
   })
   ```

7. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: CAM-CAM_05-photo_captured.png)
   ```

**Expected Result:** After clicking shutter, a photo is captured and a preview/thumbnail appears. A "Done" button becomes visible or accessible.
**Pass Criteria:** At least one new image element or thumbnail appears after capture.
**Fail Criteria:** No visual change after clicking shutter, or an error occurs.

---

#### CAM-06: Multi-photo capture

**ID:** CAM-06
**Name:** Multi-Photo Capture
**Preconditions:** CAM-05 passed (one photo already captured)
**Steps:**

1. Take snapshot to get shutter button ref again:
   ```
   Tool: browser_snapshot
   ```

2. Click shutter button a second time:
   ```
   Tool: browser_click
   Parameters: element=<shutter button ref_id>
   ```

3. Wait for capture:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 1000)); 'waited'
   ```

4. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

5. Count thumbnails/images:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     thumbnailCount: document.querySelectorAll('[class*="thumb"], [class*="preview"] img, [class*="strip"] img, [class*="gallery"] img').length,
     allImgCount: document.querySelectorAll('img[src*="blob"], img[src*="data:"]').length
   })
   ```

6. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: CAM-CAM_06-multi_photo.png)
   ```

**Expected Result:** A second photo is added to the photo strip/gallery. Thumbnail count increases.
**Pass Criteria:** Thumbnail/image count is >= 2.
**Fail Criteria:** Only one thumbnail visible, or shutter click replaces the previous photo.

---

#### CAM-07: Done button navigates to LiveSessionView

**ID:** CAM-07
**Name:** Done → Session Transition
**Preconditions:** CAM-06 passed (photos captured)
**Steps:**

1. Record transition start time:
   ```
   Tool: browser_evaluate
   Script: window.__transitionStart = performance.now(); window.__transitionStart
   ```

2. Take snapshot to find "Done" button:
   ```
   Tool: browser_snapshot
   ```

3. Click "Done" button:
   ```
   Tool: browser_click
   Parameters: element=<Done button ref_id>
   ```

4. Wait for view transition:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded (or wait for session view elements)
   ```

5. Measure transition time:
   ```
   Tool: browser_evaluate
   Script: performance.now() - window.__transitionStart
   ```

6. Take snapshot to verify LiveSessionView:
   ```
   Tool: browser_snapshot
   ```

7. Look for LiveSessionView indicators:
   - Timeline blocks area
   - Chat input bar at bottom
   - Back/Home navigation button
   - Agent processing indicator

8. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: CAM-CAM_07-session_view.png)
   ```

**Expected Result:** Clicking "Done" transitions from camera view to LiveSessionView. The session view shows timeline content and a chat input area.
**Pass Criteria:** Snapshot shows LiveSessionView elements (timeline, chat input). Transition time < 1000ms.
**Fail Criteria:** Still on camera view after click, or transition takes > 5s.

---

#### CAM-08: Microphone toggle button

**ID:** CAM-08
**Name:** Mic Toggle
**Preconditions:** Camera view active
**Steps:**

1. Navigate back to camera view:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

2. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

3. Look for microphone toggle button. It should be in the bottom area of the camera view, possibly:
   - An icon button with a microphone icon
   - aria-label containing "mic", "microphone", or "mute"

4. Find mic button:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     bottomButtons: Array.from(document.querySelectorAll('button')).filter(b => {
       const rect = b.getBoundingClientRect();
       return rect.bottom > 650;
     }).map(b => ({
       text: b.textContent?.substring(0, 30),
       classes: b.className,
       ariaLabel: b.getAttribute('aria-label'),
       innerHTML: b.innerHTML.substring(0, 100)
     }))
   })
   ```

5. Click mic toggle:
   ```
   Tool: browser_click
   Parameters: element=<mic button ref_id>
   ```

6. Take snapshot after toggle to check state change:
   ```
   Tool: browser_snapshot
   ```

7. Verify state changed (e.g., icon changed, class toggled, or style changed):
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     micButtonState: document.querySelector('[class*="mic"], [aria-label*="mic"]')?.className,
     mutedIndicator: !!document.querySelector('[class*="muted"], [class*="off"]')
   })
   ```

8. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: CAM-CAM_08-mic_toggle.png)
   ```

**Expected Result:** Mic toggle button is present and clickable. Clicking it toggles between muted and unmuted states with a visual indicator change.
**Pass Criteria:** Button found, click produces a visual state change.
**Fail Criteria:** No mic button found, or click has no visible effect.

---

### Suite 4: SESSION — Session View & Agent Response / 会话视图与智能体响应

**Purpose:** Verify LiveSessionView rendering, timeline blocks, agent processing indicators, HTML content rendering, chat functionality, and navigation.

**Preconditions:** User logged in. A session should be active (from CAM-07 flow, or navigate to an existing session).

---

#### SESS-01: LiveSessionView loads with session data

**ID:** SESS-01
**Name:** Session View Load
**Preconditions:** Photos captured and "Done" clicked (or navigated to existing session)
**Steps:**

1. If coming from camera flow, the view should already be LiveSessionView. Otherwise, navigate to /home and click an existing task:
   ```
   Tool: browser_snapshot
   ```

2. Verify LiveSessionView is active by checking for characteristic elements:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     hasTimeline: !!document.querySelector('[class*="timeline"], [class*="session"], [class*="block"], [class*="message"]'),
     hasChatInput: !!document.querySelector('input[type="text"], textarea, [class*="chat"] input, [contenteditable]'),
     hasBackButton: !!document.querySelector('[class*="back"], [class*="home"], [aria-label*="back"], [aria-label*="home"]'),
     sessionContent: document.querySelector('[class*="session"], [class*="timeline"]')?.textContent?.substring(0, 200)
   })
   ```

3. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: SESS-SESS_01-session_loaded.png)
   ```

**Expected Result:** LiveSessionView is displayed with timeline area and chat input.
**Pass Criteria:** Timeline/session container exists AND chat input exists.
**Fail Criteria:** Session view elements are missing, or page shows an error.

---

#### SESS-02: Timeline blocks render (bubble, html, image)

**ID:** SESS-02
**Name:** Timeline Block Types
**Preconditions:** SESS-01 passed, session has content
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Look for different block types in the timeline:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     bubbles: document.querySelectorAll('[class*="bubble"], [class*="message-text"], [class*="transcript"]').length,
     htmlBlocks: document.querySelectorAll('iframe, [class*="html"], [class*="render"]').length,
     imageBlocks: document.querySelectorAll('[class*="timeline"] img, [class*="session"] img, [class*="block"] img').length,
     totalBlocks: document.querySelectorAll('[class*="block"], [class*="entry"], [class*="item"]').length,
     blockTexts: Array.from(document.querySelectorAll('[class*="block"], [class*="bubble"]')).slice(0, 5).map(b => b.textContent?.substring(0, 80))
   })
   ```

3. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: SESS-SESS_02-timeline_blocks.png)
   ```

**Expected Result:** Timeline contains one or more block types: text bubbles, HTML renders, or image blocks.
**Pass Criteria:** At least one block element found in the timeline. If the session is new, at least the user's photos should appear as image blocks.
**Fail Criteria:** Timeline is empty with no blocks rendered.

**Note:** If the session is too new for agent response, the test should still pass if user-submitted content (photos) appear.

---

#### SESS-03: Agent processing indicator

**ID:** SESS-03
**Name:** Processing Indicator
**Preconditions:** Session active, agent is processing
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Look for processing/loading indicators:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     spinners: document.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="processing"], [class*="pulse"], [class*="typing"]').length,
     animatedElements: document.querySelectorAll('[class*="animate"], [class*="glow"]').length,
     statusText: Array.from(document.querySelectorAll('*')).filter(el =>
       el.textContent?.match(/processing|thinking|generating|loading/i) &&
       el.children.length === 0
     ).map(el => el.textContent).slice(0, 3)
   })
   ```

3. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: SESS-SESS_03-processing.png)
   ```

**Expected Result:** If the agent is actively processing, a visual indicator (spinner, pulsing animation, "thinking" text) is displayed.
**Pass Criteria:** Processing indicator found during active agent work. If agent has already finished, this test may be SKIPPED (note in results).
**Fail Criteria:** Active agent work visible in timeline updates but no processing indicator shown.

---

#### SESS-04: HTML content renders in iframe (PersistentHtmlRenderer)

**ID:** SESS-04
**Name:** HTML Iframe Rendering
**Preconditions:** Session has HTML block content from agent
**Steps:**

1. Wait for HTML content (may need to wait for agent to produce it):
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     iframes: document.querySelectorAll('iframe').length,
     iframeSrcs: Array.from(document.querySelectorAll('iframe')).map(f => ({
       src: f.src?.substring(0, 100),
       srcdoc: f.srcdoc?.substring(0, 100),
       width: f.clientWidth,
       height: f.clientHeight
     }))
   })
   ```

2. If iframes found, verify they have content:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     iframeContentLength: Array.from(document.querySelectorAll('iframe')).map(f => {
       try { return f.contentDocument?.body?.innerHTML?.length || 0; }
       catch(e) { return 'cross-origin'; }
     })
   })
   ```

3. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: SESS-SESS_04-html_iframe.png)
   ```

**Expected Result:** If agent has produced HTML content, it renders inside an iframe (PersistentHtmlRenderer component). The iframe has non-zero dimensions and contains HTML content.
**Pass Criteria:** At least one iframe with content found (or srcdoc set). If no HTML blocks exist yet, test is SKIPPED.
**Fail Criteria:** Iframe exists but has zero dimensions or empty content.

---

#### SESS-05: Streaming HTML updates incrementally

**ID:** SESS-05
**Name:** Streaming HTML Updates
**Preconditions:** Agent is actively producing HTML content
**Steps:**

1. Record initial iframe content length:
   ```
   Tool: browser_evaluate
   Script: window.__initialHtmlLength = Array.from(document.querySelectorAll('iframe')).reduce((sum, f) => {
     try { return sum + (f.contentDocument?.body?.innerHTML?.length || 0); }
     catch(e) { return sum; }
   }, 0); window.__initialHtmlLength
   ```

2. Wait 2 seconds for streaming updates:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 2000)); 'waited'
   ```

3. Check if content length increased:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     initialLength: window.__initialHtmlLength,
     currentLength: Array.from(document.querySelectorAll('iframe')).reduce((sum, f) => {
       try { return sum + (f.contentDocument?.body?.innerHTML?.length || 0); }
       catch(e) { return sum; }
     }, 0),
     increased: Array.from(document.querySelectorAll('iframe')).reduce((sum, f) => {
       try { return sum + (f.contentDocument?.body?.innerHTML?.length || 0); }
       catch(e) { return sum; }
     }, 0) > window.__initialHtmlLength
   })
   ```

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: SESS-SESS_05-streaming_html.png)
   ```

**Expected Result:** During active agent streaming, iframe content length increases over time as HTML chunks are appended.
**Pass Criteria:** `currentLength > initialLength` during active streaming. If agent is not currently streaming, test is SKIPPED.
**Fail Criteria:** Content length remains static during known active streaming.

---

#### SESS-06: Chat input bar visible

**ID:** SESS-06
**Name:** Chat Input
**Preconditions:** SESS-01 passed
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Look for chat input in the accessibility tree (typically at bottom of session view):
   - Input element with placeholder text like "Type a message", "Ask...", "Chat..."
   - A send button next to the input

3. Verify chat input:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     inputElements: Array.from(document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"]')).map(el => ({
       placeholder: el.placeholder || el.getAttribute('aria-label'),
       visible: el.offsetParent !== null,
       rect: el.getBoundingClientRect()
     })).filter(el => el.rect.bottom > 700) // bottom area
   })
   ```

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: SESS-SESS_06-chat_input.png)
   ```

**Expected Result:** A text input/textarea is visible at the bottom of the session view.
**Pass Criteria:** Input element found in the bottom portion of the viewport with appropriate placeholder text.
**Fail Criteria:** No input element found, or input is not visible.

---

#### SESS-07: Send chat message

**ID:** SESS-07
**Name:** Chat Message Send
**Preconditions:** SESS-06 passed, chat input identified
**Steps:**

1. Take snapshot to get chat input ref:
   ```
   Tool: browser_snapshot
   ```

2. Click the chat input to focus:
   ```
   Tool: browser_click
   Parameters: element=<chat input ref_id>
   ```

3. Type a test message:
   ```
   Tool: browser_fill_form
   Parameters: element=<chat input ref_id>, value=Hello from E2E test
   ```

4. Send the message (press Enter or click send button):
   ```
   Tool: browser_press_key
   Parameters: key=Enter
   ```

5. Wait for message to appear in timeline:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 1500)); 'waited'
   ```

6. Take snapshot to verify message appears:
   ```
   Tool: browser_snapshot
   ```

7. Look for the sent message in the timeline:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     messageFound: !!Array.from(document.querySelectorAll('*')).find(el =>
       el.textContent?.includes('Hello from E2E test') && el.children.length === 0
     ),
     timelineContent: document.querySelector('[class*="timeline"], [class*="session"]')?.textContent?.substring(-200)
   })
   ```

8. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: SESS-SESS_07-message_sent.png)
   ```

**Expected Result:** The typed message "Hello from E2E test" appears in the session timeline after sending.
**Pass Criteria:** Message text found in the timeline DOM after sending.
**Fail Criteria:** Message does not appear, or input fails to send.

---

#### SESS-08: Back/Home navigation

**ID:** SESS-08
**Name:** Session → History Navigation
**Preconditions:** SESS-01 passed, on session view
**Steps:**

1. Take snapshot to find back/home button:
   ```
   Tool: browser_snapshot
   ```

2. Look for navigation button (top-left area):
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     topButtons: Array.from(document.querySelectorAll('button, a')).filter(el => {
       const rect = el.getBoundingClientRect();
       return rect.top < 100 && rect.left < 100;
     }).map(el => ({
       text: el.textContent?.substring(0, 30),
       ariaLabel: el.getAttribute('aria-label'),
       classes: el.className
     }))
   })
   ```

3. Click back/home button:
   ```
   Tool: browser_click
   Parameters: element=<back button ref_id>
   ```

4. Wait for navigation:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

5. Take snapshot to verify HistoryView:
   ```
   Tool: browser_snapshot
   ```

6. Verify we're on HistoryView:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     url: window.location.href,
     hasTaskCards: document.querySelectorAll('[class*="task"], [class*="card"], [class*="history"]').length > 0,
     hasFab: document.querySelectorAll('[class*="fab"], [class*="floating"]').length > 0
   })
   ```

7. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: SESS-SESS_08-back_to_history.png)
   ```

**Expected Result:** Clicking back/home navigates from LiveSessionView to HistoryView.
**Pass Criteria:** URL changes to /home or similar, and HistoryView elements are visible.
**Fail Criteria:** Navigation does not occur, or an unexpected view is shown.

---

### Suite 5: HISTORY — Task History / 任务历史

**Purpose:** Verify HistoryView task listing, active task indicators, task navigation, delete flow, camera FAB, and refresh behavior.

**Preconditions:** User logged in, at least one task exists (from camera capture flow).

---

#### HIST-01: HistoryView loads at /home

**ID:** HIST-01
**Name:** History View Load
**Preconditions:** User logged in
**Steps:**

1. Record start time:
   ```
   Tool: browser_evaluate
   Script: window.__historyLoadStart = performance.now(); window.__historyLoadStart
   ```

2. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

3. Wait for content:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

4. Measure load time:
   ```
   Tool: browser_evaluate
   Script: performance.now() - window.__historyLoadStart
   ```

5. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

6. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: HIST-HIST_01-history_loaded.png)
   ```

**Expected Result:** HistoryView loads and displays task content or empty state within 2 seconds.
**Pass Criteria:** HistoryView elements visible in snapshot. Load time < 2000ms.
**Fail Criteria:** Page fails to load, shows error, or takes > 5s.

---

#### HIST-02: Task list with photo thumbnails

**ID:** HIST-02
**Name:** Task Cards with Thumbnails
**Preconditions:** HIST-01 passed, tasks exist
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Identify task cards:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     taskCards: document.querySelectorAll('[class*="task"], [class*="card"]').length,
     thumbnails: document.querySelectorAll('[class*="task"] img, [class*="card"] img, [class*="hero"] img, [class*="thumb"] img').length,
     cardContents: Array.from(document.querySelectorAll('[class*="task"], [class*="card"]')).slice(0, 5).map(card => ({
       text: card.textContent?.substring(0, 100),
       hasImage: card.querySelector('img') !== null,
       imageUrl: card.querySelector('img')?.src?.substring(0, 80)
     }))
   })
   ```

3. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: HIST-HIST_02-task_cards.png)
   ```

**Expected Result:** Task cards are displayed in a grid/list layout, each with a photo thumbnail from the captured images.
**Pass Criteria:** At least one task card found with an associated image/thumbnail.
**Fail Criteria:** No task cards visible (when tasks are known to exist), or cards have no thumbnails.

---

#### HIST-03: Active tasks show animated indicators

**ID:** HIST-03
**Name:** Active Task Indicators
**Preconditions:** An active (in-progress) task exists
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Look for active task visual indicators:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     glowElements: document.querySelectorAll('[class*="glow"], [class*="active"], [class*="progress"], [class*="animate"], [class*="pulse"]').length,
     activeCards: Array.from(document.querySelectorAll('[class*="card"], [class*="task"]')).filter(card => {
       const classes = card.className || '';
       return classes.match(/glow|active|progress|animate|pulse|processing/i);
     }).map(card => ({
       classes: card.className,
       text: card.textContent?.substring(0, 80)
     }))
   })
   ```

3. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: HIST-HIST_03-active_tasks.png)
   ```

**Expected Result:** Active/in-progress tasks have a visual distinction such as animated glow border, pulsing animation, or progress indicator.
**Pass Criteria:** At least one element with animation/glow classes found on active tasks. If no active tasks exist, test is SKIPPED.
**Fail Criteria:** Active tasks look identical to completed tasks (no visual distinction).

---

#### HIST-04: Click task card navigates to session

**ID:** HIST-04
**Name:** Task Card → Session Navigation
**Preconditions:** HIST-02 passed, task cards visible
**Steps:**

1. Take snapshot to get task card ref:
   ```
   Tool: browser_snapshot
   ```

2. Click the first task card:
   ```
   Tool: browser_click
   Parameters: element=<first task card ref_id>
   ```

3. Wait for navigation:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

4. Take snapshot to verify LiveSessionView:
   ```
   Tool: browser_snapshot
   ```

5. Verify session view loaded with task data:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     hasTimeline: !!document.querySelector('[class*="timeline"], [class*="session"], [class*="block"]'),
     hasChatInput: !!document.querySelector('input[type="text"], textarea'),
     hasBackButton: !!document.querySelector('[class*="back"], [aria-label*="back"]'),
     url: window.location.href
   })
   ```

6. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: HIST-HIST_04-task_to_session.png)
   ```

7. Navigate back for subsequent tests:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

**Expected Result:** Clicking a task card navigates to LiveSessionView showing that task's session data.
**Pass Criteria:** Session view loads with timeline content after card click.
**Fail Criteria:** Navigation fails, wrong view loads, or session has no content.

---

#### HIST-05: Long-press task for delete confirmation

**ID:** HIST-05
**Name:** Task Delete Flow
**Preconditions:** HIST-01 passed, task cards visible
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Simulate long-press on a task card. Since Playwright MCP may not directly support long-press, use browser_evaluate to dispatch a contextmenu or long-press event:
   ```
   Tool: browser_evaluate
   Script: (() => {
     const card = document.querySelector('[class*="task"], [class*="card"]');
     if (!card) return 'no card found';
     // Try dispatching a long press via touch events
     const touchStart = new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 1, target: card, clientX: 100, clientY: 200 })] });
     card.dispatchEvent(touchStart);
     return 'touchstart dispatched, waiting...';
   })()
   ```

3. Wait for long-press duration:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 800)); (() => {
     const card = document.querySelector('[class*="task"], [class*="card"]');
     if (!card) return 'no card';
     const touchEnd = new TouchEvent('touchend', { bubbles: true });
     card.dispatchEvent(touchEnd);
     return 'touchend dispatched';
   })()
   ```

4. Take snapshot to check for delete confirmation:
   ```
   Tool: browser_snapshot
   ```

5. Look for delete confirmation dialog/modal:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     dialogs: document.querySelectorAll('[class*="dialog"], [class*="modal"], [class*="confirm"], [class*="delete"], [role="dialog"], [role="alertdialog"]').length,
     confirmText: Array.from(document.querySelectorAll('[class*="dialog"], [class*="modal"], [class*="confirm"]')).map(el => el.textContent?.substring(0, 100)),
     deleteButtons: Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.match(/delete|remove|confirm/i)).map(b => b.textContent)
   })
   ```

6. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: HIST-HIST_05-delete_confirm.png)
   ```

7. If confirmation dialog appeared, dismiss it (click Cancel/No):
   ```
   Tool: browser_snapshot
   (Find cancel button, then click it to avoid actually deleting)
   ```

**Expected Result:** Long-pressing a task card triggers a delete confirmation dialog/modal.
**Pass Criteria:** A confirmation dialog appears with delete/remove action. If long-press is not supported in test environment, document as SKIPPED with note.
**Fail Criteria:** No confirmation appears, or task is deleted without confirmation.

---

#### HIST-06: Camera FAB navigates to camera view

**ID:** HIST-06
**Name:** Camera FAB Navigation
**Preconditions:** On HistoryView
**Steps:**

1. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

2. Take snapshot to find FAB:
   ```
   Tool: browser_snapshot
   ```

3. Look for camera FAB (floating action button, typically bottom-right):
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     fabButtons: Array.from(document.querySelectorAll('button, [class*="fab"]')).filter(el => {
       const rect = el.getBoundingClientRect();
       return rect.bottom > 700 && rect.right > 250;
     }).map(el => ({
       text: el.textContent?.substring(0, 30),
       ariaLabel: el.getAttribute('aria-label'),
       classes: el.className,
       rect: el.getBoundingClientRect()
     }))
   })
   ```

4. Click the camera FAB:
   ```
   Tool: browser_click
   Parameters: element=<FAB button ref_id>
   ```

5. Wait for view transition:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

6. Verify camera view loaded:
   ```
   Tool: browser_snapshot
   ```

7. Check for video element (camera view indicator):
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     hasVideo: document.querySelectorAll('video').length > 0,
     hasShutter: !!Array.from(document.querySelectorAll('button')).find(b => {
       const rect = b.getBoundingClientRect();
       return rect.bottom > 700 && rect.left > 130 && rect.right < 260;
     })
   })
   ```

8. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: HIST-HIST_06-camera_fab.png)
   ```

**Expected Result:** Clicking the camera FAB navigates from HistoryView to the camera view.
**Pass Criteria:** Video element and shutter button are present after FAB click.
**Fail Criteria:** Navigation does not occur, or camera view does not load.

---

#### HIST-07: Task list refresh

**ID:** HIST-07
**Name:** Task List Refresh
**Preconditions:** On HistoryView
**Steps:**

1. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

2. Record initial task count:
   ```
   Tool: browser_evaluate
   Script: window.__initialTaskCount = document.querySelectorAll('[class*="task"], [class*="card"]').length; window.__initialTaskCount
   ```

3. Attempt pull-to-refresh (simulate touch drag down):
   ```
   Tool: browser_evaluate
   Script: (() => {
     const container = document.querySelector('[class*="history"], [class*="scroll"], main, [class*="content"]');
     if (!container) return 'no scrollable container';
     container.scrollTop = 0;
     // Dispatch scroll event to potentially trigger refresh
     container.dispatchEvent(new Event('scroll', { bubbles: true }));
     return 'scroll triggered';
   })()
   ```

4. Alternative: just re-navigate to force a data refresh:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

5. Wait for data load:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 2000)); document.querySelectorAll('[class*="task"], [class*="card"]').length
   ```

6. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: HIST-HIST_07-refreshed.png)
   ```

**Expected Result:** Task list updates/refreshes to show the latest tasks.
**Pass Criteria:** Task list renders after refresh with correct data (task count is consistent or updated).
**Fail Criteria:** Refresh fails, or task list is empty when tasks are known to exist.

---

### Suite 6: MEMORY — Memory Management / 记忆管理

**Purpose:** Verify MemoryView rendering, file listing, content display, editing, creation, and deletion.

**Preconditions:** User logged in. Viewport at 390x844.

---

#### MEM-01: MemoryView loads at /memories

**ID:** MEM-01
**Name:** Memory View Load
**Preconditions:** User logged in
**Steps:**

1. Navigate to /memories:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/memories
   ```

2. Wait for content:
   ```
   Tool: browser_wait_for
   Parameters: state=domcontentloaded
   ```

3. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

4. Verify MemoryView loaded:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     url: window.location.href,
     hasMemoryContent: !!document.querySelector('[class*="memory"], [class*="Memory"]'),
     title: document.title,
     headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent?.substring(0, 50))
   })
   ```

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: MEM-MEM_01-memory_view.png)
   ```

**Expected Result:** MemoryView loads and displays a list of memory files or empty state.
**Pass Criteria:** URL contains "memories" or "memory", and MemoryView-specific elements are visible.
**Fail Criteria:** 404, redirect to wrong page, or blank content.

---

#### MEM-02: Memory file list with previews

**ID:** MEM-02
**Name:** Memory File List
**Preconditions:** MEM-01 passed
**Steps:**

1. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

2. Inspect file list:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     fileItems: document.querySelectorAll('[class*="file"], [class*="item"], [class*="memory"] li, [class*="list"] > *').length,
     fileNames: Array.from(document.querySelectorAll('[class*="file"], [class*="item"], [class*="memory"] li')).slice(0, 10).map(item => ({
       name: item.querySelector('[class*="name"], [class*="title"], h3, h4, strong')?.textContent,
       preview: item.textContent?.substring(0, 80)
     }))
   })
   ```

3. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: MEM-MEM_02-file_list.png)
   ```

**Expected Result:** A list of memory files is displayed, each showing a filename and content preview.
**Pass Criteria:** File items found with names and preview text. If no memories exist, empty state is shown.
**Fail Criteria:** List fails to render, or files have no names/previews.

---

#### MEM-03: Click memory file to view content

**ID:** MEM-03
**Name:** Memory Content View
**Preconditions:** MEM-02 passed, at least one file exists
**Steps:**

1. Take snapshot to get file item ref:
   ```
   Tool: browser_snapshot
   ```

2. Click the first memory file:
   ```
   Tool: browser_click
   Parameters: element=<first file item ref_id>
   ```

3. Wait for content to render:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 500)); 'waited'
   ```

4. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

5. Verify markdown content is rendered:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     hasRenderedContent: !!document.querySelector('[class*="content"], [class*="markdown"], [class*="render"], [class*="detail"]'),
     contentLength: document.querySelector('[class*="content"], [class*="markdown"], [class*="render"]')?.textContent?.length || 0,
     hasEditButton: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.match(/edit/i))
   })
   ```

6. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: MEM-MEM_03-memory_content.png)
   ```

**Expected Result:** Clicking a memory file displays its rendered markdown content.
**Pass Criteria:** Content area is populated with text (contentLength > 0). If no files exist, test is SKIPPED.
**Fail Criteria:** Content area is empty, or rendering fails.

---

#### MEM-04: Edit memory file

**ID:** MEM-04
**Name:** Memory Edit Mode
**Preconditions:** MEM-03 passed, viewing a memory file
**Steps:**

1. Take snapshot to find Edit button:
   ```
   Tool: browser_snapshot
   ```

2. Click the Edit button:
   ```
   Tool: browser_click
   Parameters: element=<edit button ref_id>
   ```

3. Wait for editor to appear:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 500)); 'waited'
   ```

4. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

5. Verify editor mode:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     textareas: document.querySelectorAll('textarea').length,
     editableElements: document.querySelectorAll('[contenteditable="true"]').length,
     textareaContent: document.querySelector('textarea')?.value?.substring(0, 100),
     hasSaveButton: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.match(/save|done|confirm/i))
   })
   ```

6. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: MEM-MEM_04-edit_mode.png)
   ```

**Expected Result:** Clicking "Edit" switches to editor mode with a textarea containing the file's raw markdown content, and a Save button.
**Pass Criteria:** Textarea with content found, Save button present.
**Fail Criteria:** No textarea appears, or content is empty in edit mode.

---

#### MEM-05: Create new memory file

**ID:** MEM-05
**Name:** New Memory Creation
**Preconditions:** On MemoryView
**Steps:**

1. Navigate to /memories:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/memories
   ```

2. Take snapshot to find "+ New" button:
   ```
   Tool: browser_snapshot
   ```

3. Look for new/create button:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     createButtons: Array.from(document.querySelectorAll('button')).filter(b =>
       b.textContent?.match(/new|create|add|\+/i)
     ).map(b => ({ text: b.textContent, ariaLabel: b.getAttribute('aria-label') }))
   })
   ```

4. Click the new/create button:
   ```
   Tool: browser_click
   Parameters: element=<new button ref_id>
   ```

5. Wait for creation form:
   ```
   Tool: browser_snapshot
   ```

6. Fill in filename (if separate field):
   ```
   Tool: browser_fill_form
   Parameters: element=<filename input ref_id>, value=e2e_test_memory
   ```

7. Fill in content:
   ```
   Tool: browser_fill_form
   Parameters: element=<content textarea ref_id>, value=This is a test memory created by E2E tests.
   ```

8. Click Save:
   ```
   Tool: browser_click
   Parameters: element=<save button ref_id>
   ```

9. Wait for save to complete:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 1000)); 'waited'
   ```

10. Verify new file appears in list:
    ```
    Tool: browser_snapshot
    ```

11. Take screenshot:
    ```
    Tool: browser_take_screenshot
    (Save as: MEM-MEM_05-new_memory.png)
    ```

**Expected Result:** A new memory file is created with the specified name and content, and appears in the file list.
**Pass Criteria:** New file visible in the list after creation.
**Fail Criteria:** Save fails, or file does not appear in the list.

---

#### MEM-06: Delete memory file

**ID:** MEM-06
**Name:** Memory Deletion
**Preconditions:** MEM-05 passed, test memory file exists
**Steps:**

1. Take snapshot to find the test memory file:
   ```
   Tool: browser_snapshot
   ```

2. Locate the "e2e_test_memory" file and look for a delete button/action:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     deleteButtons: Array.from(document.querySelectorAll('button')).filter(b =>
       b.textContent?.match(/delete|remove|trash/i)
     ).map(b => ({ text: b.textContent, ariaLabel: b.getAttribute('aria-label') })),
     memoryItems: Array.from(document.querySelectorAll('[class*="file"], [class*="item"]')).map(item => item.textContent?.substring(0, 50))
   })
   ```

3. Click delete on the test memory file:
   ```
   Tool: browser_click
   Parameters: element=<delete button ref_id>
   ```

4. Handle confirmation dialog if it appears:
   ```
   Tool: browser_snapshot
   ```
   ```
   Tool: browser_click
   Parameters: element=<confirm delete button ref_id>
   ```

5. Wait for deletion:
   ```
   Tool: browser_evaluate
   Script: await new Promise(r => setTimeout(r, 1000)); 'waited'
   ```

6. Verify file is removed from list:
   ```
   Tool: browser_snapshot
   ```

7. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: MEM-MEM_06-memory_deleted.png)
   ```

**Expected Result:** The test memory file is deleted and no longer appears in the file list.
**Pass Criteria:** "e2e_test_memory" no longer visible in the list after deletion.
**Fail Criteria:** File still appears, or deletion throws an error.

---

### Suite 7: RESPONSIVE — Multi-Device Layout / 多设备响应式布局

**Purpose:** Verify the application renders correctly across different viewport sizes.

**Preconditions:** User logged in.

---

#### RESP-01: iPhone 12 (390x844) — Default mobile

**ID:** RESP-01
**Name:** iPhone 12 Layout
**Preconditions:** None
**Steps:**

1. Set viewport:
   ```
   Tool: browser_resize
   Parameters: width=390, height=844
   ```

2. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

3. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

4. Verify layout fits viewport:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     bodyWidth: document.body.scrollWidth,
     bodyHeight: document.body.scrollHeight,
     viewportWidth: window.innerWidth,
     viewportHeight: window.innerHeight,
     horizontalOverflow: document.body.scrollWidth > window.innerWidth,
     rootWidth: document.getElementById('root')?.scrollWidth
   })
   ```

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: RESP-RESP_01-iphone12.png)
   ```

6. Navigate to camera view and take screenshot:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```
   ```
   Tool: browser_take_screenshot
   (Save as: RESP-RESP_01-iphone12-camera.png)
   ```

**Expected Result:** All views fit within 390x844 viewport. No horizontal overflow.
**Pass Criteria:** `horizontalOverflow` is false. All UI elements visible without horizontal scrolling.
**Fail Criteria:** Horizontal overflow detected, or elements are cut off.

---

#### RESP-02: iPhone SE (375x667) — Smaller screen

**ID:** RESP-02
**Name:** iPhone SE Layout
**Preconditions:** None
**Steps:**

1. Set viewport:
   ```
   Tool: browser_resize
   Parameters: width=375, height=667
   ```

2. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

3. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

4. Verify no overflow or cutoff:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     bodyWidth: document.body.scrollWidth,
     viewportWidth: window.innerWidth,
     horizontalOverflow: document.body.scrollWidth > window.innerWidth,
     allButtonsVisible: Array.from(document.querySelectorAll('button')).every(b => {
       const rect = b.getBoundingClientRect();
       return rect.right <= 375 && rect.bottom <= 667;
     })
   })
   ```

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: RESP-RESP_02-iphoneSE.png)
   ```

6. Navigate to camera view:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```
   ```
   Tool: browser_take_screenshot
   (Save as: RESP-RESP_02-iphoneSE-camera.png)
   ```

**Expected Result:** All views fit within 375x667. No cutoff or overflow. Buttons and interactive elements remain accessible.
**Pass Criteria:** No horizontal overflow. Key buttons (shutter, FAB, navigation) remain within viewport.
**Fail Criteria:** Overflow detected, or critical buttons are outside the viewport.

---

#### RESP-03: iPad (768x1024) — Tablet layout

**ID:** RESP-03
**Name:** iPad Layout
**Preconditions:** None
**Steps:**

1. Set viewport:
   ```
   Tool: browser_resize
   Parameters: width=768, height=1024
   ```

2. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

3. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

4. Check if mobile layout is still used (or if DeviceFrame appears):
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     bodyWidth: document.body.scrollWidth,
     viewportWidth: window.innerWidth,
     hasDeviceFrame: !!document.querySelector('[class*="device"], [class*="frame"], [class*="phone"], [class*="simulator"]'),
     contentWidth: document.querySelector('#root > div')?.clientWidth || 0,
     isMobileLayout: (document.querySelector('#root > div')?.clientWidth || 0) < 500
   })
   ```

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: RESP-RESP_03-ipad.png)
   ```

**Expected Result:** On iPad viewport, the app either maintains mobile layout or shows the DeviceFrame phone simulator. Content should not stretch to fill the full 768px width in an ugly way.
**Pass Criteria:** Layout is presentable — either constrained mobile layout or DeviceFrame wrapping.
**Fail Criteria:** Layout is broken, elements stretched or misaligned.

---

#### RESP-04: Desktop 1080p (1920x1080) — DeviceFrame

**ID:** RESP-04
**Name:** Desktop 1080p Layout
**Preconditions:** None
**Steps:**

1. Set viewport:
   ```
   Tool: browser_resize
   Parameters: width=1920, height=1080
   ```

2. Navigate to /home:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

3. Take snapshot:
   ```
   Tool: browser_snapshot
   ```

4. Verify DeviceFrame is rendering:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     hasDeviceFrame: !!document.querySelector('[class*="device"], [class*="frame"], [class*="phone"], [class*="simulator"]'),
     innerAppWidth: document.querySelector('[class*="device"], [class*="frame"]')?.clientWidth || document.querySelector('#root > div > div')?.clientWidth || 0,
     centeredHorizontally: (() => {
       const frame = document.querySelector('[class*="device"], [class*="frame"]');
       if (!frame) return false;
       const rect = frame.getBoundingClientRect();
       return Math.abs((rect.left + rect.right) / 2 - 960) < 100;
     })()
   })
   ```

5. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: RESP-RESP_04-desktop.png)
   ```

6. Navigate to camera view:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```
   ```
   Tool: browser_take_screenshot
   (Save as: RESP-RESP_04-desktop-camera.png)
   ```

7. **Reset viewport to iPhone 12:**
   ```
   Tool: browser_resize
   Parameters: width=390, height=844
   ```

**Expected Result:** Desktop viewport shows the DeviceFrame phone simulator centered on screen. The app is contained within the simulated phone frame.
**Pass Criteria:** DeviceFrame element found, inner app width < 500px, frame is approximately centered.
**Fail Criteria:** No DeviceFrame, or app stretches to full desktop width.

---

### Suite 8: PERF — Frontend Performance Baselines / 前端性能基准

**Purpose:** Measure key frontend performance metrics and validate they meet SLA targets.

**Preconditions:** User logged in. Viewport at 390x844. Tests should be run on the default iPhone 12 viewport.

---

#### PERF-01: T_page_load — Time to interactive < 3s

**ID:** PERF-01
**Name:** Page Load Performance
**SLA Target:** < 3000ms
**Steps:**

1. Navigate fresh:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

2. Measure TTI:
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     navigationStart: performance.timing.navigationStart,
     domInteractive: performance.timing.domInteractive,
     domContentLoaded: performance.timing.domContentLoadedEventEnd,
     loadComplete: performance.timing.loadEventEnd,
     TTI_ms: performance.timing.domInteractive - performance.timing.navigationStart,
     DCL_ms: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
     fullLoad_ms: performance.timing.loadEventEnd - performance.timing.navigationStart
   })
   ```

3. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: PERF-PERF_01-page_load.png)
   ```

**SLA:** TTI_ms < 3000
**Pass Criteria:** `TTI_ms < 3000`
**Fail Criteria:** `TTI_ms >= 3000`

---

#### PERF-02: T_livekit_connect — WebSocket connection < 5s

**ID:** PERF-02
**Name:** LiveKit WebSocket Connection
**SLA Target:** < 5000ms
**Steps:**

1. Navigate to camera view (where LiveKit connects):
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

2. Monitor for WebSocket connection:
   ```
   Tool: browser_evaluate
   Script: window.__wsConnectStart = performance.now();
   window.__wsConnected = new Promise(resolve => {
     const check = () => {
       const wsCount = performance._getEntriesByType ? 0 : Array.from(document.querySelectorAll('*')).length;
       // Check for LiveKit connection state in React state
       const connected = document.querySelector('[class*="connected"], [class*="waiting"], [class*="listening"]');
       if (connected) resolve(performance.now() - window.__wsConnectStart);
       else setTimeout(check, 200);
     };
     check();
     setTimeout(() => resolve(-1), 10000); // timeout after 10s
   });
   'monitoring started'
   ```

3. Wait for connection:
   ```
   Tool: browser_evaluate
   Script: await window.__wsConnected
   ```

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: PERF-PERF_02-livekit_connect.png)
   ```

**SLA:** Connection time < 5000ms (or -1 if timeout)
**Pass Criteria:** Connection time > 0 and < 5000ms.
**Fail Criteria:** Connection time >= 5000ms or returns -1 (timeout). If LiveKit server is not available in test environment, test is SKIPPED.

---

#### PERF-03: T_camera_ready — Camera video track active < 3s

**ID:** PERF-03
**Name:** Camera Ready Time
**SLA Target:** < 3000ms
**Steps:**

1. Navigate to camera view:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

2. Monitor video readyState:
   ```
   Tool: browser_evaluate
   Script: window.__cameraStart = performance.now();
   window.__cameraReady = new Promise(resolve => {
     const check = () => {
       const video = document.querySelector('video');
       if (video && video.readyState >= 2) resolve(performance.now() - window.__cameraStart);
       else setTimeout(check, 200);
     };
     check();
     setTimeout(() => resolve(-1), 5000);
   });
   'monitoring camera'
   ```

3. Wait for camera:
   ```
   Tool: browser_evaluate
   Script: await window.__cameraReady
   ```

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: PERF-PERF_03-camera_ready.png)
   ```

**SLA:** Camera ready time < 3000ms
**Pass Criteria:** Camera ready time > 0 and < 3000ms.
**Fail Criteria:** Camera ready time >= 3000ms or -1 (timeout). In headless mode without camera access, test is SKIPPED with note.

---

#### PERF-04: T_first_agent_msg — First agent transcript < 10s

**ID:** PERF-04
**Name:** First Agent Message Latency
**SLA Target:** < 10000ms
**Steps:**

1. Navigate to camera view (agent connects automatically):
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL
   ```

2. Monitor for first agent transcript/message:
   ```
   Tool: browser_evaluate
   Script: window.__agentMsgStart = performance.now();
   window.__firstAgentMsg = new Promise(resolve => {
     const observer = new MutationObserver(() => {
       const agentText = document.querySelector('[class*="transcript"], [class*="agent"], [class*="message"]');
       if (agentText && agentText.textContent?.length > 5) {
         observer.disconnect();
         resolve(performance.now() - window.__agentMsgStart);
       }
     });
     observer.observe(document.body, { childList: true, subtree: true, characterData: true });
     setTimeout(() => { observer.disconnect(); resolve(-1); }, 15000);
   });
   'monitoring agent messages'
   ```

3. Wait for first message:
   ```
   Tool: browser_evaluate
   Script: await window.__firstAgentMsg
   ```

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: PERF-PERF_04-first_agent_msg.png)
   ```

**SLA:** First agent message < 10000ms
**Pass Criteria:** Agent message time > 0 and < 10000ms.
**Fail Criteria:** Agent message time >= 10000ms or -1 (timeout). If agent service is down, test is SKIPPED.

---

#### PERF-05: T_session_transition — Camera → session view < 1s

**ID:** PERF-05
**Name:** Session Transition Speed
**SLA Target:** < 1000ms
**Steps:**

This metric is collected during CAM-07. The value from `performance.now() - window.__transitionStart` should be recorded.

1. If not already measured in CAM-07, replicate the flow:
   - Navigate to camera, capture photo, click Done
   - Measure: `performance.now()` before click minus `performance.now()` after session view loads

2. Record the value.

**SLA:** Transition time < 1000ms
**Pass Criteria:** Transition time < 1000ms.
**Fail Criteria:** Transition time >= 1000ms.

---

#### PERF-06: T_history_load — /home task list renders < 2s

**ID:** PERF-06
**Name:** History Load Performance
**SLA Target:** < 2000ms
**Steps:**

1. Measure full /home load:
   ```
   Tool: browser_evaluate
   Script: window.__histStart = performance.now(); window.__histStart
   ```

2. Navigate:
   ```
   Tool: browser_navigate
   Parameters: url=$BASE_URL/home
   ```

3. Wait for task cards to render:
   ```
   Tool: browser_evaluate
   Script: window.__histReady = new Promise(resolve => {
     const check = () => {
       const cards = document.querySelectorAll('[class*="task"], [class*="card"]');
       const emptyState = document.querySelector('[class*="empty"]');
       if (cards.length > 0 || emptyState) resolve(performance.now() - window.__histStart);
       else setTimeout(check, 100);
     };
     check();
     setTimeout(() => resolve(-1), 5000);
   });
   await window.__histReady
   ```

4. Take screenshot:
   ```
   Tool: browser_take_screenshot
   (Save as: PERF-PERF_06-history_load.png)
   ```

**SLA:** History load time < 2000ms
**Pass Criteria:** Load time > 0 and < 2000ms.
**Fail Criteria:** Load time >= 2000ms or -1 (timeout).

---

## 3. Performance Profiling / 性能分析

### SLA Targets Table

| Metric ID | Metric Name | SLA Target | Measurement Method |
|---|---|---|---|
| PERF-01 | T_page_load | < 3000ms | Navigation Timing API (`domInteractive - navigationStart`) |
| PERF-02 | T_livekit_connect | < 5000ms | MutationObserver on agent status element |
| PERF-03 | T_camera_ready | < 3000ms | Video element `readyState >= 2` polling |
| PERF-04 | T_first_agent_msg | < 10000ms | MutationObserver on transcript elements |
| PERF-05 | T_session_transition | < 1000ms | `performance.now()` delta around Done click |
| PERF-06 | T_history_load | < 2000ms | Task card appearance polling after navigation |

### How to Measure Using Playwright MCP

All timing measurements use `browser_evaluate` to run JavaScript in the page context. Two primary patterns:

**Pattern A — Navigation Timing API (for page loads):**
```javascript
JSON.stringify({
  TTI_ms: performance.timing.domInteractive - performance.timing.navigationStart,
  DCL_ms: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
  fullLoad_ms: performance.timing.loadEventEnd - performance.timing.navigationStart
})
```

**Pattern B — Performance.now() Delta (for in-page transitions):**
```javascript
// Before action:
window.__startTime = performance.now();

// After action completes:
const elapsed = performance.now() - window.__startTime;
```

**Pattern C — MutationObserver (for async content appearance):**
```javascript
window.__startTime = performance.now();
const result = await new Promise(resolve => {
  const observer = new MutationObserver(() => {
    if (/* condition met */) {
      observer.disconnect();
      resolve(performance.now() - window.__startTime);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { observer.disconnect(); resolve(-1); }, timeoutMs);
});
```

### Key User-Perceived Latency Points

1. **App startup** — from navigation to first interactive element (PERF-01)
2. **Agent connection** — from page load to agent greeting (PERF-02 + PERF-04)
3. **Photo → Analysis** — from shutter click to agent starting to process (PERF-05 + time in session)
4. **History browsing** — from /home navigation to task cards visible (PERF-06)
5. **View transitions** — smoothness of camera→session and session→history navigation

---

## 4. QA Report Templates / QA 报告模板

### JSON Report Template

After completing all test suites, the executing agent MUST generate a JSON report following this schema:

```json
{
  "meta": {
    "type": "browser",
    "date": "2026-02-28T00:00:00.000Z",
    "target_url": "http://YOUR_SERVER_IP",
    "executor": "claude-code-agent",
    "duration_seconds": 0,
    "viewport": "390x844",
    "browser": "chromium",
    "playwright_version": "latest"
  },
  "summary": {
    "total": 50,
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "pass_rate": 0.0
  },
  "suites": [
    {
      "name": "APP-LOAD",
      "status": "passed|failed|partial",
      "tests": [
        {
          "id": "APP-01",
          "name": "Page Load Time",
          "status": "passed|failed|skipped",
          "duration_ms": 0,
          "details": "TTI: 1200ms (SLA: <3000ms)",
          "screenshot": "APP-APP_01-page_loaded.png"
        }
      ]
    },
    {
      "name": "AUTH-FLOW",
      "status": "",
      "tests": [
        { "id": "AUTH-01", "name": "HistoryView Route", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "AUTH-02", "name": "Auth Overlay Trigger", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "AUTH-03", "name": "New Account Signup", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "AUTH-04", "name": "Verify Logged-In State", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "AUTH-05", "name": "Session Persistence", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "AUTH-06", "name": "Logout Flow", "status": "", "duration_ms": 0, "details": "", "screenshot": "" }
      ]
    },
    {
      "name": "CAMERA",
      "status": "",
      "tests": [
        { "id": "CAM-01", "name": "Camera View Render", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "CAM-02", "name": "Agent Status Card", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "CAM-03", "name": "Agent Connection State", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "CAM-04", "name": "Shutter Button", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "CAM-05", "name": "Photo Capture", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "CAM-06", "name": "Multi-Photo Capture", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "CAM-07", "name": "Done Session Transition", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "CAM-08", "name": "Mic Toggle", "status": "", "duration_ms": 0, "details": "", "screenshot": "" }
      ]
    },
    {
      "name": "SESSION",
      "status": "",
      "tests": [
        { "id": "SESS-01", "name": "Session View Load", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "SESS-02", "name": "Timeline Block Types", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "SESS-03", "name": "Processing Indicator", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "SESS-04", "name": "HTML Iframe Rendering", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "SESS-05", "name": "Streaming HTML Updates", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "SESS-06", "name": "Chat Input", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "SESS-07", "name": "Chat Message Send", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "SESS-08", "name": "Session History Navigation", "status": "", "duration_ms": 0, "details": "", "screenshot": "" }
      ]
    },
    {
      "name": "HISTORY",
      "status": "",
      "tests": [
        { "id": "HIST-01", "name": "History View Load", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "HIST-02", "name": "Task Cards with Thumbnails", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "HIST-03", "name": "Active Task Indicators", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "HIST-04", "name": "Task Card Session Navigation", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "HIST-05", "name": "Task Delete Flow", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "HIST-06", "name": "Camera FAB Navigation", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "HIST-07", "name": "Task List Refresh", "status": "", "duration_ms": 0, "details": "", "screenshot": "" }
      ]
    },
    {
      "name": "MEMORY",
      "status": "",
      "tests": [
        { "id": "MEM-01", "name": "Memory View Load", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "MEM-02", "name": "Memory File List", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "MEM-03", "name": "Memory Content View", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "MEM-04", "name": "Memory Edit Mode", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "MEM-05", "name": "New Memory Creation", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "MEM-06", "name": "Memory Deletion", "status": "", "duration_ms": 0, "details": "", "screenshot": "" }
      ]
    },
    {
      "name": "RESPONSIVE",
      "status": "",
      "tests": [
        { "id": "RESP-01", "name": "iPhone 12 Layout", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "RESP-02", "name": "iPhone SE Layout", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "RESP-03", "name": "iPad Layout", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "RESP-04", "name": "Desktop 1080p Layout", "status": "", "duration_ms": 0, "details": "", "screenshot": "" }
      ]
    },
    {
      "name": "PERF",
      "status": "",
      "tests": [
        { "id": "PERF-01", "name": "T_page_load", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "PERF-02", "name": "T_livekit_connect", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "PERF-03", "name": "T_camera_ready", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "PERF-04", "name": "T_first_agent_msg", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "PERF-05", "name": "T_session_transition", "status": "", "duration_ms": 0, "details": "", "screenshot": "" },
        { "id": "PERF-06", "name": "T_history_load", "status": "", "duration_ms": 0, "details": "", "screenshot": "" }
      ]
    }
  ],
  "performance": {
    "latencies": {
      "T_page_load": { "value_ms": 0, "sla_ms": 3000, "pass": false },
      "T_livekit_connect": { "value_ms": 0, "sla_ms": 5000, "pass": false },
      "T_camera_ready": { "value_ms": 0, "sla_ms": 3000, "pass": false },
      "T_first_agent_msg": { "value_ms": 0, "sla_ms": 10000, "pass": false },
      "T_session_transition": { "value_ms": 0, "sla_ms": 1000, "pass": false },
      "T_history_load": { "value_ms": 0, "sla_ms": 2000, "pass": false }
    }
  },
  "bugs": [
    {
      "id": "BUG-001",
      "severity": "critical|high|medium|low",
      "title": "Short bug title",
      "description": "Detailed description of the bug",
      "reproduction": "Step-by-step reproduction instructions",
      "screenshot": "screenshot_filename.png",
      "affected_suite": "SUITE_NAME",
      "affected_test": "TEST-ID"
    }
  ]
}
```

### Markdown Report Template

Save alongside the JSON report as `tests/reports/browser_e2e_report.md`:

```markdown
# VI-Agent Browser E2E Test Report

**Date:** {ISO date}
**Target URL:** {base URL}
**Viewport:** 390x844 (iPhone 12)
**Executor:** Claude Code Agent (Playwright MCP)
**Duration:** {total seconds}s

---

## Summary

| Metric | Value |
|---|---|
| Total Tests | {total} |
| Passed | {passed} |
| Failed | {failed} |
| Skipped | {skipped} |
| Pass Rate | {rate}% |

---

## Suite Results

### APP-LOAD ({status})

| ID | Test | Status | Time | Notes |
|---|---|---|---|---|
| APP-01 | Page Load Time | {status} | {ms}ms | {details} |
| APP-02 | Splash & React Mount | {status} | {ms}ms | {details} |
| APP-03 | PWA Meta Tags | {status} | {ms}ms | {details} |
| APP-04 | Camera Permission | {status} | {ms}ms | {details} |
| APP-05 | Desktop DeviceFrame | {status} | {ms}ms | {details} |

### AUTH-FLOW ({status})

| ID | Test | Status | Time | Notes |
|---|---|---|---|---|
| AUTH-01 | HistoryView Route | {status} | {ms}ms | {details} |
| AUTH-02 | Auth Overlay Trigger | {status} | {ms}ms | {details} |
| AUTH-03 | New Account Signup | {status} | {ms}ms | {details} |
| AUTH-04 | Verify Logged-In State | {status} | {ms}ms | {details} |
| AUTH-05 | Session Persistence | {status} | {ms}ms | {details} |
| AUTH-06 | Logout Flow | {status} | {ms}ms | {details} |

### CAMERA ({status})

| ID | Test | Status | Time | Notes |
|---|---|---|---|---|
| CAM-01 | Camera View Render | {status} | {ms}ms | {details} |
| CAM-02 | Agent Status Card | {status} | {ms}ms | {details} |
| CAM-03 | Agent Connection State | {status} | {ms}ms | {details} |
| CAM-04 | Shutter Button | {status} | {ms}ms | {details} |
| CAM-05 | Photo Capture | {status} | {ms}ms | {details} |
| CAM-06 | Multi-Photo Capture | {status} | {ms}ms | {details} |
| CAM-07 | Done Session Transition | {status} | {ms}ms | {details} |
| CAM-08 | Mic Toggle | {status} | {ms}ms | {details} |

### SESSION ({status})

| ID | Test | Status | Time | Notes |
|---|---|---|---|---|
| SESS-01 | Session View Load | {status} | {ms}ms | {details} |
| SESS-02 | Timeline Block Types | {status} | {ms}ms | {details} |
| SESS-03 | Processing Indicator | {status} | {ms}ms | {details} |
| SESS-04 | HTML Iframe Rendering | {status} | {ms}ms | {details} |
| SESS-05 | Streaming HTML Updates | {status} | {ms}ms | {details} |
| SESS-06 | Chat Input | {status} | {ms}ms | {details} |
| SESS-07 | Chat Message Send | {status} | {ms}ms | {details} |
| SESS-08 | Session History Nav | {status} | {ms}ms | {details} |

### HISTORY ({status})

| ID | Test | Status | Time | Notes |
|---|---|---|---|---|
| HIST-01 | History View Load | {status} | {ms}ms | {details} |
| HIST-02 | Task Cards Thumbnails | {status} | {ms}ms | {details} |
| HIST-03 | Active Task Indicators | {status} | {ms}ms | {details} |
| HIST-04 | Task Card Navigation | {status} | {ms}ms | {details} |
| HIST-05 | Task Delete Flow | {status} | {ms}ms | {details} |
| HIST-06 | Camera FAB | {status} | {ms}ms | {details} |
| HIST-07 | Task List Refresh | {status} | {ms}ms | {details} |

### MEMORY ({status})

| ID | Test | Status | Time | Notes |
|---|---|---|---|---|
| MEM-01 | Memory View Load | {status} | {ms}ms | {details} |
| MEM-02 | Memory File List | {status} | {ms}ms | {details} |
| MEM-03 | Memory Content View | {status} | {ms}ms | {details} |
| MEM-04 | Memory Edit Mode | {status} | {ms}ms | {details} |
| MEM-05 | New Memory Creation | {status} | {ms}ms | {details} |
| MEM-06 | Memory Deletion | {status} | {ms}ms | {details} |

### RESPONSIVE ({status})

| ID | Test | Status | Time | Notes |
|---|---|---|---|---|
| RESP-01 | iPhone 12 Layout | {status} | {ms}ms | {details} |
| RESP-02 | iPhone SE Layout | {status} | {ms}ms | {details} |
| RESP-03 | iPad Layout | {status} | {ms}ms | {details} |
| RESP-04 | Desktop 1080p | {status} | {ms}ms | {details} |

### PERF ({status})

| ID | Metric | SLA | Actual | Status |
|---|---|---|---|---|
| PERF-01 | T_page_load | < 3000ms | {ms}ms | {status} |
| PERF-02 | T_livekit_connect | < 5000ms | {ms}ms | {status} |
| PERF-03 | T_camera_ready | < 3000ms | {ms}ms | {status} |
| PERF-04 | T_first_agent_msg | < 10000ms | {ms}ms | {status} |
| PERF-05 | T_session_transition | < 1000ms | {ms}ms | {status} |
| PERF-06 | T_history_load | < 2000ms | {ms}ms | {status} |

---

## Performance Summary

| Metric | Target | Actual | Status |
|---|---|---|---|
| T_page_load | < 3s | {value} | {pass/fail} |
| T_livekit_connect | < 5s | {value} | {pass/fail} |
| T_camera_ready | < 3s | {value} | {pass/fail} |
| T_first_agent_msg | < 10s | {value} | {pass/fail} |
| T_session_transition | < 1s | {value} | {pass/fail} |
| T_history_load | < 2s | {value} | {pass/fail} |

---

## Bugs Found

{For each bug:}

### BUG-{id}: {title}

**Severity:** {critical|high|medium|low}
**Suite:** {affected suite}
**Test:** {affected test ID}

**Description:** {detailed description}

**Reproduction:**
1. {step 1}
2. {step 2}
3. ...

**Screenshot:** {filename}

---

## Screenshots

All screenshots saved to `tests/reports/screenshots/`

{List all captured screenshots with descriptions}
```

---

## 5. Visual Evidence Protocol / 视觉证据协议

### When to Take Screenshots

Screenshots MUST be captured at the following checkpoints:

| Checkpoint | When | Example Filename |
|---|---|---|
| **Before critical action** | Before clicking submit, delete, or navigate | `AUTH-AUTH_03-form_filled.png` |
| **After critical action** | After the action completes and view settles | `AUTH-AUTH_03-signup_complete.png` |
| **On failure** | When a test assertion fails | `AUTH-AUTH_03-FAIL-error_msg.png` |
| **Layout verification** | When checking responsive layouts | `RESP-RESP_04-desktop.png` |
| **Performance proof** | After performance measurement | `PERF-PERF_01-page_load.png` |
| **State transitions** | Before and after view changes | `CAM-CAM_07-session_view.png` |

### Screenshot Naming Convention

Format: `{SUITE}-{TEST_ID}-{step_description}.png`

Rules:
- `{SUITE}` — uppercase suite name (APP, AUTH, CAM, SESS, HIST, MEM, RESP, PERF)
- `{TEST_ID}` — full test ID (APP_01, AUTH_03, etc.)
- `{step_description}` — lowercase, underscore-separated description of the checkpoint
- On failure, prefix step description with `FAIL-`

Examples:
```
APP-APP_01-page_loaded.png
AUTH-AUTH_02-auth_overlay.png
AUTH-AUTH_03-form_filled.png
AUTH-AUTH_03-signup_complete.png
CAM-CAM_05-photo_captured.png
CAM-CAM_05-FAIL-no_preview.png
RESP-RESP_04-desktop.png
RESP-RESP_04-desktop-camera.png
PERF-PERF_01-page_load.png
```

### Storage Location

All screenshots are saved to:
```
tests/reports/screenshots/
```

The executing agent should ensure this directory exists before running tests:
```
Tool: browser_evaluate
Script: 'screenshots will be saved by the agent to tests/reports/screenshots/'
```

Note: Since Playwright MCP's `browser_take_screenshot` returns screenshot data, the agent should save screenshots using the Write tool or note the screenshot was captured and reference the tool call output.

---

## 6. Troubleshooting / 故障排除

### Common Browser Test Failure Patterns

#### 6.1 Camera Permission Denied in Headless Mode

**Symptom:** CAM-01 fails because no camera stream is available.
**Cause:** Headless Playwright does not have access to a physical camera.
**Solution:**
- The app should have a fallback for missing camera (static image or video).
- Mark camera-dependent tests as SKIPPED in headless mode.
- Check `navigator.mediaDevices.getUserMedia` availability:
  ```
  Tool: browser_evaluate
  Script: typeof navigator.mediaDevices?.getUserMedia
  ```
- If `undefined`, note this in the test results and skip pure camera tests.

#### 6.2 LiveKit Connection Timeout

**Symptom:** PERF-02 times out. Agent card stays in "connecting" state.
**Cause:** LiveKit server may not be running, or network rules block WebSocket connections from the test environment.
**Solution:**
- Verify LiveKit server is reachable:
  ```
  Tool: browser_evaluate
  Script: fetch('/api/livekit/health').then(r => r.status).catch(e => e.message)
  ```
- Check for WebSocket errors in console:
  ```
  Tool: browser_console_messages
  ```
- If LiveKit is down, skip PERF-02, PERF-04, and note dependency in CAM-02/CAM-03 results.

#### 6.3 Selector Not Found (Dynamic Content)

**Symptom:** `browser_click` or `browser_fill_form` fails with "element not found."
**Cause:** React renders content dynamically; the element may not exist yet when the tool is called.
**Solution:**
- Always use `browser_snapshot` before `browser_click` to get fresh ref IDs.
- Use `browser_wait_for` before interacting with dynamic content.
- Use `browser_evaluate` with polling for elements that appear asynchronously:
  ```
  Tool: browser_evaluate
  Script: await new Promise(resolve => {
    const check = () => {
      if (document.querySelector('YOUR_SELECTOR')) resolve(true);
      else setTimeout(check, 200);
    };
    check();
    setTimeout(() => resolve(false), 5000);
  })
  ```

#### 6.4 Iframe Content Not Accessible

**Symptom:** SESS-04 cannot read iframe content. `contentDocument` returns null or throws.
**Cause:** Same-origin policy may prevent access to iframe contents if the iframe src is a different origin, or if the iframe uses `srcdoc`.
**Solution:**
- For `srcdoc` iframes, content should be accessible directly.
- For cross-origin iframes, you can only check dimensions and src attribute:
  ```
  Tool: browser_evaluate
  Script: JSON.stringify({
    iframeSrc: document.querySelector('iframe')?.src,
    iframeSrcdoc: document.querySelector('iframe')?.srcdoc?.substring(0, 200),
    iframeWidth: document.querySelector('iframe')?.clientWidth,
    iframeHeight: document.querySelector('iframe')?.clientHeight
  })
  ```
- If cross-origin, check the iframe dimensions and visible rendering via screenshot instead.

#### 6.5 CORS Issues

**Symptom:** API calls fail. Console shows CORS errors.
**Cause:** Browser making requests to API that doesn't include proper CORS headers.
**Solution:**
- Check console for CORS errors:
  ```
  Tool: browser_console_messages
  ```
- The production deployment proxies API through nginx at `/api/`, so CORS should not be an issue. If it is, the nginx configuration may be incorrect.
- Verify API proxy is working:
  ```
  Tool: browser_evaluate
  Script: fetch('/api/health').then(r => r.json()).catch(e => e.message)
  ```

#### 6.6 React App Fails to Mount

**Symptom:** APP-02 fails. `#root` is empty.
**Cause:** JavaScript bundle failed to load, or a runtime error prevents React from mounting.
**Solution:**
- Check console for errors:
  ```
  Tool: browser_console_messages
  ```
- Check if JS bundle loaded:
  ```
  Tool: browser_evaluate
  Script: JSON.stringify({
    scripts: Array.from(document.querySelectorAll('script[src]')).map(s => s.src),
    rootContent: document.getElementById('root')?.innerHTML?.substring(0, 200)
  })
  ```
- If bundle failed, check network:
  ```
  Tool: browser_evaluate
  Script: performance.getEntriesByType('resource').filter(r => r.name.includes('.js')).map(r => ({
    name: r.name.split('/').pop(),
    status: r.responseStatus,
    duration: r.duration
  }))
  ```

#### 6.7 Stale Element References

**Symptom:** `browser_click` fails after a view transition.
**Cause:** After React re-renders, old element references from `browser_snapshot` become stale.
**Solution:**
- Always take a fresh `browser_snapshot` after any navigation or significant state change before attempting to click elements.
- Do NOT reuse ref IDs from a snapshot taken before a page transition.

#### 6.8 Touch Events Not Supported

**Symptom:** HIST-05 long-press does not trigger.
**Cause:** Playwright MCP may not have native touch event support.
**Solution:**
- Use `browser_evaluate` to manually dispatch touch events (as shown in HIST-05).
- If touch events don't work, try right-click/contextmenu as an alternative:
  ```
  Tool: browser_evaluate
  Script: document.querySelector('[class*="card"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
  ```
- If neither works, mark the test as SKIPPED with a note about touch event limitations.

---

## 7. Execution Instructions for Agent / 执行指南

### Step-by-Step Execution Protocol

The executing Claude Code agent MUST follow these steps in order:

#### Step 1: Environment Setup

1. **Install Playwright browser** (do this once per session):
   ```
   Tool: browser_install
   ```

2. **Set viewport to iPhone 12 (390x844):**
   ```
   Tool: browser_resize
   Parameters: width=390, height=844
   ```

3. **Create screenshot output directory:**
   ```
   Tool: Bash
   Command: mkdir -p ./tests/reports/screenshots
   ```

4. **Record test run start time:**
   ```
   Tool: browser_evaluate
   Script: window.__testRunStart = Date.now(); JSON.stringify({ startTime: new Date().toISOString() })
   ```

#### Step 2: Resolve Base URL

Check for `VI_TEST_BASE_URL` environment variable:
```
Tool: Bash
Command: echo "${VI_TEST_BASE_URL:-http://YOUR_SERVER_IP}"
```

Use the resolved URL as `$BASE_URL` for all subsequent navigation.

#### Step 3: Run Suites Sequentially

Execute suites in this order (some suites depend on prior suite state):

1. **APP-LOAD** — No dependencies, tests basic loading
2. **AUTH-FLOW** — No dependencies, but creates auth state needed later
3. **CAMERA** — Depends on AUTH (need logged-in user)
4. **SESSION** — Depends on CAMERA (need active session from photo capture)
5. **HISTORY** — Depends on AUTH (need logged-in user with task history)
6. **MEMORY** — Depends on AUTH (need logged-in user)
7. **RESPONSIVE** — No dependencies, tests layout at different viewports
8. **PERF** — No dependencies, but best run with a warm/populated account

Within each suite, execute tests in order (e.g., APP-01 before APP-02).

#### Step 4: For Each Test

1. **Read the test specification** from this document
2. **Execute each step** using the specified Playwright MCP tool
3. **Capture screenshots** at the specified checkpoints
4. **Evaluate pass/fail criteria**
5. **Record the result** including:
   - Status: passed, failed, or skipped
   - Duration in milliseconds
   - Details: what was observed vs. expected
   - Screenshot filenames
   - Any errors or warnings from console

#### Step 5: Collect Performance Data

After running the PERF suite, compile all timing metrics into the performance section of the report.

Use this collection script at the end:
```
Tool: browser_evaluate
Script: JSON.stringify({
  navigationTiming: {
    TTI: performance.timing.domInteractive - performance.timing.navigationStart,
    DCL: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
    fullLoad: performance.timing.loadEventEnd - performance.timing.navigationStart
  },
  resourceCount: performance.getEntriesByType('resource').length,
  jsResources: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.js')).length,
  cssResources: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.css')).length,
  imgResources: performance.getEntriesByType('resource').filter(r => r.initiatorType === 'img').length
})
```

#### Step 6: Generate Reports

After all tests complete:

1. **Calculate summary statistics:**
   - Total test count
   - Passed, failed, skipped counts
   - Pass rate percentage
   - Total duration

2. **Generate JSON report:**
   - Fill in the JSON template from Section 4
   - Save to `tests/reports/browser_e2e_report.json`
   - Use the Write tool

3. **Generate Markdown report:**
   - Fill in the Markdown template from Section 4
   - Save to `tests/reports/browser_e2e_report.md`
   - Use the Write tool

4. **Compile bugs list:**
   - Any test that failed should generate a bug entry
   - Include severity, reproduction steps, and screenshot references

#### Step 7: Post-Run Cleanup

1. **Record end time and calculate duration:**
   ```
   Tool: browser_evaluate
   Script: JSON.stringify({
     endTime: new Date().toISOString(),
     durationMs: Date.now() - window.__testRunStart
   })
   ```

2. **Reset viewport to default iPhone 12:**
   ```
   Tool: browser_resize
   Parameters: width=390, height=844
   ```

3. **Verify report files were saved:**
   ```
   Tool: Bash
   Command: ls -la tests/reports/browser_e2e_report.*
   ```

### Important Agent Notes

- **Snapshot before click:** Always take a `browser_snapshot` to get fresh element references before any `browser_click` or `browser_fill_form` call.
- **Wait for state changes:** After navigation or state-changing actions, use `browser_wait_for` or `browser_evaluate` with polling before asserting.
- **Handle skippable tests:** Some tests depend on external services (LiveKit, S3). If a service is unavailable, mark the test as SKIPPED rather than FAILED.
- **Console monitoring:** Periodically check `browser_console_messages` for unexpected errors that might indicate bugs even if the visual test passes.
- **Idempotency:** The AUTH-03 signup test creates a new account with a timestamped email. This ensures tests are idempotent across runs.
- **Reset viewport:** After RESPONSIVE tests, always reset the viewport back to 390x844.
- **Element ref freshness:** Element ref IDs from `browser_snapshot` are only valid until the next snapshot or navigation. Never cache or reuse old refs.

---

## Appendix A: Quick Reference — Test ID Index

| Suite | ID | Name | SLA |
|---|---|---|---|
| APP-LOAD | APP-01 | Page Load Time | < 3s |
| APP-LOAD | APP-02 | Splash & React Mount | — |
| APP-LOAD | APP-03 | PWA Meta Tags | — |
| APP-LOAD | APP-04 | Camera Permission | — |
| APP-LOAD | APP-05 | Desktop DeviceFrame | — |
| AUTH-FLOW | AUTH-01 | HistoryView Route | — |
| AUTH-FLOW | AUTH-02 | Auth Overlay Trigger | — |
| AUTH-FLOW | AUTH-03 | New Account Signup | — |
| AUTH-FLOW | AUTH-04 | Verify Logged-In State | — |
| AUTH-FLOW | AUTH-05 | Session Persistence | — |
| AUTH-FLOW | AUTH-06 | Logout Flow | — |
| CAMERA | CAM-01 | Camera View Render | — |
| CAMERA | CAM-02 | Agent Status Card | — |
| CAMERA | CAM-03 | Agent Connection State | — |
| CAMERA | CAM-04 | Shutter Button | — |
| CAMERA | CAM-05 | Photo Capture | — |
| CAMERA | CAM-06 | Multi-Photo Capture | — |
| CAMERA | CAM-07 | Done Session Transition | < 1s |
| CAMERA | CAM-08 | Mic Toggle | — |
| SESSION | SESS-01 | Session View Load | — |
| SESSION | SESS-02 | Timeline Block Types | — |
| SESSION | SESS-03 | Processing Indicator | — |
| SESSION | SESS-04 | HTML Iframe Rendering | — |
| SESSION | SESS-05 | Streaming HTML Updates | — |
| SESSION | SESS-06 | Chat Input | — |
| SESSION | SESS-07 | Chat Message Send | — |
| SESSION | SESS-08 | Session History Nav | — |
| HISTORY | HIST-01 | History View Load | < 2s |
| HISTORY | HIST-02 | Task Cards Thumbnails | — |
| HISTORY | HIST-03 | Active Task Indicators | — |
| HISTORY | HIST-04 | Task Card Navigation | — |
| HISTORY | HIST-05 | Task Delete Flow | — |
| HISTORY | HIST-06 | Camera FAB | — |
| HISTORY | HIST-07 | Task List Refresh | — |
| MEMORY | MEM-01 | Memory View Load | — |
| MEMORY | MEM-02 | Memory File List | — |
| MEMORY | MEM-03 | Memory Content View | — |
| MEMORY | MEM-04 | Memory Edit Mode | — |
| MEMORY | MEM-05 | New Memory Creation | — |
| MEMORY | MEM-06 | Memory Deletion | — |
| RESPONSIVE | RESP-01 | iPhone 12 Layout | — |
| RESPONSIVE | RESP-02 | iPhone SE Layout | — |
| RESPONSIVE | RESP-03 | iPad Layout | — |
| RESPONSIVE | RESP-04 | Desktop 1080p | — |
| PERF | PERF-01 | T_page_load | < 3s |
| PERF | PERF-02 | T_livekit_connect | < 5s |
| PERF | PERF-03 | T_camera_ready | < 3s |
| PERF | PERF-04 | T_first_agent_msg | < 10s |
| PERF | PERF-05 | T_session_transition | < 1s |
| PERF | PERF-06 | T_history_load | < 2s |

---

## Appendix B: Agent Status State Machine

```
               ┌──────────────────────────────────────────────┐
               │                                              │
               ▼                                              │
  ┌─────────────────┐                                         │
  │    offline       │ ← No agent identity (RED)              │
  │    (red)         │                                         │
  └────────┬────────┘                                         │
           │ Agent connects                                   │
           ▼                                                  │
  ┌─────────────────┐                                         │
  │   connecting     │ ← Greeting not received (BLUE, pulse)  │
  │   (blue)         │                                         │
  └────────┬────────┘                                         │
           │ Greeting received                                │
           ▼                                                  │
  ┌─────────────────┐     User speaks      ┌───────────────┐ │
  │    waiting       │ ──────────────────► │   listening    │ │
  │    (green)       │ ◄────────────────── │   (purple)     │ │
  └────────┬────────┘     Silence          └───────────────┘ │
           │                                                  │
           │ Agent generates                                  │
           ▼                                                  │
  ┌─────────────────┐                                         │
  │   thinking       │ ← Generating response (CYAN, pulse)   │
  │   (cyan)         │                                         │
  └────────┬────────┘                                         │
           │ Camera active                                    │
           ▼                                                  │
  ┌─────────────────┐                                         │
  │    viewing       │ ← Camera processing (CYAN)             │
  │    (cyan)        │                                         │
  └─────────────────┘                                         │
                                                              │
  ┌─────────────────┐                                         │
  │ weak_connection  │ ← Quality degraded (YELLOW)            │
  │   (yellow)       │ ─────────────────────────────────────┘
  └─────────────────┘   (can transition to offline)
```

---

## Appendix C: View State Routing Map

```
URL Path          viewState         Component           Entry Point
─────────────────────────────────────────────────────────────────────
/                 camera            LiveCameraView       Default
/home             home              HistoryView          Direct URL
/memories         memory            MemoryView           Direct URL
(internal)        live-session      LiveSessionView      From camera Done
(internal)        history           HistoryView          From session Back
```

Navigation flows:
```
camera ──(Done)──► live-session ──(Back)──► history/home
                                               │
                                               ├──(Card click)──► live-session
                                               │
                                               └──(FAB)──► camera

home ──(nav link)──► memory ──(back)──► home
```

---

*End of Browser E2E Test Handbook*
