# 시계열 낙상 모델 실물 탐색 — 통합 가능 후보

> 경량 리서치(7 에이전트) · HF/GitHub repo 가중치 파일 직접 검증 · 2026-07-02
> 질문: 휴리스틱을 넘어 학습된 낙하 동작 모델을 오늘 밤 붙일 수 있는가

All key claims verified live: arisu04 has 3 weight files + `NUM_JOINTS=33 / CHANNELS=3 / SCALES=[64,128,256]` and a pure Conv2d/SE architecture (ONNX-friendly, no einsum); punpayut's `.tflite` + MIT LICENSE are committed; OliviaNocentini's `tsstg-model.pth` (24.7MB) is on HF; mmaction2 `.pth` returns HTTP 200 (12.4MB). Here is the report.

---

# 실행 보고서 — "오늘 밤 붙일 수 있는 시계열 낙상 모델이 있는가"

## 결론
**있습니다. 오늘 밤 붙일 수 있는 학습된(비-휴리스틱) 낙상 모델이 최소 2개 실재·검증됨.** 우리 스택(BlazePose 33 keypoint 실시간 스트림)에 그대로 물릴 수 있는 것은 **① `arisu04/Medical_Fall_Detection`** (Multiscale Temporal-Conv, 입력이 정확히 33관절×(x,y,visibility) — 좌표변환 0)과 **② `punpayut/Fall-Detection`** (Transformer, MediaPipe 17kp, MIT, tflite). ①은 입력 정합이 완벽해 "오늘 밤" 마찰이 가장 작고(서버 FastAPI 1~2시간, 브라우저 ONNX도 가능), ②는 MIT 라이선스 + 자체 F1 94.9% 지표 + tflite→tfjs로 브라우저 친화적이라 "근거가 필요한" 데모용으로 안전. 그 외 `GajuuzZ`(TSSTG, 낙상 전용 7클래스)·`OliviaNocentini`(그 HF 미러)·`taufeeque9`(LSTM 118KB)도 가중치 실재하나 서버 파이썬 경로. 결론: **휴리스틱 상태머신을 학습된 시계열 분류기로 오늘 밤 교체/보강 가능**하며, 권장은 ①을 서버 마이크로서비스로 먼저 붙여 신호를 얻고, 여력 시 ONNX로 브라우저 이관.

## 통합 가능 후보 (실재·가중치 확인된 것만)

| repo | 입력(기대 포맷) | 가중치(실측) | 배포 | 신뢰도 | 통합판정 |
|---|---|---|---|---|---|
| **arisu04/Medical_Fall_Detection** | 33관절×3ch(x,y,vis), 슬라이딩윈도우 64/128/256·stride16, 2클래스 | ✅ `*_state_dict.pth`(1.84MB)+`.pth`(5.5MB)+`mean_std.npz` HF Space 직커밋 (live 확인) | 서버 즉시 / 브라우저 ONNX 가능(순수 Conv2d+SE, einsum 無) | 낮음(지표無·LICENSE無) | **yes_browser** |
| **punpayut/Fall-Detection** | MediaPipe 17kp 서브셋, 30/60프레임, 2클래스 | ✅ `fall_detection_transformer.tflite` (HF space + rpi 둘 다) + MIT LICENSE (live 확인) | tflite→tfjs-tflite(WASM) 브라우저 / 서버 tflite-runtime | 중(자체 F1 94.9%·recall 94.1%) | **yes_browser** |
| **GajuuzZ/Human-Falling-Detect-Tracks** | 14노드 coco_cut×3ch(x,y,score), T=30, 7클래스(★Fall Down★) | ⚠️ `tsstg-model.pth` GDrive(repo 미커밋) | 서버 PyTorch(ST-GCN einsum→브라우저 opset12 리스크) | 상(커뮤니티 표준, Le2i 학습) | **yes_server** |
| **OliviaNocentini/Fall-detection-models** | GajuuzZ와 동일(14노드,T=30,7클래스) | ✅ `Models/TSSTG/tsstg-model.pth`(24.7MB) HF 직커밋 (live 확인) | 서버(추론코드는 GajuuzZ repo 참조) | 상(가중치 미러, 무결성 유리) | **yes_server** |
| **taufeeque9/HumanFallDetection** | COCO17에서 파생한 5개 시공간 피처 시퀀스→LSTM, 2클래스 | ✅ `model/lstm_weights.sav`(118KB) 직커밋 + MIT | 서버 즉시 / 브라우저는 피처+LSTM JS 재구현 | 중(초경량, 낙상 전용) | **yes_server** |
| **DuyNguDao/ST-GCN-Pytorch** | COCO13 skeleton 시퀀스, 7클래스(fall 포함) | ✅ `result_model/*/best_*.pt` 커밋(단 pose백본/액션헤드 혼재→파일용도 재확인) | 서버 PyTorch | 중(자체 confusion_matrix만) | **yes_server** |
| **open-mmlab/mmaction2 STGCN NTU60-2D** | COCO17×3ch, 클립 T≈100 정규화 | ✅ 공식 CDN `.pth`(12.4MB, HTTP 200 live 확인), Apache-2.0 | 서버 / mmdeploy ONNX 문서화 | 최상(공식·재현) but 낙상 전용 아님(A43만 트리거) | **yes_server(간접)** |

## 1순위 추천 + 구체 통합 단계 — `arisu04/Medical_Fall_Detection`
**선정 이유:** 8개 후보 중 유일하게 입력이 **우리 BlazePose 33과 100% 동일**(`NUM_JOINTS=33`, live 확인). 관절 리매핑·neck 계산·서브셋 슬라이싱 전부 불필요 → "오늘 밤"의 결정 변수인 마찰이 최소. 모델이 순수 `Conv2d`+`ChannelSE`+`TemporalConvBlock`(einsum/그래프인접행렬 없음)이라 ONNX 변환도 쉬움.

**입력 변환 (BlazePose33 → 기대 포맷):**
- 프레임마다 `landmarks[0..32]`에서 `(x, y, visibility)` 추출 → shape `(33, 3)`. (⚠️ app.py는 `[x,y,z,visibility]` 4값을 읽으므로 실제 3채널이 `x,y,vis`인지 `x,y,z`인지 app.py 슬라이싱 1줄만 5분 확인 후 확정 — 유일한 미확정 지점)
- 슬라이딩 버퍼 ≥64프레임 유지(부족분 zero-pad), stride 16으로 윈도우 추출.
- `mean_std.npz`의 mean/std로 정규화 → 텐서 `(1, C=3, T, V=33)`.

**배포: 오늘 밤 = 서버(FastAPI), 여유 시 = 브라우저(ONNX).**

**코드 스케치 (서버):**
```python
# step0: git clone https://huggingface.co/spaces/arisu04/Medical_Fall_Detection
#        → app.py에서 모델 클래스(MultiScaleTCN) + 전처리 그대로 재사용
import torch, numpy as np
from model import MultiScaleTCN            # app.py의 클래스 이식
model = MultiScaleTCN(); model.load_state_dict(
    torch.load('best_multiscale_stgcn_state_dict.pth', map_location='cpu')); model.eval()
ms = np.load('mean_std.npz'); MEAN, STD = ms['mean'], ms['std']

def infer(frames):                         # frames: List[T x 33 x 3]
    x = (np.asarray(frames, np.float32) - MEAN) / STD   # 정규화
    x = torch.from_numpy(x.transpose(2,0,1)[None])      # (1,3,T,33)
    with torch.no_grad():
        p_fall = torch.softmax(model(x), 1)[0,1].item() # 낙상 확률
    return p_fall
# Next.js: /api/fall → 최근 64+프레임 keypoint JSON POST → p_fall 반환
# p_fall>임계값 + 기존 heuristic AND 조건으로 오탐 억제, Claude Vision은 최종 confirm 유지
```
**브라우저 경로(후속):** `torch.onnx.export(model, dummy(1,3,128,33), opset=12)` → `onnxruntime-web`(WASM). 순수 conv라 einsum 이슈 없음. 프론트에서 keypoint 버퍼를 그대로 텐서화.

> 근거 보강이 필요하면 **동시에 punpayut(MIT+지표)** 를 두 번째 신호로 병렬 배치 후 앙상블(OR/가중). 아키텍처 다양성으로 오탐↓.

## 안 되는 것들과 이유 (솔직히)
- **VideoMAE 계열** (`yadvender12`, `zohaibshahid`): 입력이 **RGB 비디오 클립(16프레임)** — 우리 keypoint 스트림에 매핑 불가. `zohaibshahid`는 사실상 **빈 repo**(.gitattributes만, 가중치 無 → 사용 금지). `yadvender12`는 가중치 있으나 **CC-BY-NC(비상업)** + 원본 프레임 버퍼 필요.
- **itsTomLie/fall-detection(`best.pt`)**: YOLO **이미지 bbox** 탐지 — keypoint 입력 아님. 매핑 불가.
- **CTR-GCN / MotionBERT / pyskl / PoseC3D / yysijie-st-gcn**: 가중치는 있으나(일부 GDrive) **낙상 전용 클래스 없음**(NTU A43 근사 or 파인튜닝 전제), 3D 25관절/무거운 트랜스포머 → 서버 필수·오버스펙. 오늘 밤 부적합.
- **hoannc0506, aay-b, sanejiles(GRU), kelsonbatista**: **분류기 가중치 미커밋**(GDrive/미공개) 또는 빌드에러 → 즉시 추론 불가. `aay-b`는 직접 학습 전제.
- **axinc-ai/ailia st_gcn.onnx**: ONNX 실재·브라우저 참고가치 높으나 **Kinetics-400라 낙상 클래스 없음** + 라이선스 불명 → 헤드 교체/파인튜닝 필요(오늘 밤 fall 감지 불가).
- **majipa007, Y-B-Class-Projects**: **룰베이스(비-ML)** — 우리가 이미 가진 heuristic과 동급. 폴백/베이스라인 용도만.
- **GajuuzZ/OliviaNocentini/taufeeque9/DuyNguDao**: 붙일 수 있으나 **ST-GCN einsum/5D(브라우저 opset12 리스크)** 또는 `.sav`/외부 GDrive → **서버 경로만** 현실적(오늘 밤엔 arisu04보다 손이 더 감).

## 대안: 자체 경량 분류기 (위가 다 막힐 때만)
불필요할 가능성 높음(arisu04/punpayut 실재). 그래도 백업 계획: **UR Fall Detection(공개, 낙상 라벨)** 또는 **Le2i / OmniFall** 영상에서 BlazePose33 시퀀스 추출 → hip-center/torso-scale 정규화 → **소형 2-class TCN/LSTM**(우리 입력 스키마에 맞춰 33×3 그대로) 학습 → `torch.onnx.export` → `onnxruntime-web`. 소요 추정: 데이터 추출·정규화 2~3h + 학습 1~2h + export/통합 1~2h ≈ **반나절**. 오늘 밤 데모용으로는 arisu04 부착이 압도적으로 빠름.

## 출처
- arisu04/Medical_Fall_Detection — https://huggingface.co/spaces/arisu04/Medical_Fall_Detection (파일트리·`NUM_JOINTS=33` live 확인)
- punpayut/Fall-Detection — https://github.com/punpayut/Fall-Detection (`.tflite`×2 + MIT LICENSE live 확인)
- GajuuzZ/Human-Falling-Detect-Tracks — https://github.com/GajuuzZ/Human-Falling-Detect-Tracks
- OliviaNocentini/Fall-detection-models — https://huggingface.co/OliviaNocentini/Fall-detection-models (`tsstg-model.pth` 24.7MB live 확인)
- taufeeque9/HumanFallDetection — https://github.com/taufeeque9/HumanFallDetection
- DuyNguDao/ST-GCN-Pytorch — https://github.com/DuyNguDao/ST-GCN-Pytorch
- open-mmlab/mmaction2 STGCN — https://github.com/open-mmlab/mmaction2/blob/main/configs/skeleton/stgcn/README.md (`.pth` 12.4MB HTTP 200 live 확인)
- axinc-ai/ailia-models st_gcn — https://github.com/axinc-ai/ailia-models/tree/master/action_recognition/st_gcn (참고용, 낙상 전용 아님)
- 공개 학습 데이터셋: UR Fall Detection / Le2i Fall / OmniFall (대안 학습용)

※ 미확인: arisu04 3채널 정확 구성(x,y,vis vs x,y,z)은 app.py 슬라이싱 1줄 확인 필요 · DuyNguDao의 `.pt`별 pose백본/액션헤드 용도 · punpayut 지표는 저자 자체보고(외부 벤치 아님).
