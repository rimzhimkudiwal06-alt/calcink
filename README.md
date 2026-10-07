# CalcInk — On-Device Handwritten Math Calculator

Write a math expression by hand, end it with `=`, and the answer appears right next to it, in ink, on the page. Edit or erase a number and the answer updates live.

**Track:** Software Development · **Domain:** Digital Ink, HCI & Edge ML · **Mode:** 100% client-side

🔗 **Live demo:** https://calcink-self.vercel.app/
📦 **Repository:** https://github.com/rimzhimkudiwal06-alt/calcink

> **No cloud APIs. Works offline.** All stroke capture, preprocessing, neural-network inference and math evaluation run inside the browser. After the first load, the app works in airplane mode.

---

## Features

### Required (per problem statement)

- [x] **Interactive ink canvas:** mouse, stylus and touch input; smooth curves; undo/redo; stroke eraser; pixel eraser; clear canvas; stroke-width adjustment; high-DPI scaling via `window.devicePixelRatio`.
- [x] **Handwriting recognition:** digits `0–9`, operators `+ − × ÷`, decimal point `.` and terminal `=`, using ONNX models running in the browser (a pre-trained digit model plus a small operator model; see [Model Attribution](#model-attribution)).
- [x] **Math evaluation engine:** deterministic recursive-descent parser with BODMAS/PEMDAS precedence, multi-digit integers, decimals and negative numbers.
- [x] **Dynamic projection and reactive editing:** the answer is drawn directly right of the `=` sign and recomputed whenever strokes change.

### Extras

- Pressure-sensitive ink (`PointerEvent.pressure`, 0.4×–1.6× width)
- Paper modes: blank, ruled (with red margin), dot grid; procedural paper texture and page shadow
- Dark paper theme
- Animated answer reveal (220 ms) in fountain-pen blue, with a synthesized Web Audio tick and haptic vibration (mutable)
- **Scratch-to-erase gesture:** scribble over a character to delete it (undoable)
- **Parser extras:** variables (`x = 10`, then `x + 5 =`), implicit multiplication (`2x`, `3(x)`), parentheses, right-associative exponent (`x^2`), and functions (`sin`, `cos`, `tan`, `sqrt`, `abs`, `ln`, `log`). *The handwriting recognizer covers the required vocabulary (`0–9 + − × ÷ . =`); these extras are handled by the expression parser.*
- **Function plotting:** `y = f(x)` on an interactive graph overlay (toggle with `G`)
- Installable PWA
- `debug.html`: developer page that shows the exact 28×28 tensor sent to the models, top-3 candidates and confidence scores

---

## Quick Start

**Requirements:** Node.js 20 or newer (developed on v24.12.0) and npm.

```bash
git clone https://github.com/rimzhimkudiwal06-alt/calcink.git
cd calcink
npm install
npm run dev
```

Open **http://localhost:3001**.

To run a production build locally:

```bash
npm run build
npm run preview
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server (port 3001) |
| `npm run build` | Type-check with `tsc`, then build for production |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the full Vitest suite once |

---

## Model Attribution

Recognition uses a **two-model cascade** (details in [`docs/MODEL_DECISION.md`](docs/MODEL_DECISION.md)). Both models take the same input and run with ONNX Runtime Web (WASM) inside a Web Worker.

| | Model D (digits) | Model O (operators) |
|---|---|---|
| **File** | `public/models/mnist-8.onnx` | `public/models/operators.onnx` |
| **Source** | [ONNX Model Zoo, MNIST](https://github.com/onnx/models/tree/main/validated/vision/classification/mnist) | Built by us with `tools/model-build/train_operators.py` |
| **Data / license** | MNIST; model from the ONNX Model Zoo (Apache-2.0) | [HASYv2](https://zenodo.org/records/259444) (CC BY-SA 4.0) + [MNIST](http://yann.lecun.com/exdb/mnist/) (ODC-ODbL / public domain, as noted in `docs/MODEL_DECISION.md`) |
| **Architecture** | Pre-trained CNN | 7-class CNN, 18,343 params: Conv(16, 3×3) → Conv(32, 3×3) → MaxPool(2×2) → Dropout(0.25) → Dense(64) → Dropout(0.5) → Dense(7) |
| **Output classes** | `0`–`9` | `+`, `-`, `×`, `÷`, `=`, `.`, and `digit` (hands off to Model D) |
| **Size** | 26.4 KB | 224.4 KB |
| **Training by us** | **None.** Used as downloaded, with no fine-tuning. | **Yes, a small CNN** trained on public datasets (see below) |
| **Input** | float32 `[1, 1, 28, 28]`, values 0.0–1.0, white stroke on black | same |

**What `tools/model-build` does:**
- `train_operators.py` loads HASYv2 operator images (`+`, `-`, `×`, `÷`, `.`), builds synthetic `=` samples by stacking pairs of `-` strokes, adds MNIST samples as the `digit` class, balances every class to 2,000 samples with augmentation, trains for 12 epochs, exports to ONNX, and checks that Keras and ONNX Runtime outputs match (max logit difference < 1e-4).
- `test_combined_pipeline.py` benchmarks the full two-model pipeline on 240 synthetic strokes and 11,066 real test images (10,000 MNIST + 1,066 HASYv2).

> **Note on training:** the problem statement says teams are not *required* to train models. We used a pre-trained model for digits, and trained only a tiny operator classifier, because no existing pre-trained model covered `+ − × ÷ . =` reliably (see below). This is a small CNN trained on public datasets, not a research model.

### Why this model

No single pre-trained ONNX model covered both digits and all six operator symbols, so we combined two. Digits use the ready-made ONNX Model Zoo MNIST CNN, which is only 26 KB and needs no extra training. The operators come from a 224 KB CNN we trained on HASYv2 and MNIST. Together the models are about 250 KB, run through ONNX Runtime Web in a Web Worker, are served from our own domain and are precached by the service worker, so inference is fast, never blocks the drawing thread, and works fully offline.

### Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Single-model: `Otman404/Mathematical_Symbols_Recognition` (Hugging Face) | Tested and rejected: output collapsed onto 5 non-math classes for over 96% of inputs (25% accuracy on synthetic tests), and its label file had 94 classes against 82 model outputs. |
| One model for everything from existing pre-trained weights | None found that covered all 16 required symbols; the digit-model + operator-model cascade lets us keep the zero-fine-tuning MNIST model and train only a small operator classifier. |

---

## Recognition Pipeline (Strokes → Tensors)

```
Pointer events
   │  (coalesced points, pressure)
   ▼
Stroke[]  ← single source of truth
   │
   ▼  debounce ~400 ms after any change (draw / erase / undo / redo / clear)
Symbol segmentation  → group strokes into individual symbols
   │
   ▼
Crop → scale into 20×20 box → centre on 28×28 canvas → rasterize
   → centre by mass → float32 tensor [1, 1, 28, 28], values 0–1
   │
   ▼  postMessage
Web Worker (recognizer.worker.ts): ONNX Runtime Web inference
   Model O → if "digit" → Model D
   │
   ▼
Per-symbol label + confidence
   │
   ▼
Line clustering (vertical-overlap analysis), sort left→right
   │
   ▼
Lines ending in "=" → extract expression → parse → evaluate
   │
   ▼
AnswerLayer draws result right of the "=" bounding box
```

Key points:

- **Stroke array is the only source of truth.** The canvas is just a render surface. The pixel eraser splits strokes into new vector strokes instead of masking pixels, so recognition always sees the real ink.
- **Stale results are dropped.** Each request carries a monotonically increasing ID; older responses are discarded.
- **Inference never runs on the main thread.** It runs in a Web Worker, so drawing stays smooth during recognition.
- **Segmentation (`src/recognition/segment.ts`):** strokes are grouped into symbols using geometry and timing (max 400 ms gap between strokes of one symbol). `+` and `×` are strokes that cross, or a flat bar and a vertical stem that line up; `=` is two flat bars with enough horizontal overlap and a small vertical gap; `÷` is a flat bar with a dot above or below; multi-stroke digits are strokes with strong horizontal overlap and a small gap, or overlapping bounding boxes. Thresholds are relative to the typical symbol size on the page (75th percentile of stroke size), so they adapt to handwriting scale.
- **Preprocessing (`src/recognition/preprocess.ts`):** each symbol's bounding box is cropped, scaled preserving aspect ratio into a 20×20 box on a 28×28 canvas (4 px padding), drawn with a 2 px soft-edged stroke, and shifted toward the centre by centre of mass (max 4 px). The result is a 784-value float32 tensor in `[1, 1, 28, 28]` shape. A `.` is also detected with a size heuristic (very small single stroke).

---

## Constraint Compliance

### 100% on-device, zero cloud APIs
No network requests are made for recognition or evaluation, and the code contains no external `fetch` calls or CDN URLs. The models (`/models/*.onnx`), the ONNX Runtime `.wasm`/`.mjs` files and all assets are served from our own domain and precached by a service worker (`vite-plugin-pwa`, precache pattern `**/*.{js,css,html,wasm,onnx,mjs,json,png,svg}`).

**Verify offline mode:**
1. Open the app once while online and let it finish loading.
2. Turn on airplane mode (or DevTools → Network → Offline).
3. Reload the page and draw `12+8=`. The answer still appears.

### 60 FPS ink
- Inference runs in a Web Worker.
- Active strokes render incrementally (midpoint quadratic Bézier), not by full repaint.
- The answer overlay is a separate canvas with `pointer-events: none`.
- Recognition is debounced (~400 ms).

### Safe execution
- **No `eval()` and no `Function()`.** Expressions are tokenized and parsed by a custom recursive-descent parser.
- Division by zero shows `Undefined`.
- Malformed syntax returns a structured error result. It never throws an unhandled exception.
- Floating-point noise is removed (`0.1 + 0.2 = 0.3`) with a 12-significant-digit normalizer.
- Undo/redo history is capped at 50 states to keep memory bounded.

---

## Architecture

### Canvas Architecture

CalcInk's drawing layer is built on the HTML5 Canvas 2D and Pointer Events APIs, designed for high-precision, offline digital ink input across desktop, mobile, and stylus devices. The stroke collection (`Stroke[]`) is treated as the single immutable source of truth, with the canvas serving strictly as a rendering surface. High-DPI displays are natively accommodated by scaling the canvas backing buffer by `window.devicePixelRatio` and normalizing coordinate spaces via a 2D affine transform. To ensure continuous 60+ FPS ink flow without input latency, pointer events capture coalesced hardware points (`getCoalescedEvents`), and active strokes are rendered incrementally using midpoint quadratic Bézier curve smoothing rather than performing full-scene repaints on every pointer move.

### Editing Tools and History Architecture

CalcInk provides a non-destructive digital ink toolchain consisting of a pen, a whole-stroke eraser, and a partial pixel eraser, backed by a bounded two-stack history system (`undoStack` / `redoStack`). Stroke erasure employs point-to-segment Euclidean distance hit-testing with bounding-box pre-filtering. To preserve the stroke array as the single immutable source of truth for the handwriting recognition pipeline, the pixel eraser subdivides stroked paths and extracts surviving point clusters into new vector stroke entities rather than relying on destination-out bitmap raster masking. History is capped at 50 states with deep state cloning to prevent memory leaks while providing full undo/redo and undoable canvas clear operations.

### Math Engine Architecture

CalcInk evaluates handwritten mathematical expressions using an offline, zero-eval recursive descent parser and lexer that strictly respects operator precedence (BODMAS/PEMDAS) and left-associativity without executing arbitrary code (`eval` or `Function`). The parser supports addition, subtraction, multiplication, division, decimals, unary signs, and parentheses. Precision drift inherent to IEEE-754 binary floating-point representation is eliminated using a 12-digit significant rounding normalizer (`cleanFloat`). The engine never throws unhandled runtime exceptions, returning a structured `EvalResult` discriminating valid results from division-by-zero (`Undefined`) and malformed syntax.

### Answer Overlay and Reactive Pipeline Architecture

CalcInk implements a non-blocking mathematical evaluation overlay via `AnswerLayer`, a dedicated high-DPI canvas layered on top of the drawing canvas with `pointer-events: none` to preserve 60+ FPS ink input. When stroke alterations occur (creation, stroke/pixel erasure, undo, redo, or canvas clear), a reactive pipeline debounces execution (~400ms) and invokes the recognition service. Monotonically increasing request IDs discard stale asynchronous recognition responses. Unordered 2D recognized symbols are clustered into horizontal equation lines using vertical overlap analysis and sorted left-to-right. For lines ending with a terminal `=` sign, the preceding expression is extracted, evaluated, and the resulting answer is drawn directly to the right of the `=` bounding box, optically aligned with the equation baseline and proportionally scaled to equation line height.

### Paper UI, Micro-interactions and Tactile Ink Architecture

CalcInk elevates tactile digital handwriting with a multi-layered paper canvas architecture and responsive micro-interactions. The background renders onto a dedicated, non-interfering `BackgroundLayer` canvas featuring procedurally generated paper tooth texture, soft ambient page shadows, and toggleable paper modes (`blank`, `ruled` notebook lines with red margin, and `dot grid`). Digital ink incorporates hardware pressure sensitivity (`PointerEvent.pressure`), dynamically modulating stroke width between 0.4x and 1.6x nominal thickness with rounded caps for pen and stylus inputs while seamlessly falling back to high-performance constant-width Bézier curves for mouse interactions. Evaluated answers reveal themselves via a fluid 220ms ease-out cubic fade-and-scale entrance animation rendered in classic fountain pen royal blue ink, accompanied by an offline procedurally synthesized Web Audio tick and haptic vibration (`navigator.vibrate`) with toolbar mute control. A fully accessible dark paper theme adjusts contrast for nocturnal writing, accompanied by touch-friendly toolbar controls and keyboard shortcuts.

### Natural Gestures, Variables Engine and Function Plotting Architecture

CalcInk introduces natural handwriting ergonomics and advanced algebra workflows without breaking its zero-eval, 100% offline foundation. The stroke input pipeline incorporates a gesture classifier (`analyzeScratchGesture`) that detects rapid zig-zag scribbling (4+ inflection points with high path-density ratios) over existing strokes, non-destructively deleting intersected characters with undoable state history (`Ctrl+Z`). The math engine expands into a scoped evaluator supporting multi-line variable declarations (`x = 10`), implicit multiplication (`2x`, `3(x)`), right-associative exponentiation (`x^2`), and sequential evaluation where downstream equations dynamically resolve variables (`x + 5 = 15`). An interactive high-DPI `GraphOverlay` coordinate plane evaluates mathematical functions (`y = f(x)`) across sampled intervals, rendering Cartesian grid lines, axes, and smooth function curves in real-time with dark mode compatibility and keyboard toggles (`G`).

---

## Testing

```bash
npm test
```

**163 tests across 11 test files, all passing.**

| Area | Files | Covers |
|---|---|---|
| Math engine | `src/math/evaluate.test.ts`, `variables.test.ts`, `lineGrouping.test.ts` | BODMAS/PEMDAS order, decimals, unary signs, parentheses, floating-point cleanup (`0.1+0.2`), division by zero → `Undefined`, malformed syntax, variables, implicit multiplication, exponents, functions, grouping symbols into equation lines |
| Canvas | `src/canvas/coords.test.ts`, `geometry.test.ts`, `HistoryManager.test.ts`, `scratchGesture.test.ts`, `phase5.test.ts` | Coordinate conversion and `devicePixelRatio` scaling, point-to-segment distance and stroke intersection, 50-state undo/redo history, scratch-to-erase detection |
| Recognition | `tests/recognition/preprocess.test.ts`, `segment.test.ts`, `postprocess.test.ts` | Stroke → 28×28 tensor preprocessing, multi-stroke symbol grouping (`+ = ÷ ×`, multi-stroke digits), line assembly, left-to-right ordering, expression validation, confidence filtering, terminal `=` detection |

---

## Team

| Name | GitHub | Contribution |
|---|---|---|
| Rimzhim Kudiwal | [@rimzhimkudiwal06-alt](https://github.com/rimzhimkudiwal06-alt) | Canvas and ink rendering, undo/redo and erasers, math parser and tests, answer overlay, paper UI and extras, deployment |
| Ankita Satpathy | [@ankitasatpathy03](https://github.com/ankitasatpathy03) | Model selection and integration, stroke segmentation and preprocessing, Web Worker inference, offline support, performance profiling |

Built for the **Inter IIT Tech Meet 15.0 Bootcamp, Software PS (IIT Guwahati Tech Board)**.
