## Goal
Detect faces on the live camera preview to (1) decide if the user is capturing a portrait, and (2) get face box locations. Show a bounding-box overlay and update the info bar.

## Dependencies
- Add `google_mlkit_face_detection` (on‑device, iOS/Android).
- Already present: `path_provider` for temp files. No server calls.

## iOS Setup
- Minimum iOS 12+ via CocoaPods (the plugin handles ML Kit pods).
- No extra Info.plist keys beyond camera/microphone (already present).

## Detection Pipeline
- Source: use front/back camera stream from `flutter_webrtc`.
- Frame capture: periodically (every 200–250 ms) call `videoTrack.captureFrame()`.
- Conversion: write the captured bytes to a temp JPEG file (not gallery), then create `InputImage.fromFilePath(tempPath)` for ML Kit. (Phase 1 favors simplicity and reliability over zero‑copy.)
- Detection: initialize `FaceDetector` with fast performance and bounding boxes only (no contours/landmarks in Phase 1). Return a list of face rects in pixel space.
- Normalization: convert pixel rects to normalized coordinates [0..1] against the captured image width/height.

## UI Overlay
- Add a `CustomPaint` overlay above the `RTCVideoView` to render face boxes.
- Map normalized rects to the preview widget size; for `ObjectFit.cover` we accept minor cropping mismatch in Phase 1.
- Visual: thin white stroke, semi‑transparent fill (optional).

## Portrait Check & Reporting
- Portrait flag: `isPortrait = faces.isNotEmpty`.
- Choose primary box: largest rect by area; expose `primaryFaceRectNormalized`.
- Info bar: append log like `Portrait: yes | box=(x,y,w,h)` on each update (rate‑limited to avoid spam).

## Controls
- Add a toggle button in the bottom bar: enable/disable face detection.
- When disabled, stop the periodic timer.

## Performance & Safety
- Rate limit: ~4–5 FPS detection.
- Downscale: if capture bytes are large, write a smaller JPEG (~480 px width) before detection.
- Backoff: on detection errors, back off for 1s and resume.
- Dispose: close the `FaceDetector` in `dispose()`.

## Implementation Plan (files)
- `pubspec.yaml`: add `google_mlkit_face_detection`.
- `lib/modules/vision/face_detector.dart`: a small service class wrapping ML Kit API.
- `lib/modules/pages/home/home_page.dart`: add state (`isPortrait`, face boxes), periodic capture timer, detection calls, and lifecycle.
- `lib/modules/pages/home/home_page.ui.dart`: overlay painter and a toggle control in the bottom bar.

## Validation
- Visual: verify boxes align on faces with both front/back camera.
- Logs: confirm portrait detection and rect output in the info bar.
- Performance: confirm CPU remains acceptable (<30–40% on typical iPhone), adjust FPS if needed.

## Risks & Next Steps
- Aspect‑ratio mapping may be slightly off due to `cover`; Phase 2 can fix with exact crop math.
- Disk IO from temp JPEGs adds latency; Phase 2 will migrate to platform‑channel Vision processing on CVPixelBuffer for lower overhead.
