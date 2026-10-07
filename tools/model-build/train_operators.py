#!/usr/bin/env python3
import os
import csv
import json
import numpy as np
import cv2
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, Dropout
from tensorflow.keras.optimizers import Adam
import tf2onnx
import onnxruntime as ort

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

def preprocess_hasy_image(img_path):
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    # 1. Invert black-on-white to white-on-black
    img_inv = 255 - img

    # 2. Find bounding box of white strokes
    coords = cv2.findNonZero(img_inv)
    if coords is not None:
        x, y, w, h = cv2.boundingRect(coords)
        crop = img_inv[y:y+h, x:x+w]
    else:
        crop = img_inv

    # 3. Resize preserving aspect ratio with padding to 28x28
    h_c, w_c = crop.shape
    max_dim = max(h_c, w_c)
    square = np.zeros((max_dim, max_dim), dtype=np.uint8)
    
    start_y = (max_dim - h_c) // 2
    start_x = (max_dim - w_c) // 2
    square[start_y:start_y+h_c, start_x:start_x+w_c] = crop

    # Resize to 20x20 inside 28x28 canvas (MNIST style padding)
    resized_20 = cv2.resize(square, (20, 20), interpolation=cv2.INTER_AREA)
    canvas_28 = np.zeros((28, 28), dtype=np.uint8)
    canvas_28[4:24, 4:24] = resized_20

    return canvas_28

def create_composite_equal_sign(img_minus1, img_minus2):
    """Composites TWO HASYv2 '-' minus stroke samples stacked vertically to create a real '=' sign."""
    # Find stroke bounding box for img1 and img2
    def extract_bar(img_28):
        coords = cv2.findNonZero(img_28)
        if coords is not None:
            x, y, w, h = cv2.boundingRect(coords)
            return img_28[y:y+h, x:x+w]
        return img_28[10:18, 4:24]

    bar1 = extract_bar(img_minus1)
    bar2 = extract_bar(img_minus2)

    # Canvas 40x40 to assemble comfortably, then crop & center to 28x28
    canvas = np.zeros((40, 40), dtype=np.uint8)

    # Resize bars to ~16-20px width
    w1 = np.random.randint(14, 20)
    h1 = max(2, int(bar1.shape[0] * (w1 / max(1, bar1.shape[1]))))
    bar1_resized = cv2.resize(bar1, (w1, max(1, h1)), interpolation=cv2.INTER_AREA)

    w2 = np.random.randint(14, 20)
    h2 = max(2, int(bar2.shape[0] * (w2 / max(1, bar2.shape[1]))))
    bar2_resized = cv2.resize(bar2, (w2, max(1, h2)), interpolation=cv2.INTER_AREA)

    # Offsets and vertical gap (5 to 9 pixels)
    gap = np.random.randint(5, 9)
    x1_off = np.random.randint(8, 14)
    y1_off = 10
    x2_off = x1_off + np.random.randint(-2, 3)
    y2_off = y1_off + h1 + gap

    canvas[y1_off:y1_off+bar1_resized.shape[0], x1_off:x1_off+bar1_resized.shape[1]] = cv2.add(
        canvas[y1_off:y1_off+bar1_resized.shape[0], x1_off:x1_off+bar1_resized.shape[1]], bar1_resized
    )
    canvas[y2_off:y2_off+bar2_resized.shape[0], x2_off:x2_off+bar2_resized.shape[1]] = cv2.add(
        canvas[y2_off:y2_off+bar2_resized.shape[0], x2_off:x2_off+bar2_resized.shape[1]], bar2_resized
    )

    # Crop composite and center into 20x20 box inside 28x28
    coords = cv2.findNonZero(canvas)
    if coords is not None:
        x, y, w, h = cv2.boundingRect(coords)
        crop = canvas[y:y+h, x:x+w]
        scale = 20.0 / max(w, h)
        nw = max(1, int(w * scale))
        nh = max(1, int(h * scale))
        resized = cv2.resize(crop, (nw, nh), interpolation=cv2.INTER_AREA)
        out = np.zeros((28, 28), dtype=np.uint8)
        dx = (28 - nw) // 2
        dy = (28 - nh) // 2
        out[dy:dy+nh, dx:dx+nw] = resized
        return out
    return preprocess_hasy_image(img_minus1)

def augment_stroke_image(img_28):
    img = img_28.copy()
    
    # Random rotation +-10 deg
    angle = np.random.uniform(-10, 10)
    M_rot = cv2.getRotationMatrix2D((14, 14), angle, 1.0)
    img = cv2.warpAffine(img, M_rot, (28, 28))

    # Random translation +-2 px
    tx = np.random.randint(-2, 3)
    ty = np.random.randint(-2, 3)
    M_trans = np.float32([[1, 0, tx], [0, 1, ty]])
    img = cv2.warpAffine(img, M_trans, (28, 28))

    # Random dilate/erode (thickening/thinning)
    r = np.random.rand()
    kernel = np.ones((2, 2), np.uint8)
    if r < 0.25:
        img = cv2.dilate(img, kernel, iterations=1)
    elif r < 0.40:
        img = cv2.erode(img, kernel, iterations=1)

    # Random blur
    if np.random.rand() < 0.3:
        img = cv2.GaussianBlur(img, (3, 3), 0.5)

    return img

def main():
    base_dir = os.path.dirname(__file__)
    hasy_dir = os.path.join(base_dir, "hasy_data")
    labels_csv = os.path.join(hasy_dir, "hasy-data-labels.csv")

    print("=== Step 1: Loading & Mapping HASYv2 Operator Classes ===")
    # Target operator symbol_ids in HASYv2
    # 196: +, 195: -, 513: \times, 526: \div, 184: \cdot (.)
    target_ids = {
        '196': 0, # '+'
        '195': 1, # '-'
        '513': 2, # 'times'
        '526': 3, # 'div'
        '184': 5  # '.'
    }

    operator_samples = {cls_idx: [] for cls_idx in [0, 1, 2, 3, 5]}

    with open(labels_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sid = row['symbol_id']
            if sid in target_ids:
                c_idx = target_ids[sid]
                img_path = os.path.join(hasy_dir, row['path'])
                processed_28 = preprocess_hasy_image(img_path)
                if processed_28 is not None:
                    operator_samples[c_idx].append(processed_28)

    # Build Class 4 ('=') from composite pairs of HASYv2 '-' minus samples
    minus_samples = operator_samples[1]
    np.random.seed(42)
    equal_samples = []
    for _ in range(500):
        idx1, idx2 = np.random.choice(len(minus_samples), 2, replace=True)
        eq_img = create_composite_equal_sign(minus_samples[idx1], minus_samples[idx2])
        equal_samples.append(eq_img)
    operator_samples[4] = equal_samples

    print("\n=== Raw HASYv2 Sample Counts Per Class (Before Augmentation) ===")
    class_labels_map = {0: '+', 1: '-', 2: '×', 3: '÷', 4: '= (composite)', 5: '.', 6: 'digit (MNIST)'}
    for c_idx in range(6):
        print(f"Class {c_idx} ({class_labels_map[c_idx]}): {len(operator_samples[c_idx])} original samples.")

    print("\n=== Step 2: Loading MNIST Digits for Class 6 ('digit') ===")
    (x_train_mnist, y_train_mnist), (x_test_mnist, y_test_mnist) = tf.keras.datasets.mnist.load_data()
    mnist_digit_train = x_train_mnist[:2000]
    mnist_digit_test = x_test_mnist[:500]
    print(f"Loaded {len(mnist_digit_train)} MNIST training digits for Class 6 ('digit').")

    print("\n=== Step 3: Augmenting & Building Balanced Dataset ===")
    TARGET_PER_CLASS = 2000
    
    X_train_list, Y_train_list = [], []
    X_test_list, Y_test_list = [], []

    for c_idx in range(6):
        samps = operator_samples[c_idx]
        np.random.shuffle(samps)

        split_idx = int(0.8 * len(samps))
        train_samps = samps[:split_idx]
        test_samps = samps[split_idx:]

        for img in test_samps:
            X_test_list.append(img.astype(np.float32) / 255.0)
            Y_test_list.append(c_idx)

        # Balance training set to exactly TARGET_PER_CLASS using augmentation
        aug_train = list(train_samps)
        while len(aug_train) < TARGET_PER_CLASS:
            base_img = train_samps[np.random.randint(0, len(train_samps))]
            aug_img = augment_stroke_image(base_img)
            aug_train.append(aug_img)
        
        for img in aug_train[:TARGET_PER_CLASS]:
            X_train_list.append(img.astype(np.float32) / 255.0)
            Y_train_list.append(c_idx)

    # Class 6 ('digit')
    for img in mnist_digit_test:
        X_test_list.append(img.astype(np.float32) / 255.0)
        Y_test_list.append(6)

    for img in mnist_digit_train:
        X_train_list.append(img.astype(np.float32) / 255.0)
        Y_train_list.append(6)

    X_train = np.array(X_train_list, dtype=np.float32)[..., np.newaxis]
    Y_train = np.array(Y_train_list, dtype=np.int32)
    X_test = np.array(X_test_list, dtype=np.float32)[..., np.newaxis]
    Y_test = np.array(Y_test_list, dtype=np.int32)

    print("\n=== Balanced Dataset Counts (After Augmentation) ===")
    for c_idx in range(7):
        n_tr = np.sum(Y_train == c_idx)
        n_te = np.sum(Y_test == c_idx)
        print(f"Class {c_idx} ({class_labels_map[c_idx]}): Train={n_tr}, Test={n_te}")

    print(f"\nFinal Dataset: X_train shape: {X_train.shape}, X_test shape: {X_test.shape}")

    print("\n=== Step 4: Building Small CNN for Model O ===")
    model_o = Sequential([
        Conv2D(16, (3, 3), activation='relu', input_shape=(28, 28, 1)),
        MaxPooling2D((2, 2)),
        Conv2D(32, (3, 3), activation='relu'),
        MaxPooling2D((2, 2)),
        Flatten(),
        Dense(64, activation='relu'),
        Dropout(0.3),
        Dense(7)
    ])

    model_o.compile(
        optimizer=Adam(learning_rate=1e-3),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics=['accuracy']
    )

    model_o.summary()

    print("\n=== Step 5: Training Model O ===")
    history = model_o.fit(
        X_train, Y_train,
        epochs=12,
        batch_size=64,
        validation_data=(X_test, Y_test),
        verbose=1
    )

    test_loss, test_acc = model_o.evaluate(X_test, Y_test, verbose=0)
    print(f"\nHeld-out Test Set Accuracy (7 classes): {test_acc*100.0:.2f}%")

    test_preds = np.argmax(model_o.predict(X_test, verbose=0), axis=1)
    cm = tf.math.confusion_matrix(Y_test, test_preds).numpy()
    
    class_names = ['+', '-', 'times', 'div', '=', '.', 'digit']
    print("\nTest Set Confusion Matrix (7 Classes):")
    print(f"{'True \\ Pred':<12s}" + "".join([f"{cn:>8s}" for cn in class_names]))
    for idx, row in enumerate(cm):
        print(f"{class_names[idx]:<12s}" + "".join([f"{val:>8d}" for val in row]))

    print("\n=== Step 6: Exporting Model O to ONNX (NCHW [1, 1, 28, 28]) ===")
    @tf.function
    def nchw_model_fn(x_nchw):
        x_nhwc = tf.transpose(x_nchw, [0, 2, 3, 1])
        logits = model_o(x_nhwc)
        return logits

    input_spec_nchw = tf.TensorSpec([None, 1, 28, 28], tf.float32, name="input")
    onnx_operators, _ = tf2onnx.convert.from_function(
        nchw_model_fn,
        input_signature=[input_spec_nchw],
        opset=13
    )

    onnx_operators_path = os.path.join(base_dir, "operators.onnx")
    with open(onnx_operators_path, "wb") as f:
        f.write(onnx_operators.SerializeToString())

    onnx_size_bytes = os.path.getsize(onnx_operators_path)
    print(f"operators.onnx saved to {onnx_operators_path} ({onnx_size_bytes} bytes / {onnx_size_bytes/1024:.1f} KB).")

    print("\n=== Step 7: Parity Test (Keras vs ONNX Runtime) ===")
    sess = ort.InferenceSession(onnx_operators_path, providers=['CPUExecutionProvider'])
    in_name = sess.get_inputs()[0].name

    sample_50_nhwc = X_test[:50]
    sample_50_nchw = np.transpose(sample_50_nhwc, (0, 3, 1, 2))

    keras_logits = model_o.predict(sample_50_nhwc, verbose=0)
    onnx_logits = sess.run(None, {in_name: sample_50_nchw})[0]

    max_diff = float(np.max(np.abs(keras_logits - onnx_logits)))
    print(f"Maximum absolute logit difference (Keras vs ONNX): {max_diff:.8e}")
    print(f"Parity Test Status: {'PASSED (< 1e-4)' if max_diff < 1e-4 else 'FAILED'}")

    labels_operators = {
        "model_name": "operators.onnx",
        "input_spec": "NCHW [1, 1, 28, 28], float32 in [0, 1], white stroke on black background",
        "num_classes": 7,
        "classes": {
            "0": "+",
            "1": "-",
            "2": "×",
            "3": "÷",
            "4": "=",
            "5": ".",
            "6": "digit"
        }
    }
    with open(os.path.join(base_dir, "labels_operators.json"), "w") as f:
        json.dump(labels_operators, f, indent=2)

    labels_digits = {
        "model_name": "mnist-8.onnx",
        "input_spec": "NCHW [1, 1, 28, 28], float32 in [0, 1], white stroke on black background",
        "num_classes": 10,
        "classes": {str(i): str(i) for i in range(10)}
    }
    with open(os.path.join(base_dir, "labels_digits.json"), "w") as f:
        json.dump(labels_digits, f, indent=2)

    combined_labels = {
        "operators_model": labels_operators,
        "digits_model": labels_digits
    }
    with open(os.path.join(base_dir, "labels.json"), "w") as f:
        json.dump(combined_labels, f, indent=2)

    training_summary = {
        "model_o_test_accuracy_pct": round(float(test_acc * 100.0), 2),
        "onnx_size_bytes": onnx_size_bytes,
        "parity_max_diff": max_diff,
        "parity_passed": max_diff < 1e-4,
        "confusion_matrix_7_classes": cm.tolist()
    }
    with open(os.path.join(base_dir, "training_summary.json"), "w") as f:
        json.dump(training_summary, f, indent=2)

    print("Saved training_summary.json, labels_operators.json, labels_digits.json, and labels.json successfully.")

if __name__ == '__main__':
    main()
