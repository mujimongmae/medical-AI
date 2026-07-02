# backend/ — 로컬 낙상 모델 서비스 (감지 파트)

홈캠 감지의 **시계열(동작) 인식 레이어**. arisu04/Medical_Fall_Detection 의
MultiScaleTCNAttn(PyTorch)를 FastAPI로 감싼 로컬 서비스. 입력이 MediaPipe 33
keypoint(x,y,visibility) 시퀀스라 우리 프론트 포즈와 **좌표변환 0**.

> ⚠️ 이건 "감지 모델 서비스"이고, 앱/이벤트 라우팅 서버(환자·주변인 앱)는
> 팀원 담당. 이벤트 전송 포맷은 팀원 확정 후 프론트에서 맞춘다.

## 실행
```bash
cd collapse-detection/backend
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install torch fastapi "uvicorn[standard]" numpy
python server.py            # http://127.0.0.1:8000
```

## API
- `GET /health` → `{ ready, device }`
- `POST /fall` body `{ frames: number[T][33][3|4] }` (프레임당 33관절 × [x,y,z,visibility] 또는 [x,y,vis])
  → `{ ready, fallProbability, sustained, framesAnalyzed, reason }`
  - `fallProbability`: 윈도우 내 프레임별 낙상확률의 피크(멀티스케일 64/128/256)
  - `sustained`: 임계(0.5) 초과 프레임이 3개 이상 연속

## 검증(더미)
정지 시퀀스 peak≈0.28 vs 낙하 흉내 peak≈0.51 — 모델이 구별함.
