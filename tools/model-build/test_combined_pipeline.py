import os
import json
import random
import numpy as np
import cv2
from tensorflow.keras.datasets import mnist
import onnxruntime as ort

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_O_PATH = os.path.join(BASE_DIR, "operators.onnx")
MODEL_D_PATH = os.path.join(BASE_DIR, "mnist-8.onnx")
HASY_DIR = os.path.join(BASE_DIR, "hasy_data")
SUMMARY_PATH = os.path.join(BASE_DIR, "combined_test_results.json")
LABELS_PATH = os.path.join(BASE_DIR, "labels.json")

# Classes
ALL_SYMBOLS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "-", "×", "÷", "=", "."]
OPERATOR_MAP = {0: "+", 1: "-", 2: "×", 3: "÷", 4: "=", 5: ".", 6: "digit"}
DIGIT_MAP = {i: str(i) for i in range(10)}

# Create combined labels.json
labels_data = {
    "operators_model": {
        "model_name": "operators.onnx",
        "input_spec": "NCHW [1, 1, 28, 28], float32 in [0.0, 1.0], white stroke on black background",
        "num_classes": 7,
        "labels": {str(k): v for k, v in OPERATOR_MAP.items()}
    },
    "digits_model": {
        "model_name": "mnist-8.onnx",
        "input_spec": "NCHW [1, 1, 28, 28], float32 in [0.0, 1.0], white stroke on black background",
        "num_classes": 10,
        "labels": {str(k): v for k, v in DIGIT_MAP.items()}
    }
}

with open(LABELS_PATH, "w") as f:
    json.dump(labels_data, f, indent=2)
print(f"Saved combined labels to {LABELS_PATH}")

# Initialize ONNX Sessions
session_o = ort.InferenceSession(MODEL_O_PATH)
session_d = ort.InferenceSession(MODEL_D_PATH)

input_o_name = session_o.get_inputs()[0].name
output_o_name = session_o.get_outputs()[0].name

input_d_name = session_d.get_inputs()[0].name
output_d_name = session_d.get_outputs()[0].name

def run_combined_pipeline(img_28x28_float):
    """
    img_28x28_float: numpy array of shape (28, 28), float32 in range [0, 1].
    Returns predicted symbol string.
    """
    tensor_input = img_28x28_float.reshape(1, 1, 28, 28).astype(np.float32)
    
    # Run Model O
    logits_o = session_o.run([output_o_name], {input_o_name: tensor_input})[0][0]
    pred_o_idx = int(np.argmax(logits_o))
    pred_o_symbol = OPERATOR_MAP[pred_o_idx]
    
    if pred_o_symbol == "digit":
        # Run Model D
        logits_d = session_d.run([output_d_name], {input_d_name: tensor_input})[0][0]
        pred_d_idx = int(np.argmax(logits_d))
        return DIGIT_MAP[pred_d_idx]
    else:
        return pred_o_symbol

def center_and_pad(img_gray):
    """Centers non-zero bounding box onto a 28x28 canvas inside a 20x20 square."""
    coords = cv2.findNonZero(img_gray)
    if coords is None:
        return np.zeros((28, 28), dtype=np.float32)
    x, y, w, h = cv2.boundingRect(coords)
    crop = img_gray[y:y+h, x:x+w]
    
    scale = 20.0 / max(w, h)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA)
    
    canvas = np.zeros((28, 28), dtype=np.uint8)
    dx = (28 - new_w) // 2
    dy = (28 - new_h) // 2
    canvas[dy:dy+new_h, dx:dx+new_w] = resized
    return canvas.astype(np.float32) / 255.0

def generate_synthetic_stroke_image(symbol):
    """Draws synthetic handwritten symbol with wobble, curved strokes, random thickness."""
    canvas = np.zeros((100, 100), dtype=np.uint8)
    thickness = random.randint(2, 5)
    
    def add_wobble(pts, wobble_scale=2.5):
        wobbled = []
        for (x, y) in pts:
            wx = x + random.uniform(-wobble_scale, wobble_scale)
            wy = y + random.uniform(-wobble_scale, wobble_scale)
            wobbled.append((int(wx), int(wy)))
        return np.array(wobbled, dtype=np.int32)

    def draw_curve(pts, is_closed=False):
        # Cubic spline / interpolated points
        pts = add_wobble(pts)
        cv2.polylines(canvas, [pts], is_closed, 255, thickness, cv2.LINE_AA)

    # Keypoints for symbols in 100x100 space
    if symbol == "0":
        draw_curve([(50, 20), (25, 35), (25, 65), (50, 80), (75, 65), (75, 35)], True)
    elif symbol == "1":
        draw_curve([(35, 30), (50, 20), (50, 80)])
    elif symbol == "2":
        draw_curve([(25, 35), (50, 20), (75, 35), (25, 80), (75, 80)])
    elif symbol == "3":
        draw_curve([(25, 25), (75, 25), (45, 50), (75, 65), (25, 80)])
    elif symbol == "4":
        draw_curve([(65, 20), (25, 60), (80, 60)])
        draw_curve([(65, 45), (65, 80)])
    elif symbol == "5":
        draw_curve([(75, 20), (30, 20), (30, 45), (70, 50), (60, 80), (25, 75)])
    elif symbol == "6":
        draw_curve([(70, 25), (35, 45), (30, 70), (65, 75), (65, 50), (35, 50)])
    elif symbol == "7":
        draw_curve([(25, 20), (75, 20), (45, 80)])
    elif symbol == "8":
        draw_curve([(50, 20), (30, 35), (50, 50), (70, 65), (50, 80), (30, 65), (50, 50), (70, 35)], True)
    elif symbol == "9":
        draw_curve([(65, 50), (35, 45), (35, 25), (65, 25), (65, 80)])
    elif symbol == "+":
        draw_curve([(50, 20), (50, 80)])
        draw_curve([(20, 50), (80, 50)])
    elif symbol == "-":
        draw_curve([(20, 50), (80, 50)])
    elif symbol == "×":
        draw_curve([(25, 25), (75, 75)])
        draw_curve([(75, 25), (25, 75)])
    elif symbol == "÷":
        draw_curve([(20, 50), (80, 50)])
        cv2.circle(canvas, (50, 30), thickness + 1, 255, -1)
        cv2.circle(canvas, (50, 70), thickness + 1, 255, -1)
    elif symbol == "=":
        # Draw two clean parallel horizontal bars with wobble
        y1 = random.randint(30, 38)
        y2 = y1 + random.randint(24, 30)
        draw_curve([(20, y1), (80, y1)])
        draw_curve([(20, y2), (80, y2)])
    elif symbol == ".":
        cx = random.randint(45, 55)
        cy = random.randint(70, 80)
        cv2.circle(canvas, (cx, cy), thickness + 2, 255, -1)
        
    return center_and_pad(canvas)

print("=== Running Synthetic Combined Benchmark (16 symbols x 15 samples = 240 samples) ===")
synthetic_conf_matrix = {s_true: {s_pred: 0 for s_pred in ALL_SYMBOLS} for s_true in ALL_SYMBOLS}
synthetic_results = {s: {"correct": 0, "total": 0} for s in ALL_SYMBOLS}

random.seed(42)
np.random.seed(42)

for symbol in ALL_SYMBOLS:
    for sample_idx in range(15):
        img_28 = generate_synthetic_stroke_image(symbol)
        pred_symbol = run_combined_pipeline(img_28)
        
        synthetic_conf_matrix[symbol][pred_symbol] += 1
        synthetic_results[symbol]["total"] += 1
        if pred_symbol == symbol:
            synthetic_results[symbol]["correct"] += 1

print("\n--- Synthetic Benchmark Per-Symbol Accuracy ---")
syn_total_correct = 0
syn_total_samples = 0
for s in ALL_SYMBOLS:
    c = synthetic_results[s]["correct"]
    t = synthetic_results[s]["total"]
    syn_total_correct += c
    syn_total_samples += t
    acc = (c / t) * 100.0
    print(f"Symbol {s:>2}: {c:2d}/{t:2d} ({acc:6.2f}%)")

syn_overall_acc = (syn_total_correct / syn_total_samples) * 100.0
print(f"\nOverall Synthetic Accuracy: {syn_total_correct}/{syn_total_samples} ({syn_overall_acc:.2f}%)")

# Print Synthetic Confusion Matrix
print("\n--- Synthetic Confusion Matrix ---")
header = "True \\ Pred | " + " ".join([f"{s:>3}" for s in ALL_SYMBOLS])
print(header)
print("-" * len(header))
for s_true in ALL_SYMBOLS:
    row_str = f"{s_true:>10} | " + " ".join([f"{synthetic_conf_matrix[s_true][s_pred]:3d}" for s_pred in ALL_SYMBOLS])
    print(row_str)

print("\n=== Running Real Held-Out Benchmark ===")

# 1. Real MNIST Test Split
(_, _), (x_mnist_test, y_mnist_test) = mnist.load_data()
real_digit_results = {str(d): {"correct": 0, "total": 0} for d in range(10)}
real_digit_conf = {str(t): {str(p): 0 for p in ALL_SYMBOLS} for t in range(10)}

for img_arr, target_digit in zip(x_mnist_test, y_mnist_test):
    img_np = img_arr.astype(np.float32) / 255.0
    pred = run_combined_pipeline(img_np)
    
    t_str = str(target_digit)
    real_digit_results[t_str]["total"] += 1
    if pred in ALL_SYMBOLS:
        real_digit_conf[t_str][pred] += 1
    if pred == t_str:
        real_digit_results[t_str]["correct"] += 1

digit_correct = sum(real_digit_results[d]["correct"] for d in real_digit_results)
digit_total = sum(real_digit_results[d]["total"] for d in real_digit_results)
print(f"Real MNIST Test Accuracy: {digit_correct}/{digit_total} ({(digit_correct/digit_total)*100.0:.2f}%)")

# 2. Real HASYv2 Held-Out Test Split
import csv

HASY_OPERATOR_CLASSES = {
    196: "+",
    195: "-",
    513: "×",
    526: "÷",
    603: "=",
    184: "."
}

labels_csv = os.path.join(HASY_DIR, "hasy-data-labels.csv")
rows_by_symbol = {sid: [] for sid in HASY_OPERATOR_CLASSES.keys()}

with open(labels_csv, "r") as f:
    reader = csv.DictReader(f)
    for row in reader:
        sid = int(row["symbol_id"])
        if sid in rows_by_symbol:
            rows_by_symbol[sid].append(row)

test_rows = []
random.seed(42)
for sid, rows in rows_by_symbol.items():
    random.shuffle(rows)
    split_idx = int(len(rows) * 0.8)
    test_rows.extend(rows[split_idx:])

real_op_results = {s: {"correct": 0, "total": 0} for s in HASY_OPERATOR_CLASSES.values()}
real_op_conf = {s_true: {s_pred: 0 for s_pred in ALL_SYMBOLS} for s_true in HASY_OPERATOR_CLASSES.values()}

for row in test_rows:
    img_path = os.path.join(HASY_DIR, row["path"])
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        continue
    img_inv = 255 - img
    img_28 = center_and_pad(img_inv)
    
    true_symbol = HASY_OPERATOR_CLASSES[int(row["symbol_id"])]
    pred_symbol = run_combined_pipeline(img_28)
    
    real_op_results[true_symbol]["total"] += 1
    if pred_symbol in ALL_SYMBOLS:
        real_op_conf[true_symbol][pred_symbol] += 1
    if pred_symbol == true_symbol:
        real_op_results[true_symbol]["correct"] += 1

op_correct = sum(real_op_results[s]["correct"] for s in real_op_results)
op_total = sum(real_op_results[s]["total"] for s in real_op_results)
print(f"Real HASYv2 Test Split Accuracy (Operators): {op_correct}/{op_total} ({(op_correct/op_total)*100.0:.2f}%)")

overall_real_correct = digit_correct + op_correct
overall_real_total = digit_total + op_total
print(f"Combined Real Held-Out Test Accuracy: {overall_real_correct}/{overall_real_total} ({(overall_real_correct/overall_real_total)*100.0:.2f}%)")

# Consolidate per-symbol final test metrics
per_symbol_summary = {}
for s in ALL_SYMBOLS:
    syn_acc = (synthetic_results[s]["correct"] / synthetic_results[s]["total"]) * 100.0
    if s in real_digit_results:
        real_acc = (real_digit_results[s]["correct"] / real_digit_results[s]["total"]) * 100.0
        real_tot = real_digit_results[s]["total"]
    elif s in real_op_results:
        real_acc = (real_op_results[s]["correct"] / real_op_results[s]["total"]) * 100.0
        real_tot = real_op_results[s]["total"]
    else:
        real_acc = 0.0
        real_tot = 0
        
    status = "WEAK" if syn_acc < 70.0 else ("PASSED" if real_acc >= 85.0 else "NEEDS_ATTENTION")
    per_symbol_summary[s] = {
        "synthetic_acc": f"{syn_acc:.2f}%",
        "real_heldout_acc": f"{real_acc:.2f}% ({real_tot} samples)",
        "status": status
    }

summary_output = {
    "overall_synthetic_accuracy": f"{syn_overall_acc:.2f}%",
    "overall_real_heldout_accuracy": f"{(overall_real_correct/overall_real_total)*100.0:.2f}%",
    "mnist_test_accuracy": f"{(digit_correct/digit_total)*100.0:.2f}%",
    "hasy_operators_test_accuracy": f"{(op_correct/op_total)*100.0:.2f}%",
    "per_symbol_summary": per_symbol_summary,
    "synthetic_confusion_matrix": synthetic_conf_matrix
}

with open(SUMMARY_PATH, "w") as f:
    json.dump(summary_output, f, indent=2)
print(f"\nSaved combined test results to {SUMMARY_PATH}")
