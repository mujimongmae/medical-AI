# 낙상 감지 아키텍처 강화 — 논문+HuggingFace+Claude Vision 리서치

> 경량 리서치(8 에이전트) · HF repo 실재·배포성 직접 검증 · 2026-07-02
> 현재 구조(MoveNet+COCO-SSD+heuristic)를 캐스케이드(경량 트리거→무거운 확인)로 강화하는 실행 권고

## Executive Summary

현재의 브라우저 heuristic 상태머신을 **버리지 말고 "1차 트리거"로 격하**하고, 그 위에 (1) **더 정밀한 포즈 마커(MediaPipe BlazePose 33개 3D landmark)** + **post-fall 무운동 게이트**, (2) **경량 시계열 분류기 또는 서버 VideoMAE 행위 인식**, (3) **Claude Vision 이벤트 트리거 2차 확인**을 얹는 **캐스케이드 아키텍처**로 강화하는 것이 최적입니다. 이 "경량 온디바이스 트리거 → 무거운 확인자" 2단계 구조는 다수 논문(arXiv 2507.10474, 2401.16280, SmartHome-Bench)이 오탐(앉기/눕기 오판)을 줄이는 표준 패턴으로 검증했습니다. 브라우저 실시간 메인은 tfjs/MediaPipe로 유지하고, 무거운 video transformer는 서버 또는 "트리거 시에만" 호출해 비용·프라이버시·지연을 동시에 잡습니다. HF 전용 낙상 모델은 신뢰도가 낮아(단일 기여자·지표 미공개) 데모 참고용으로만 쓰고, omnifall로 자체 파인튜닝/검증하는 경로를 로드맵에 둡니다.

## 행위 인식(action recognition) 업그레이드 — 논문 + HF 모델, 배포경로

낙상은 프레임 단위보다 **짧은 클립(시퀀스) 단위 판정**이 정확합니다(Cutup and Detect, arXiv 2401.16280 → HQFSD F1 0.96).

- **MCG-NJU/videomae-base-finetuned-kinetics** ✅확인 — K400 top-1 80.9%, 86.5M params, 월 38k DL. 낙상 파생본들의 표준 백본. 16프레임 224px 클립 입력 → 트리거가 잡은 3~5초 구간에 정합. 자가지도 사전학습이라 소량 낙상 데이터로 data-efficient 파인튜닝(해커톤 유리). **서버 파이썬(transformers) 필수, 브라우저 불가.**
- **yadvender12/...-fall-detect** ✅확인(존재) — HF 유일 전용 낙상 video-classification 모델. DL 98·likes 1·ONNX 없음·학습셋 미공개. 즉시 쓸 후보지만 **커뮤니티 단일 기여자·지표 부재 → 데모용, 자체 검증 필수.** transformers.js 미지원(ONNX 부재로 재확인)이라 브라우저 직접구동 불가.
- **zohaibshahid/videomae-base-finetuned-fall-detection** ✅확인(존재) — DL 0·model card 없음·지표 미공개. **성능 신뢰 불가**, 가중치만 참고.
- 대안 백본: **OpenGVLab/VideoMAEv2-Base**(CVPR'23, 더 강한 표현력), **facebook/timesformer-base-finetuned-k400**(추론 SlowFast 대비 압도적 빠름 → 근실시간 서버 데모 유리). 둘 다 서버 전용.
- 스켈레톤 기반 대안: **PoseC3D**(occlusion 강건, MMAction2), **X3D**(효율 3D-CNN, XS/S면 근실시간). HF 전용 낙상 체크포인트 미확인 → 파인튜닝 경로.

배포 결론: **video transformer는 전부 서버 GPU 근실시간(1~2s 지연)**. 브라우저 메인 경로 아님.

## 포즈 마커 업그레이드 — BlazePose/RTMPose/Holistic, 브라우저 구동

현재 MoveNet(17 keypoint, 2D)에서 정밀도를 올리는 핵심 레버입니다.

- **MediaPipe Pose Landmarker (@mediapipe/tasks-vision, BlazePose GHUM)** — **1순위 추천.** 33개 3D landmark(x,y,z+visibility, world coords). z-depth·상체 각도·수직 낙하 속도를 상태머신보다 정밀 계산. 표준 웹캠 30+FPS, 성숙도·문서 최상. Next.js `'use client'`+dynamic import/Web Worker로 구동.
- **MoveNet MultiPose Lightning** — 최대 6인 + `enableTracking` 내장. 홈캠 다인원(가족+환자)에서 대상 지속 추적에 유리. 단 3D z 약함 → 낙상 각도는 BlazePose보다 불리.
- **Xenova/yolov8n-pose** ✅확인(DL 152, AGPL 주의) — 사람검출+17 keypoint 단일망(top-down 불필요). transformers.js/onnxruntime-web WebGPU에서 nano 실시간. 상용 시 AGPL 유의.
- **onnx-community/vitpose-base-simple** ✅확인(DL 233, likes 3) — ViTPose ONNX, keypoint-detection 파이프라인 공식 지원. 정확하나 top-down·수 FPS → **실시간 메인 아님, 정밀 검증/합성데이터 pseudo-label용.**
- **RTMPose-m**(COCO 75.8% AP, GPU 430+FPS) — 공식 웹 파이프라인 부재 → 서버(FastAPI+ONNX) 경로.
- **MediaPipe Holistic(543 landmark)** — 낙상엔 face/hand 과잉으로 프레임레이트만 저하. **기본 미권장**(쓰러진 뒤 손떨림/의식 확인 부가신호 필요 시만 선택).

논문 근거: BlazePose+개선 ST-GCN(JRTIP 2023, Jetson Nano 실시간), Video-Based Fall Detection Using Human Poses(arXiv 2107.14633, 엉덩이 수직속도·몸통각도·종횡비 급변 피처), Modeling Skeleton Joint Dynamics(arXiv 2503.06938, 2025 GCN SOTA).

## 객체 탐지 업그레이드 — YOLO/RT-DETR/open-vocab, transformers.js

COCO-SSD(MobileNet)를 교체해 person bbox 품질·소형객체·씬 컨텍스트를 개선합니다.

- **onnx-community/yolov10n** ✅확인(DL~100) — YOLOv10 NMS-free end-to-end → 후처리 가볍고 지연 낮음. **브라우저 실시간 1순위.** transformers.js/onnxruntime-web(WebGPU/WASM).
- **Xenova/yolov9-c** ✅확인 — 저자 직접 "브라우저 로컬 실시간 YOLOv9" 데모. COCO 80클래스, COCO-SSD 대비 정확도 우위.
- **RT-DETR / RT-DETRv2** — transformers.js object-detection 공식 지원. 고정확 옵션이나 브라우저 실시간은 소형 백본만.
- **YOLO-World / OWL-ViT(google/owlvit-base-patch32)** — open-vocab/zero-shot으로 "넘어진 사람·침대·소파·휠체어" 텍스트 탐지 → 씬 컨텍스트로 오탐 억제. 단 ViT라 느림 → **보조 검증/씬 이해용**, 실시간 부적합.

용도: bbox 종횡비 급변(서있음 세로→누움 가로)을 값싼 1차 낙상 신호로, 가구 위치를 오탐 억제 컨텍스트로 상태머신에 공급.

## Claude Vision / VLM 확인 레이어 — 2단계 캐스케이드 설계

**핵심 강화 포인트.** 1차 트리거가 잡은 순간의 키프레임 3~8장만 VLM에 보내 "실제 낙상 여부 + 무운동 + 응급도 + 보호자 알림 문구"를 판정합니다.

- **Claude Vision (multi-image + tool_use)** — 우리 스택이 이미 Claude API라 통합 최소. 1요청 최대 100장, 트리거 순간 키프레임을 순서대로 넣고 `tool_use` 강제 JSON `{fallen, motionless, needs_help, confidence, reason}` 수신. confidence 저신뢰 시 프레임 추가/사용자 확인 팝업. 이미지 1568px·1.15MP 이하 리사이즈로 TTFT 단축. **서버(Next.js Server Action) 경유, 이벤트당 1~수초, 상시 스트림 부적합.** CLAUDE.md 규칙상 진단 아님 → "판정 + 119 안내"로만.
- 온디바이스 저비용 게이트: **HuggingFaceTB/SmolVLM-256M-Instruct-WebGPU** ✅확인(Space RUNNING) — transformers.js+WebGPU 100% 브라우저, VQA "사람이 바닥에 쓰러져 안 움직이나?". 프레임당 ~0.5s, 정확도 낮음 → 1.5단계 저비용 컷. 정확도 우선이면 **Xenova/moondream2(1.9B)** 또는 서버 **Qwen2-VL-2B**.
- **SmolVLM2-500M-Video-Instruct** ✅확인 — 멀티프레임 입력. 단 transformers.js 비디오 경로 미완성(issue #1450) → 현시점 이미지 리스트 방식이 현실적, 서버 권장.

논문 근거: SmartHome-Bench(arXiv 2506.12992, CVPRW'25) — 스마트홈캠 이상탐지에서 단발 프롬프트보다 **LLM chaining(TRLC)이 +11.62%p, Claude-3.5-Sonnet TRLC 79.05% 최고** → 확인 프롬프트는 체이닝/ICL 설계. Privacy-Preserving Multi-Stage(arXiv 2507.10474) — 비전 확인 단계 추가가 오탐(신뢰 상실 최대 실패요인) 완화.

## 브라우저 실시간 배포 현실성 (transformers.js / onnxruntime-web / WebGPU)

- **완전 실시간(30~50+FPS) 확실**: MediaPipe Pose Landmarker, MoveNet(tfjs) — 온디바이스, 영상 서버 전송 없음(프라이버시 우수).
- **WebGPU면 실시간, WASM은 수 FPS**: YOLOv10n/YOLOv9-c(transformers.js), yolov8n-pose(onnxruntime-web). 커스텀 경량 keypoint 분류기(1D-CNN/LSTM/작은 ST-GCN, 파라미터 수만~수십만)를 ONNX export → **onnxruntime-web 브라우저 실시간 판정 가능**(서버 왕복 없음).
- **브라우저 부적합**: VideoMAE/TimeSformer/X3D/PoseC3D 등 3D video transformer(무겁고 클립버퍼 필요) → **서버 전용**. **transformers.js는 video-classification 파이프라인 공식 미지원** → VideoMAE류 브라우저 직접구동 불가(프레임 image-classification 우회만 가능).
- Next.js 주의: 포즈/VLM 런타임은 RSC 아님 → `'use client'` + **Web Worker** 로드(SSR 회피).

## 권장 강화 아키텍처 (우리 앱에 바로 적용 — 티어)

**즉시 적용 (오늘, 브라우저 온디바이스만):**
1. MoveNet → **MediaPipe Pose Landmarker(33 3D landmark)** 교체/병행. 3D z로 수직 낙하 속도·상체 각도 정밀화.
2. heuristic에 **post-fall 무운동 게이트** 추가(낙하 감지 후 질량중심 정지 N초 타이머) + **20프레임 슬라이딩 버퍼**(arXiv 2503.19501)로 순간 흔들림 오판 차단. → 앉기/눕기/물건줍기 ADL을 여기서 대량 필터.
3. keypoint 피처 엔지니어링(엉덩이 수직속도·몸통각도·종횡비·바닥 근접 지속시간, arXiv 2107.14633 / 2401.01587) → 상태머신 규칙 강화.

**데모용 (해커톤 시연, 오탐 극감):**
4. 트리거 통과 순간에만 **Claude Vision multi-image + tool_use JSON** 2차 확인 → 보호자 알림 문구 + 119 안내 생성(디스클레이머 필수).
5. COCO-SSD → **onnx-community/yolov10n**(transformers.js WebGPU) 교체로 person/가구 탐지 품질↑.
6. (선택) 오프라인 우선 데모면 **SmolVLM-256M WebGPU** 온디바이스 게이트로 Claude 호출 전 1차 컷.

**로드맵 (파인튜닝·서버):**
7. **omnifall / DeZan/fall-detection / UR Fall**로 경량 시계열 분류기(LSTM/ST-GCN head) 학습 → ONNX → onnxruntime-web 온디바이스 판정(heuristic 완전 대체).
8. 또는 서버 GPU에서 **VideoMAE/TimeSformer를 omnifall 파인튜닝** → 트리거 클립만 근실시간 검증. omnifall의 "연출→야생" protocol로 실제 홈캠 일반화 정직 측정.

## HF 모델·데이터셋 목록 (repo id + 배포경로 + 검증)

| repo id | 용도 | 배포 | 검증 |
|---|---|---|---|
| MCG-NJU/videomae-base-finetuned-kinetics | 행위인식 백본(파인튜닝) | 서버 | ✅확인 (K400 80.9%, 86.5M, 38k DL) |
| yadvender12/videomae-base-finetuned-kinetics-finetuned-fall-detect | 전용 낙상 분류(데모) | 서버 | ✅존재확인 (DL98, ONNX無, 지표無·저신뢰) |
| zohaibshahid/videomae-base-finetuned-fall-detection | 낙상 가중치 참고 | 서버 | ✅존재확인 (card無·DL0·신뢰불가) |
| OpenGVLab/VideoMAEv2-Base / facebook/timesformer-base-finetuned-k400 | 대안 백본 | 서버 | 존재(공식·널리 쓰임, HF 낙상체크포인트 없음) |
| MediaPipe Pose Landmarker (@mediapipe/tasks-vision) | 포즈 33 3D | 브라우저 실시간 | Google 공식(HF repo 아님) |
| MoveNet (@tensorflow-models/pose-detection) | 포즈 17 | 브라우저 실시간 | tfjs/TF Hub(HF repo 아님) |
| Xenova/yolov8n-pose | 포즈 백본(대안) | 브라우저 WebGPU | ✅확인 (DL152, AGPL) |
| onnx-community/vitpose-base-simple | 정밀 포즈/pseudo-label | 브라우저 수FPS | ✅확인 (DL233, likes3) |
| onnx-community/yolov10n | 객체탐지 실시간 | 브라우저 WebGPU | ✅확인 (DL~100) |
| Xenova/yolov9-c | 객체탐지 | 브라우저 WebGPU | ✅확인 |
| HuggingFaceTB/SmolVLM-256M-Instruct(-WebGPU) | 온디바이스 VLM 게이트 | 브라우저 WebGPU | ✅확인 (Space RUNNING) |
| HuggingFaceTB/SmolVLM2-500M-Video-Instruct | 멀티프레임 VLM | 서버 권장 | ✅확인 (browser video 제한적) |
| Xenova/moondream2 / Qwen/Qwen2-VL-2B-Instruct | 정밀 VLM 확인자 | 브라우저(무거움)/서버 | 존재(공식) |
| simplexsigil2/omnifall | 파인튜닝·평가 벤치 | 서버 오프라인 | ✅확인 (80h·15k·16class, arXiv 2505.19889) |
| DeZan/fall-detection | 검증셋 | 서버 오프라인 | ✅확인 |

## 출처

- VideoMAE(NeurIPS'22): huggingface.co/MCG-NJU/videomae-base-finetuned-kinetics · VideoMAEv2(CVPR'23) OpenGVLab/VideoMAEv2-Base · TimeSformer(ICML'21) facebook/timesformer-base-finetuned-k400
- omnifall: arXiv 2505.19889, huggingface.co/datasets/simplexsigil2/omnifall
- BlazePose+ST-GCN: link.springer.com/article/10.1007/s11554-023-01377-6 · Pose fall(arXiv 2107.14633) · Skeleton joint dynamics(arXiv 2503.06938) · Lightweight pose fall(arXiv 2401.01587, 89.99%·29.7FPS) · CPU pose fall(arXiv 2503.19501, 20프레임 버퍼)
- 2단계 근거: Cutup and Detect(arXiv 2401.16280, HQFSD F1 0.96) · Privacy-Preserving Multi-Stage(arXiv 2507.10474) · SmartHome-Bench(arXiv 2506.12992, Claude-3.5 TRLC 79.05%) · Next-gen pose+transformer(2024, acc 98.0%/F1 90.91%) · ElderFallGuard(arXiv 2505.11845)
- 배포: MediaPipe Pose(ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js) · tfjs pose-detection(github.com/tensorflow/tfjs-models) · transformers.js(huggingface.co/docs/transformers.js) · onnxruntime-web(onnxruntime.ai/docs/tutorials/web) · Claude Vision(platform.claude.com/docs/en/build-with-claude/vision)

## 미확인·주의

- **Luigi/Video-Human-Fall-Detection-with-CLIP** (zero-shot CLIP 낙상 데모) — HF Space API 401, 세부 접근 불가 → **※ 실재 미확인**(존재만 검색 확인). CLIP zero-shot 아이디어는 유효하나 이 특정 데모는 의존 금지.
- **researchgate "YOLOv11-Pose + compact transformer"** 논문 수치 → **※ 실재/수치 미검증**(참고 아이디어로만).
- Xenova/yolov8n-pose는 **AGPL-3.0** → 상용 배포 시 라이선스 주의.
- yadvender12·zohaibshahid 낙상 모델은 **지표 미공개·단일 기여자** → 프로덕션 신뢰 불가, 반드시 omnifall/자체 검증셋으로 성능 측정 후 채택.
- 의료 규칙: 실제 환자영상 금지(omnifall/DeZan/UR Fall 합성·공개 데이터만), VLM 응답은 진단 아님 디스클레이머 + 응급 시 119 최우선 노출.
