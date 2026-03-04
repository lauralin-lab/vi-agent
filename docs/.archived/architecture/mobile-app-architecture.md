# VI Agent Mobile App Architecture

## Executive Summary

将 VI Agent 从 Web 升级为 iOS/Android App，采用 **Flutter 原生壳 + WebView 内容层** 混合架构。核心交互（相机、语音、LiveKit WebRTC）由 Flutter 原生层驱动，AI 生成的内容展示由共享的 React "Content Bundle" 在 WebView 中渲染。这使得 PM 可以在 Web 版 vibe code 迭代 UI 效果，改动通过 Content Bundle 自动同步到手机端，无需 App 发版。

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      VI Agent Mobile App                        │
│                     (Flutter Native Shell)                       │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │   Camera Screen  │  │  Session Screen   │  │ History/Memory│  │
│  │   [100% Native]  │  │   [Hybrid]        │  │  [WebView]    │  │
│  │                  │  │                   │  │               │  │
│  │  Camera Preview  │  │  Flutter Header   │  │  React        │  │
│  │  LiveKit Voice   │  │  ┌─────────────┐ │  │  Content      │  │
│  │  Intention Card  │  │  │ WebView     │ │  │  Bundle       │  │
│  │  Action Buttons  │  │  │ AI Content  │ │  │               │  │
│  │  Scan Overlay    │  │  │ + Modules   │ │  │               │  │
│  │                  │  │  └─────────────┘ │  │               │  │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Native Platform Layer                        │  │
│  │  LiveKit SDK (v2.6) │ Camera (0.11) │ Permissions        │  │
│  │  Push Notifications │ Auth (JWT)    │ Background Tasks   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              WebView Content Engine                       │  │
│  │  Pre-warmed Pool │ JS Bridge │ Theme Sync │ Hot Update   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
    WebRTC/RPC          DataChannel            HTTP REST
         ▼                    ▼                    ▼
    vi-realtime          vi-gateway           api-server
```

## 2. Three-Layer Architecture

### Layer 1: Native Interaction Layer (Flutter)

**Responsibilities:**
- Camera capture & live preview (native camera plugin)
- LiveKit WebRTC connection (audio/video tracks + DataChannel)
- Voice input/output with native audio session management
- App navigation via go_router
- OS permissions (camera, mic, notifications)
- Push notifications
- JWT & Device authentication
- App lifecycle & background task management

**Key constraint:** Camera and voice MUST be native. WebView `getUserMedia()` has critical bugs on iOS — permission popups recur, WKWebView compatibility issues. LiveKit needs native audio session for echo cancellation and background audio.

### Layer 2: Content Display Layer (WebView)

**Responsibilities:**
- Render AI-generated HTML (streaming, append-based)
- Render 8 structured module types (PlaceCard, Recipe, Weather, etc.)
- Display session history list
- Display memory/profile views
- Handle content interactions (data-action buttons)
- Adapt to dark/light theme and dynamic font size

**Key advantage:** Content components are shared React code between Web and App. PM changes React components → `npm run build:mobile` → App WebView shows new UI automatically.

### Layer 3: Bridge Layer (JS Channel)

**Responsibilities:**
- Forward LiveKit DataChannel messages from Flutter to WebView
- Relay user interactions from WebView back to Flutter
- Sync theme/appearance settings
- Handle WebView resize events
- Navigate between Flutter screens based on WebView events

## 3. Content Bundle Architecture

### Frontend Monorepo Split

```
frontend/
├── src/
│   ├── app-web.jsx            # Web entry: full app (Camera + Content)
│   ├── app-mobile.jsx         # Mobile entry: content only (no Camera/LiveKit)
│   │
│   ├── components/            # SHARED (used by both web and mobile)
│   │   ├── PersistentHtmlRenderer.jsx
│   │   ├── modules/
│   │   │   ├── ModuleRenderer.jsx
│   │   │   ├── PlaceCardModule.jsx
│   │   │   ├── WeatherModule.jsx
│   │   │   ├── RecipeModule.jsx
│   │   │   ├── ChecklistModule.jsx
│   │   │   ├── ComparisonModule.jsx
│   │   │   ├── StepsGuideModule.jsx
│   │   │   ├── InfoCardModule.jsx
│   │   │   └── ImageGalleryModule.jsx
│   │   ├── HistoryView.jsx
│   │   ├── MemoryView.jsx
│   │   └── shared.jsx         # Glassmorphism design system
│   │
│   ├── hooks/                 # WEB-ONLY (tree-shaken in mobile build)
│   │   ├── useAgentProtocol.js
│   │   ├── useLiveKit.js
│   │   └── useRoomConnection.js
│   │
│   └── mobile/                # MOBILE-ONLY bridge
│       ├── bridge.js          # Flutter ↔ WebView protocol
│       └── MobileBridgeProvider.jsx  # React context for bridge
│
├── vite.config.js             # Shared config
├── .env.web                   # VITE_TARGET=web
└── .env.mobile                # VITE_TARGET=mobile
```

### Build Commands

```bash
# Web full app (existing)
VITE_TARGET=web npx vite build --outDir dist/web

# Mobile content bundle (new)
VITE_TARGET=mobile npx vite build --outDir dist/mobile
# Output: ~200KB gzipped (no LiveKit/Camera code)

# Copy to Flutter assets
cp -r dist/mobile/ app/assets/content-bundle/
```

### Mobile Entry Point (app-mobile.jsx)

```jsx
// app-mobile.jsx — WebView 内运行，不包含 Camera/LiveKit
import { MobileBridgeProvider } from './mobile/MobileBridgeProvider';
import { ContentRouter } from './mobile/ContentRouter';

function MobileApp() {
  return (
    <MobileBridgeProvider>
      <ContentRouter />
    </MobileBridgeProvider>
  );
}
```

## 4. Communication Protocol

### Flutter → WebView (via evaluateJavascript)

```javascript
// Push AI content (forwarded from LiveKit DataChannel)
window.VIBridge.receive({
  type: 'html_stream',
  content: '<div class="p-4">...'
});

window.VIBridge.receive({
  type: 'module',
  module_type: 'place_card',
  data: { name: '...', rating: 4.5 }
});

// Streaming control
window.VIBridge.receive({ type: 'stream_start' });
window.VIBridge.receive({ type: 'stream_end' });
window.VIBridge.receive({ type: 'reset' });

// Navigation
window.VIBridge.receive({ type: 'navigate', route: '/session/abc-123' });

// Theme sync
window.VIBridge.receive({
  type: 'theme',
  mode: 'dark',
  fontSize: 16,
  accentColor: '#8B5CF6'
});

// Session data
window.VIBridge.receive({
  type: 'session_data',
  session: { id: '...', title: '...', status: 'completed' }
});
```

### WebView → Flutter (via JavaScriptChannel)

```javascript
// Content action (user tapped a data-action button)
VIFlutterBridge.postMessage(JSON.stringify({
  type: 'vi_action',
  action: 'open_map',
  dataset: { lat: '40.123', lng: '-73.456' }
}));

// Resize notification
VIFlutterBridge.postMessage(JSON.stringify({
  type: 'vi_resize',
  height: 480
}));

// Navigation request
VIFlutterBridge.postMessage(JSON.stringify({
  type: 'vi_navigate',
  page: 'camera'
}));

// Error report
VIFlutterBridge.postMessage(JSON.stringify({
  type: 'vi_error',
  message: 'Module render failed',
  module_type: 'recipe'
}));
```

### Dart Bridge Handler

```dart
class ContentBridgeController {
  final WebViewController _webCtrl;

  // Forward LiveKit DataChannel to WebView
  void onDataChannelMessage(String topic, String payload) {
    if (topic == 'vi-gateway' || topic == 'vi-agent') {
      _webCtrl.runJavaScript(
        'window.VIBridge.receive(${jsonEncode(payload)})'
      );
    }
  }

  // Handle WebView → Flutter messages
  void _onBridgeMessage(JavaScriptMessage msg) {
    final data = jsonDecode(msg.message);
    switch (data['type']) {
      case 'vi_action':
        _handleAction(data);
      case 'vi_resize':
        _handleResize(data['height']);
      case 'vi_navigate':
        _handleNavigation(data['page']);
    }
  }

  // Push theme to WebView
  void syncTheme(Brightness brightness, double fontSize) {
    _webCtrl.runJavaScript(
      'window.VIBridge.receive(${jsonEncode({
        "type": "theme",
        "mode": brightness == Brightness.dark ? "dark" : "light",
        "fontSize": fontSize,
      })})'
    );
  }
}
```

## 5. Screen-by-Screen Design

### Camera Screen (100% Flutter Native)

```
┌──────────────────────────┐
│ [< Back]      [Settings] │  ← Flutter AppBar
├──────────────────────────┤
│                          │
│   ┌──────────────────┐   │
│   │                  │   │
│   │   Camera Preview │   │  ← Flutter CameraPreview widget
│   │   (Native)       │   │     camera plugin + LiveKit video track
│   │                  │   │
│   └──────────────────┘   │
│                          │
│   ┌──────────────────┐   │
│   │ 🎯 Looking for   │   │  ← Flutter IntentionCard widget
│   │    restaurants... │   │     data from vi-agent DataChannel
│   └──────────────────┘   │
│                          │
│   [🔦] [📸 Capture] [🔄] │  ← Flutter native buttons
│                          │
│   ~~~ voice waveform ~~~ │  ← Flutter CustomPainter
│                          │
└──────────────────────────┘
```

**Why fully native:** Camera preview, LiveKit audio/video tracks, and voice visualization all require native APIs. No WebView involved.

### Session Screen (Hybrid: Flutter + WebView)

```
┌──────────────────────────┐
│ [< Back]  Session  [⋯]  │  ← Flutter AppBar
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ ● Analyzing image... │ │  ← Flutter progress indicator
│ │ ██████░░░░ 60%       │ │     data from task_progress DataChannel
│ └──────────────────────┘ │
├──────────────────────────┤
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐ │
│   WebView (Content)      │
│ │                      │ │
│   AI-generated HTML      │  ← WebView renders Content Bundle
│ │ or Module cards      │ │     HTML streamed via JS Bridge
│                          │
│ │ [Action Button]      │ │  ← data-action → JS Bridge → Flutter
│                          │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘ │
├──────────────────────────┤
│ Timeline:                │
│ 📸 Photo captured        │  ← Flutter Timeline widget
│ 🔍 Analyzing...          │
│ ✅ Result ready           │
└──────────────────────────┘
```

**Why hybrid:** Session header and timeline are simple Flutter widgets. AI content must be WebView to share React rendering with Web version.

### History / Memory Screens (WebView in Flutter Shell)

```
┌──────────────────────────┐
│ History          [🔍]    │  ← Flutter AppBar
├──────────────────────────┤
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐ │
│   WebView                │
│ │ (React HistoryView)  │ │
│                          │  ← Full React component in WebView
│ │ Today                │ │     same HistoryView.jsx as web
│   ├ Restaurant search    │
│ │ ├ Weather check      │ │
│   └ Recipe lookup        │
│ │                      │ │
│   Yesterday              │
│ │ ├ ...                │ │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘ │
├──────────────────────────┤
│ [📷] [🏠 Home] [🧠 Mem] │  ← Flutter BottomNavigationBar
└──────────────────────────┘
```

**Why WebView:** PM frequently iterates history/memory UI. WebView allows instant updates via Content Bundle without App release.

## 6. LiveKit Integration

### Connection Ownership

```dart
// app/lib/service/livekit/livekit_service.dart
class LiveKitService {
  late Room _room;
  late LocalParticipant _localParticipant;

  // Camera track → published to LiveKit room
  late LocalVideoTrack _cameraTrack;

  // Audio track → published to LiveKit room
  late LocalAudioTrack _audioTrack;

  // DataChannel listener → forwards to WebView
  void _onDataReceived(DataPacket packet) {
    final topic = packet.topic;
    final payload = utf8.decode(packet.data);

    if (_contentBridge != null) {
      // Forward gateway/agent messages to WebView
      _contentBridge!.onDataChannelMessage(topic, payload);
    }

    // Handle navigation/control messages in Flutter
    if (topic == 'vi-agent') {
      _handleAgentMessage(jsonDecode(payload));
    }
  }

  // RPC handler registration (same as web useAgentProtocol.js)
  void _registerRpcMethods() {
    _room.registerRpcMethod('rpcB2FTakePhoto', _onTakePhoto);
    _room.registerRpcMethod('rpcB2FCaptureAndUpload', _onCaptureUpload);
    _room.registerRpcMethod('rpcB2FShowResult', _onShowResult);
    _room.registerRpcMethod('rpcB2FSetChatText', _onSetChatText);
    _room.registerRpcMethod('rpcB2FNavigateTo', _onNavigateTo);
    _room.registerRpcMethod('rpcB2FZoom', _onZoom);
    _room.registerRpcMethod('rpcB2FSwitchCamera', _onSwitchCamera);
  }

  // RPC: Take photo → native camera capture
  Future<String> _onTakePhoto(RpcInvocationData data) async {
    final photo = await _cameraController.takePicture();
    final bytes = await photo.readAsBytes();
    final base64 = base64Encode(bytes);
    return jsonEncode({'success': true, 'photo': 'data:image/jpeg;base64,$base64'});
  }

  // RPC: Show result → forward to WebView
  Future<String> _onShowResult(RpcInvocationData data) async {
    _contentBridge?.pushContent(data.payload);
    return jsonEncode({'success': true});
  }

  // RPC: Navigate → Flutter go_router
  Future<String> _onNavigateTo(RpcInvocationData data) async {
    final page = jsonDecode(data.payload)['page'];
    _router.go('/$page');
    return jsonEncode({'success': true});
  }
}
```

### RPC Method Mapping (Web ↔ Flutter)

| RPC Method | Web (useAgentProtocol.js) | Flutter (LiveKitService) |
|------------|--------------------------|--------------------------|
| `rpcB2FTakePhoto` | Canvas.drawImage → dataURL | CameraController.takePicture → base64 |
| `rpcB2FCaptureAndUpload` | Canvas → fetch POST to S3 | takePicture → dio.post to S3 |
| `rpcB2FShowResult` | setState → render in React | JS Bridge → WebView |
| `rpcB2FSetChatText` | setState → input field | setState → Flutter TextField |
| `rpcB2FNavigateTo` | React Router navigate | go_router.go() |
| `rpcB2FZoom` | MediaTrack constraints | CameraController.setZoomLevel |
| `rpcB2FSwitchCamera` | facingMode toggle | CameraController.switchCamera |

## 7. Content Bundle Hot Update

### Update Flow

```
PM changes React component
        │
        ▼
git push → CI/CD builds Content Bundle
        │
        ▼
Upload to CDN (content.vi-agent.com/v{hash}/)
        │
        ▼
App checks for updates (on launch + periodic)
        │
        ▼
Download new bundle → cache locally
        │
        ▼
Next WebView load uses new bundle
```

### Version Check API

```
GET https://api.vi-agent.com/content-bundle/latest
Response: {
  "version": "1.2.3",
  "hash": "abc123def456",
  "url": "https://cdn.vi-agent.com/content-bundle/abc123def456/",
  "size": 245000,
  "min_app_version": "2.0.0"
}
```

### Flutter Update Manager

```dart
class ContentBundleManager {
  static const _baselinePath = 'assets/content-bundle/';
  late String _activeBundlePath;

  Future<void> checkForUpdates() async {
    final latest = await _api.getLatestBundle();
    final cached = await _cache.getCurrentVersion();

    if (latest.version != cached?.version) {
      // Download in background
      final path = await _download(latest.url);
      // Verify hash
      if (_verifyHash(path, latest.hash)) {
        _activeBundlePath = path;
        await _cache.setCurrentVersion(latest);
      }
    }
  }

  String get bundleUrl {
    // Use cached update if available, otherwise baseline
    return _activeBundlePath ?? _baselinePath;
  }
}
```

## 8. Key Decisions Log

| Decision | Chosen | Rejected | Rationale |
|----------|--------|----------|-----------|
| Framework | Flutter + WebView hybrid | React Native, Capacitor, PWA | Existing Flutter app (/app/) is 80% done; native camera performance critical |
| Camera | Flutter camera plugin | WebView getUserMedia | iOS WebView has severe getUserMedia bugs (permission popups, WKWebView incompatibility) |
| LiveKit | Flutter LiveKit SDK (native) | WebView livekit-client JS | Native audio session for echo cancellation, background audio, connection stability |
| Content rendering | WebView with React Content Bundle | Flutter widgets | Enables PM vibe-code workflow: change React → auto-works in App |
| Module system | React in WebView (shared) | Flutter Widget rewrite | Shared code = PM iterates once for both platforms |
| Content delivery | Local baseline + CDN hot update | Embedded only / CDN only | Best of both: offline works, hot updates don't need App release |
| Bridge protocol | JavaScriptChannel + evaluateJS | Platform channels / MethodChannel | Aligns with existing CollovWebView infrastructure |

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Apple tightens WebView policy | Low | High | Core features are native; WebView is for content display only (like ChatGPT rendering Markdown). Document native value-add for App Review. |
| WebView memory leak on long sessions | Medium | Medium | Implement WebView recycling pool. Monitor memory in production. Force-reload after 10+ sessions. |
| JS Bridge message ordering | Low | High | Add sequence numbers to bridge messages. Buffer and reorder on receive side. |
| Content Bundle version incompatibility | Medium | Medium | `min_app_version` field in version check API. Force-update prompt if App is too old. |
| Flutter/WebView gesture conflict | Medium | Low | Disable WebView scrolling, let Flutter handle scroll via NestedScrollView. Only allow WebView-internal scrolling for long content. |

## 10. Implementation Roadmap

### Phase 1: Foundation (2-3 weeks)

- [ ] Create `frontend/src/app-mobile.jsx` entry point
- [ ] Create `frontend/src/mobile/bridge.js` communication protocol
- [ ] Add `vite.config.mobile.js` build config
- [ ] Build initial Content Bundle (Session content + Modules only)
- [ ] Integrate Content Bundle into Flutter `/app/assets/`
- [ ] Implement `ContentBridgeController` in Flutter
- [ ] Wire LiveKit DataChannel → JS Bridge → WebView
- [ ] Test: AI HTML streaming works in App WebView

### Phase 2: Full Content Layer (2-3 weeks)

- [ ] Port HistoryView to Content Bundle
- [ ] Port MemoryView to Content Bundle
- [ ] Implement WebView warm pool (pre-heat on app launch)
- [ ] Add theme sync (dark mode, font size)
- [ ] Implement data-action button handling via JS Bridge
- [ ] Test: all 8 module types render correctly in WebView
- [ ] Test: history list scrolling and search

### Phase 3: Polish & Store (2-3 weeks)

- [ ] Content Bundle hot update system (CDN + version check)
- [ ] Push notifications integration
- [ ] App icon, splash screen, store assets
- [ ] Performance profiling (memory, WebView init time)
- [ ] Apple App Store submission
- [ ] Google Play Store submission

### Phase 4: Optimization (Post-launch)

- [ ] Analytics: native event bridge
- [ ] Offline mode: cache Content Bundle + last N sessions
- [ ] WebView → Flutter native migration for performance-critical screens
- [ ] Background audio keep-alive for voice sessions
- [ ] Deep linking (app URLs → specific sessions)

## 11. Appendix: Rejected Alternatives

### React Native + LiveKit

**Why rejected:** The existing `/app/` directory contains a near-complete Flutter application with LiveKit integration, Riverpod state management, and native camera support. Switching to React Native would discard 80% complete work. While React Native offers better JS code sharing, the cost of starting over outweighs the benefit.

### Capacitor/Ionic

**Why rejected:** Two hard blockers: (1) WebRTC in WKWebView is fragile — the main Capacitor WebRTC plugin is unmaintained, (2) Apple App Store Guideline 4.2 routinely rejects pure WebView wrappers. VI Agent needs native camera performance that Capacitor cannot provide.

### PWA Only

**Why rejected:** iOS severely limits PWAs — no background sync, volatile storage, broken `getUserMedia()` in standalone mode, no native push notifications. For a camera-first, voice-first AI agent, these are dealbreakers.

### Flutter Full Native (No WebView)

**Why considered:** Best performance, no WebView complexity. **Why rejected:** Violates the core requirement — PM cannot vibe-code iterate on Flutter widgets. Every UI change requires both Web React + Flutter Dart updates, doubling iteration cost. The AI-generated HTML content is inherently HTML and needs a web renderer regardless.
