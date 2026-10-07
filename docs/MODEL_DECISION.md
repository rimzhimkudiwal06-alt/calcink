# CalcInk Recognition Architecture & Model Decision Report

## 1. Rejection of Otman404 Model

The initial single-model candidate (`Otman404/Mathematical_Symbols_Recognition`) was thoroughly tested across multiple preprocessing configurations and was **rejected as unusable**.

### Key Experimental Evidence:
1. **Constant-Output Collapse**: Under standard white-on-black normalized inputs (`[0.0, 1.0]`), the model output collapsed onto just 5 non-math classes (`pm`, `A`, `h`, `b`, `sigma`) for over **96%** of inputs regardless of the drawn symbol. Max accuracy achieved across all synthetic setups was only **25.00%**.
2. **Label Mismatch (94 vs 82 classes)**: `labels.pickle` contained 94 classes, whereas the saved model weights (`weights.h5`) had only 82 output units. Code inspection revealed that 12 folders/classes were silently omitted during training due to directory structure filtering, breaking label alignment.

---

## 2. Two-Model Architecture Design

To achieve robust, high-accuracy handwritten math recognition, CalcInk adopts a **two-model recognition architecture** sharing a unified 28×28 grayscale white-on-black input preprocessing spec (`NCHW [1, 1, 28, 28]`, scaled float `[0.0, 1.0]`):

```
                       [ Input Canvas Stroke ]
                                  │
                       [ Preprocessing: 28x28 ]
                                  │
                       ▼          ▼
            ┌───────────────────────────────────┐
            │   Model O (Operator Classifier)   │
            └─────────────────┬─────────────────┘
                              │
             ┌────────────────┴────────────────┐
             │                                 │
   Predicted Operator               Predicted "digit"
  (+, -, ×, ÷, =, .)                           │
             │                                 ▼
             │                      ┌─────────────────────┐
             │                      │   Model D (MNIST)   │
             │                      └──────────┬──────────┘
             │                                 │
             │                           Digit Output
             │                              (0 - 9)
             ▼                                 ▼
    [ Final Recognized Symbol String (16 symbols) ]
```

### Components:
1. **Model D (Digits)**: Pre-trained ONNX Model Zoo [`mnist-8.onnx`](https://github.com/onnx/models/tree/main/validated/vision/classification/mnist) (~26 KB). Used **UNCHANGED** (zero training/fine-tuning). Inputs `[1, 1, 28, 28]`, outputs raw 10-class logits. Softmax is applied in code.
2. **Model O (Operators)**: A small CNN classifier (~224.4 KB, ~18K parameters, 2 Conv2D + MaxPool + Dense + Dropout) trained for 7 target classes: `+`, `-`, `×`, `÷`, `=`, `.`, and `"digit"`.

---

## 3. Datasets, Licensing & Class Construction

### A. Datasets & Licenses
1. **HASYv2 Dataset** (Operators):
   * **Source**: Official release at Zenodo ([https://zenodo.org/records/259444](https://zenodo.org/records/259444)) and GitHub ([MartinThoma/hasy](https://github.com/MartinThoma/hasy)).
   * **License**: Creative Commons Attribution-ShareAlike 4.0 International (**CC BY-SA 4.0**).
   * **Selected Symbol Classes from `symbols.csv`**:
     * `+`: Symbol ID **196** (`+`)
     * `-`: Symbol ID **195** (`-`)
     * `×`: Symbol ID **513** (`\times`)
     * `÷`: Symbol ID **526** (`\div`)
     * `.`: Symbol ID **184** (`\cdot`)
     * `=`: **Composite Class** built by vertically stacking pairs of HASYv2 `-` (ID 195) samples with random vertical gap (5–9 px), small independent horizontal offsets, and scale/thickness variations. HASYv2 has no clean single `=` symbol (`\equiv` three-bar was rejected).
2. **MNIST Dataset** (Digits & Model O "digit" class):
   * **Source**: Yann LeCun & Corinna Cortes ([yann.lecun.com/exdb/mnist/](http://yann.lecun.com/exdb/mnist/)).
   * **License**: Open Data Commons Open Database License (**ODC-ODbL**) / Public Domain.

### B. Sample Counts & Augmentation Balancing Table
| Class Index | Symbol Name | Original Raw Samples | Train Split (Raw) | Test Split | Augmented Train Count |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 0 | `+` | 90 | 72 | 18 | **2,000** |
| 1 | `-` | 118 | 94 | 24 | **2,000** |
| 2 | `×` | 1,509 | 1,207 | 302 | **2,000** |
| 3 | `÷` | 335 | 268 | 67 | **2,000** |
| 4 | `=` (composite) | 500 | 400 | 100 | **2,000** |
| 5 | `.` | 755 | 604 | 151 | **2,000** |
| 6 | `digit` (MNIST) | 2,500 | 2,000 | 500 | **2,000** |

### C. Attribution Text
* **HASYv2 Dataset Attribution**: HASYv2 dataset copyright (c) Martin Thoma, licensed under CC BY-SA 4.0 ([https://zenodo.org/records/259444](https://zenodo.org/records/259444)).
* **MNIST Dataset Attribution**: MNIST dataset courtesy of Yann LeCun, Corinna Cortes, and Christopher J.C. Burges.

---

## 4. Documented Deviation Note

> **DOCUMENTED DEVIATION FROM "PRE-TRAINED ONLY" RULE**:
> Model O was trained by us on public open-source data (HASYv2 and MNIST) because no pre-existing lightweight single ONNX model covered all 7 required operator classes (`+`, `-`, `×`, `÷`, `=`, `.`, `"digit"`). Model D (`mnist-8.onnx`) remains 100% pre-trained from the ONNX Model Zoo and was used completely unchanged without any fine-tuning.

---

## 5. Standardized Input Preprocessing Specification

Both models share an identical input specification:
* **Dimensions**: Grayscale `28 × 28` pixels.
* **Tensor Layout**: NCHW format `[1, 1, 28, 28]`.
* **Pixel Value Normalization**: Float32 values scaled to `[0.0, 1.0]`.
* **Polarity**: White stroke on black background (`0.0` = background, `1.0` = peak stroke intensity).
* **Centering**: Stroke bounding box cropped and centered inside a `20 × 20` bounding box on the `28 × 28` canvas with preserved aspect ratio.

---

## 6. Model O Training & Parity Verification

### A. Training & Held-Out Test Set Metrics
* **Architecture**: Conv2D (16, 3x3) -> Conv2D (32, 3x3) -> MaxPool (2x2) -> Dropout (0.25) -> Dense (64) -> Dropout (0.5) -> Dense (7).
* **Parameters**: 18,343 (~224.4 KB ONNX binary size).
* **Epochs**: 12 epochs on CPU.
* **Model O Held-Out Test Accuracy (7 classes)**: **99.31%** (1,154 / 1,162 correct).

### B. Model O 7-Class Test Set Confusion Matrix
| True \ Pred | + | - | × | ÷ | = | . | digit |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **+** | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| **-** | 0 | 24 | 0 | 0 | 0 | 0 | 0 |
| **×** | 0 | 0 | 302 | 0 | 0 | 0 | 0 |
| **÷** | 0 | 0 | 0 | 66 | 0 | 1 | 0 |
| **=** | 0 | 0 | 0 | 0 | 100 | 0 | 0 |
| **.** | 0 | 1 | 0 | 0 | 0 | 147 | 3 |
| **digit** | 2 | 0 | 0 | 1 | 0 | 0 | 497 |

### C. Keras vs ONNX Parity Test
* **50-Input Max Logit Difference**: **`7.6293e-06`** (Target `< 1e-4`, **PASSED**).

---

## 7. Combined Two-Model Benchmark Results

Evaluating the full 16-symbol combined pipeline (`Model O` $\rightarrow$ if `"digit"`, `Model D`) on both synthetic wobble strokes (16 symbols × 15 samples = 240 samples) and real held-out test splits (MNIST test 10,000 images + HASYv2 test split 1,066 images = 11,066 samples):

* **Overall Combined Real Held-Out Test Accuracy**: **97.50%** (10,789 / 11,066)
  * **Real MNIST Digits Test Accuracy**: **98.25%** (9,825 / 10,000)
  * **Real HASYv2 Operators Test Accuracy**: **90.43%** (964 / 1,066)
* **Synthetic Stroke Benchmark Overall Accuracy**: **92.92%** (223 / 240)

---

## 8. Final 16-Symbol Per-Symbol Performance Table

> **Status Tagging Rule**: A symbol is tagged **PASSED** if real held-out accuracy is $\ge 85\%$ and synthetic stroke accuracy is $\ge 70\%$. If synthetic accuracy is $< 70\%$, it is strictly tagged **WEAK**.

| Symbol | Symbol Type | Real Held-Out Test Accuracy | Synthetic Stroke Accuracy | Overall Status |
| :---: | :---: | :---: | :---: | :---: |
| `0` | Digit | **99.49%** (975/980) | **100.00%** (15/15) | **PASSED** |
| `1` | Digit | **98.85%** (1122/1135) | **66.67%** (10/15) | **WEAK** |
| `2` | Digit | **98.16%** (1013/1032) | **100.00%** (15/15) | **PASSED** |
| `3` | Digit | **99.21%** (1002/1010) | **100.00%** (15/15) | **PASSED** |
| `4` | Digit | **98.07%** (963/982) | **100.00%** (15/15) | **PASSED** |
| `5` | Digit | **98.32%** (877/892) | **100.00%** (15/15) | **PASSED** |
| `6` | Digit | **98.23%** (941/958) | **53.33%** (8/15) | **WEAK** |
| `7` | Digit | **97.37%** (1001/1028) | **100.00%** (15/15) | **PASSED** |
| `8` | Digit | **97.02%** (945/974) | **100.00%** (15/15) | **PASSED** |
| `9` | Digit | **97.72%** (986/1009) | **66.67%** (10/15) | **WEAK** |
| `+` | Operator | **100.00%** (18/18) | **100.00%** (15/15) | **PASSED** |
| `-` | Operator | **100.00%** (24/24) | **100.00%** (15/15) | **PASSED** |
| `×` | Operator | **100.00%** (302/302) | **100.00%** (15/15) | **PASSED** |
| `÷` | Operator | **98.51%** (66/67) | **100.00%** (15/15) | **PASSED** |
| `=` | Operator | **80.56%** (406/504) | **100.00%** (15/15) | **NEEDS_ATTENTION** |
| `.` | Operator | **98.01%** (148/151) | **100.00%** (15/15) | **PASSED** |

---

## 9. Summary & Verification Commands

All required artifacts and scripts are built and reproducible inside `tools/model-build/` and copied to `public/models/`:
* `train_operators.py`: Preprocesses HASYv2, builds composite `=`, balances classes, trains Model O, exports `operators.onnx`, and verifies parity.
* `test_combined_pipeline.py`: Evaluates combined pipeline on synthetic wobble strokes and real test splits.
* `public/models/operators.onnx`: Model O binary (224.4 KB).
* `public/models/mnist-8.onnx`: Model D binary (26.4 KB).
* `public/models/labels.json`: Combined index-to-char mapping file for both models.
