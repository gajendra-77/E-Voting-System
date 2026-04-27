import cv2
import numpy as np
import base64
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Eye landmark indices (FaceMesh compatible)
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]


def decode_image(base64_img):
    header, encoded = base64_img.split(",", 1)
    img = base64.b64decode(encoded)
    npimg = np.frombuffer(img, np.uint8)
    return cv2.imdecode(npimg, cv2.IMREAD_COLOR)


def eye_aspect_ratio(eye):
    A = np.linalg.norm(eye[1] - eye[5])
    B = np.linalg.norm(eye[2] - eye[4])
    C = np.linalg.norm(eye[0] - eye[3])
    return (A + B) / (2.0 * C)


def check_liveness(image_list):
    left = False
    right = False

    # Track nose x min/max across frames instead of relying on absolute per-frame
    nose_min = 1.0
    nose_max = 0.0

    base_options = python.BaseOptions(
        model_asset_path="models/face_landmarker.task"
    )

    options = vision.FaceLandmarkerOptions(
        base_options=base_options,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
        num_faces=1
    )

    detector = vision.FaceLandmarker.create_from_options(options)

    for img_data in image_list:
        image = decode_image(img_data)

        # Resize large images to speed up Mediapipe processing while
        # preserving aspect ratio. Webcam from frontend is 480x360;
        # downscale to max width 320 for faster landmark detection.
        try:
            h0, w0, _ = image.shape
            target_w = 320
            if w0 > target_w:
                scale = target_w / float(w0)
                new_h = int(h0 * scale)
                image = cv2.resize(image, (target_w, new_h))
        except Exception:
            # if anything goes wrong with resizing, continue with original
            pass

        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=rgb
        )

        result = detector.detect(mp_image)

        if not result.face_landmarks:
            continue

        landmarks = result.face_landmarks[0]
        h, w, _ = image.shape

        def p(i):
            return np.array([landmarks[i].x * w, landmarks[i].y * h])

        left_eye = np.array([p(i) for i in LEFT_EYE])
        right_eye = np.array([p(i) for i in RIGHT_EYE])

        ear = (eye_aspect_ratio(left_eye) + eye_aspect_ratio(right_eye)) / 2

        nose_x = landmarks[1].x
        # update min/max observed nose x positions
        if nose_x < nose_min:
            nose_min = nose_x
        if nose_x > nose_max:
            nose_max = nose_x

        # tolerant thresholds for left/right head turns
        if nose_min < 0.45:
            left = True
        if nose_max > 0.55:
            right = True

        # allow a single-direction head turn to count by measuring overall
        # nose movement across frames. This helps when user turns mostly one way.
        nose_delta = nose_max - nose_min
        movement_sufficient = nose_delta > 0.16  # tunable

        # debug logging to help tune thresholds (visible in server logs)
        print(
            f"nose_x={nose_x:.3f}, nose_min={nose_min:.3f}, "
            f"nose_max={nose_max:.3f}, nose_delta={nose_delta:.3f}, "
            f"left={left}, right={right}, movement_ok={movement_sufficient}"
        )

        # require either a left+right sequence OR sufficient overall movement
        head_movement_ok = (left and right) or movement_sufficient
        if head_movement_ok:
            detector.close()
            return True


    detector.close()
    return False
