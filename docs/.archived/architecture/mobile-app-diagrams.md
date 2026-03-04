# VI Agent Mobile App — Architecture Diagrams

## C4 Level 1: System Context

```mermaid
graph TB
    User((User))
    App[VI Agent Mobile App<br/>Flutter + WebView]
    Web[VI Agent Web App<br/>React 19]
    RT[vi-realtime<br/>LiveKit Agents SDK]
    GW[vi-gateway<br/>Express + Executors]
    API[api-server<br/>FastAPI]
    LK[LiveKit Cloud<br/>WebRTC Infrastructure]
    CDN[Content CDN<br/>React Bundle Hosting]
    LLM[LLM APIs<br/>Gemini / Claude]

    User -->|Voice + Camera| App
    User -->|Browser| Web
    App <-->|WebRTC| LK
    Web <-->|WebRTC| LK
    LK <-->|Agents SDK| RT
    RT -->|RPC + HTTP| GW
    RT -->|HTTP| API
    GW -->|HTTP| API
    GW -->|API calls| LLM
    App -->|HTTP REST| API
    App -->|Download bundle| CDN
    Web -->|Same components| CDN

    style App fill:#8B5CF6,color:#fff
    style Web fill:#3B82F6,color:#fff
    style CDN fill:#F59E0B,color:#000
```

## C4 Level 2: Container Diagram (Mobile App)

```mermaid
graph TB
    subgraph FlutterApp["Flutter App (Native Shell)"]
        Nav[go_router<br/>Navigation]
        Auth[Auth Service<br/>JWT + Device ID]
        Camera[Camera Controller<br/>camera plugin 0.11]
        LKService[LiveKit Service<br/>livekit_client 2.6]
        RPC[RPC Handler<br/>7 methods]
        DC[DataChannel<br/>Listener]
        Bridge[Content Bridge<br/>Controller]
        Update[Bundle Update<br/>Manager]

        subgraph Screens["Screens"]
            CameraScreen[Camera Screen<br/>100% Native]
            SessionScreen[Session Screen<br/>Hybrid]
            HistoryScreen[History Screen<br/>WebView]
            MemoryScreen[Memory Screen<br/>WebView]
        end
    end

    subgraph WebViewEngine["WebView Content Engine"]
        WV[WebView Instance<br/>Pre-warmed Pool]
        Bundle[React Content Bundle<br/>~200KB gzipped]
        JSBridge[JS Bridge<br/>VIBridge / VIFlutterBridge]
    end

    subgraph Backend["Backend Services"]
        RT[vi-realtime]
        GW[vi-gateway]
        API[api-server]
    end

    Camera --> CameraScreen
    LKService --> RPC
    LKService --> DC
    DC --> Bridge
    Bridge --> JSBridge
    JSBridge --> WV
    WV --> Bundle
    RPC --> CameraScreen
    RPC --> Bridge
    Nav --> Screens
    Update --> Bundle

    LKService <-->|WebRTC| RT
    DC <-->|DataChannel| GW
    Auth -->|HTTP| API

    style CameraScreen fill:#10B981,color:#fff
    style SessionScreen fill:#F59E0B,color:#000
    style HistoryScreen fill:#3B82F6,color:#fff
    style MemoryScreen fill:#3B82F6,color:#fff
    style Bundle fill:#F59E0B,color:#000
```

## Sequence: Voice → AI Response → App Display

```mermaid
sequenceDiagram
    participant U as User
    participant FC as Flutter Camera
    participant FL as Flutter LiveKit
    participant BR as JS Bridge
    participant WV as WebView
    participant RT as vi-realtime
    participant GW as vi-gateway
    participant LLM as Gemini/Claude

    U->>FC: Speaks + Camera input
    FC->>FL: Audio track (native)
    FL->>RT: WebRTC audio stream
    RT->>RT: Gemini Live processes voice

    Note over RT: Agent decides to dispatch task

    RT->>GW: RPC: dispatch_task(photo, prompt)
    GW->>LLM: Stream request

    loop HTML Chunks
        LLM-->>GW: HTML chunk
        GW-->>FL: DataChannel (vi-gateway topic)
        FL->>BR: Forward message
        BR->>WV: window.VIBridge.receive({type:'html_stream'})
        WV->>WV: Append HTML to container
    end

    GW-->>FL: DataChannel: {type:'end'}
    FL->>BR: stream_end
    BR->>WV: window.VIBridge.receive({type:'stream_end'})
    WV-->>BR: VIFlutterBridge.postMessage({type:'vi_resize'})
    BR-->>FL: Height update
    FL->>FL: Adjust WebView height
```

## Sequence: Photo Capture via Agent RPC

```mermaid
sequenceDiagram
    participant RT as vi-realtime
    participant FL as Flutter LiveKit
    participant CAM as Flutter Camera
    participant S3 as S3 Upload
    participant API as api-server

    RT->>FL: RPC: rpcB2FCaptureAndUpload()
    FL->>CAM: takePicture()
    CAM-->>FL: XFile (native photo)
    FL->>S3: Upload JPEG
    S3-->>FL: Photo URL
    FL->>API: POST /sessions/{id}/photos
    FL-->>RT: RPC Response: {success: true, url: "..."}

    Note over RT: Agent uses photo for next task
```

## Sequence: Content Bundle Hot Update

```mermaid
sequenceDiagram
    participant APP as Flutter App
    participant API as api-server
    participant CDN as Content CDN
    participant WV as WebView

    APP->>API: GET /content-bundle/latest
    API-->>APP: {version: "1.3.0", hash: "abc123", url: "..."}

    alt New version available
        APP->>CDN: Download bundle (245KB)
        CDN-->>APP: bundle.zip
        APP->>APP: Verify hash
        APP->>APP: Extract to local cache
        APP->>WV: Load from cached path
    else Already up to date
        APP->>WV: Load from current cache
    end

    alt No network (offline)
        APP->>WV: Load from assets/ baseline
    end
```

## State: WebView Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Cold: App launches

    Cold --> Warming: Pre-warm on launch
    Warming --> Ready: HTML loaded + bridge initialized

    Ready --> Active: Screen navigates to content
    Active --> Ready: Screen navigates away

    Active --> Streaming: DataChannel message received
    Streaming --> Active: Stream complete

    Active --> Crashed: WebView error
    Crashed --> Warming: Auto-recreate

    Active --> Updating: New bundle available
    Updating --> Warming: Bundle replaced

    Ready --> Disposed: App goes to background (5min+)
    Disposed --> Cold: App returns to foreground
```

## Data Flow: Which Layer Handles What

```mermaid
graph LR
    subgraph NativeOnly["Flutter Native (No WebView)"]
        A1[Camera Preview]
        A2[Voice Waveform]
        A3[LiveKit Connection]
        A4[Photo Capture]
        A5[Permissions]
        A6[Push Notifications]
        A7[Navigation Tabs]
        A8[Auth Flow]
    end

    subgraph Hybrid["Flutter + WebView"]
        B1[Session Header — Flutter]
        B2[AI Content — WebView]
        B3[Progress Bar — Flutter]
        B4[Module Cards — WebView]
        B5[Action Buttons — WebView→Flutter]
    end

    subgraph WebViewOnly["WebView (React Content Bundle)"]
        C1[History List]
        C2[Memory Display]
        C3[AI HTML Renderer]
        C4[Module Components x8]
        C5[Content Interactions]
    end

    style NativeOnly fill:#10B981,color:#fff
    style Hybrid fill:#F59E0B,color:#000
    style WebViewOnly fill:#3B82F6,color:#fff
```

## Monorepo Structure (Post-Migration)

```
vi_agent/
├── api-server/          # Backend (unchanged)
├── realtime/            # LiveKit Agent (unchanged)
├── gateway/             # Task Executor (unchanged)
│
├── frontend/            # Web + Mobile shared frontend
│   ├── src/
│   │   ├── app-web.jsx          # Web entry
│   │   ├── app-mobile.jsx       # Mobile entry (content only)
│   │   ├── components/          # SHARED components
│   │   │   ├── PersistentHtmlRenderer.jsx
│   │   │   ├── modules/         # 8 module types
│   │   │   ├── HistoryView.jsx
│   │   │   ├── MemoryView.jsx
│   │   │   └── shared.jsx       # Design system
│   │   ├── hooks/               # Web-only
│   │   └── mobile/              # Mobile bridge
│   │       ├── bridge.js
│   │       └── MobileBridgeProvider.jsx
│   ├── dist/
│   │   ├── web/                 # Web build output
│   │   └── mobile/              # Content Bundle output
│   └── vite.config.js
│
├── app/                 # Flutter mobile app
│   ├── lib/
│   │   ├── modules/pages/
│   │   │   ├── home/            # Camera screen (native)
│   │   │   ├── session/         # Session screen (hybrid)
│   │   │   ├── center/          # History (WebView)
│   │   │   └── memory/          # Memory (WebView)
│   │   ├── service/
│   │   │   ├── livekit/         # LiveKit native integration
│   │   │   ├── content_bridge/  # WebView bridge controller
│   │   │   └── bundle_manager/  # Content Bundle updates
│   │   └── widgets/
│   │       └── content_webview.dart  # Reusable WebView wrapper
│   ├── assets/
│   │   └── content-bundle/      # Baseline React bundle
│   ├── ios/
│   └── android/
│
├── docs/architecture/   # This document
├── dev.sh
└── docker-compose.yml
```
