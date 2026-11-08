# Diwali by Jay

A small, mobile-first Diwali fireworks experience. Enter a name, allow camera access, and use hand gestures to launch six kinds of fireworks. Camera frames and hand tracking stay on the device; the app does not record or upload video.

## Run locally

```sh
pnpm install
pnpm dev
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

The effects use separate generators for each gesture, a preallocated 3,500-particle pool, additive trails, and procedural Web Audio. The camera stream is drawn once into the same mirrored canvas as the effects, avoiding the duplicate video layer some mobile browsers showed. The camera video itself remains hidden and is used only for hand tracking.

## Build

```sh
pnpm build
pnpm preview
```

## Publish on GitHub Pages

The included Actions workflow builds and deploys every push to main. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Once the first workflow completes, the site is served from https://jayanthroyal1.github.io/diwalibyjay/ over HTTPS, which supports mobile camera permission prompts. Keep repository name diwalibyjay for this URL.


MediaPipe's WASM runtime and hand landmark model are served from the same GitHub Pages site to avoid third-party asset-host failures.


The site includes an Open Graph social image and WhatsApp/Teams-friendly metadata for its Diwali 2026 greeting card.


Use the cache-busted share URL https://jayanthroyal1.github.io/diwalibyjay/?share=diwali2026-jayanthg when sending the updated card preview.


## Controls

- Hand gestures alone launch fireworks.
- Save a festive postcard with **Postcard** or S.
- Hide the interface with **Clean** or H; restore it with the on-screen button.
- Toggle the hand landmark skeleton with **Debug** or D.
- Sound is on by default; toggle it with **Sound** or M.
- Video recording is not included.

