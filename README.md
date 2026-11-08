# Diwali by Jay

A small, mobile-first Diwali fireworks experience. Enter a name, allow camera access, and use hand gestures to launch six kinds of fireworks. Camera frames and hand tracking stay on the device; the app does not record or upload video.

## Run locally

```sh
npm install
npm run dev
```

Open the printed local URL. Camera access works on localhost and secure HTTPS pages. On a phone, deploy the site to an HTTPS host before requesting camera access.

## Gestures

| Gesture | Effect |
| --- | --- |
| Index finger up | Rocket peony |
| Closed fist | Anar fountain |
| Open palm | Starburst |
| Peace sign | Five-color Roman candle |
| Thumb and index pinch | Sparkler trail |
| Two hands together | Grand finale |

Hand landmarks are processed locally with MediaPipe Tasks Vision. Video inference is throttled independently from the canvas animation to keep the visual effects responsive. The front-facing camera is preferred when available.

## Build

```sh
npm run build
npm run preview
```

## Publish on GitHub Pages

The included Actions workflow builds and deploys every push to main. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Once the first workflow completes, the site is served from https://jayanthroyal1.github.io/diwalibyjay/ over HTTPS, which supports mobile camera permission prompts. Keep repository name diwalibyjay for this URL.


## Recording

Use the Record button to capture the animated canvas and generated Web Audio together as a video file. Recording uses MediaRecorder when supported by the browser; the app synthesizes all effects and downloads no sound files.


MediaPipe's WASM runtime and hand landmark model are served from the same GitHub Pages site to avoid third-party asset-host failures.


The site includes an Open Graph social image and WhatsApp/Teams-friendly metadata for its Diwali 2026 greeting card.

