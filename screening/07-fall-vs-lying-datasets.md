# 낙상 vs 눕기 구별 + 심정지 감지 — 데이터셋·논문 리서치

> 경량 리서치 (에이전트 8개) · 핵심 데이터셋·논문 URL 직접 검증 · 2026-07-02
> 목적: "질병으로 쓰러짐"을 "자발적 눕기(침대/바닥)"와 구별하고 심정지 징후까지 잡는 파이프라인의 학술 근거

## 낙상 vs 눕기 구별 + 심정지 감지 — 학술 근거 정리

## Executive Summary (눕기-구별 핵심 통찰 3줄)
1. **누운 "정적 상태"만으로는 자발적 눕기와 낙상이 구별 불가** — 최종 자세(수평 몸통·낮은 무게중심)가 동일하기 때문. 반드시 **전이 동역학(하강 속도·급격성) + 낙상 후 무동작 지속 + 위치(바닥 vs 침대)** 를 함께 봐야 한다(OmniFall·URFD·PMC8321307 공통 근거).
2. 라벨 설계의 정답은 **transient action(fall / lie_down)과 static state(fallen / lying)를 분리**하는 것 — OmniFall(2025)이 이 구도를 표준화했고, 자발적 눕기를 명시적 confounder로 다룬다. 낙상 순간을 놓쳐도 'fallen' 상태로 사후 탐지 가능.
3. **심정지는 영상 단독으로 확정 불가** → 쓰러짐(영상) + 지속 부동 + agonal breathing(오디오, npj 2019 검증) / 호흡·심박 이상(rPPG)의 **다신호 융합**이 응급도 판정의 근거. 자발적 수면·눕기와의 결정적 차이는 "이후 완전 무동작 + 이상 호흡".

## 공개 데이터셋

| 이름 | modality | 규모 | 눕기 클래스 유무 | URL | 검증 |
|---|---|---|---|---|---|
| **URFD** | RGB+depth(Kinect 2뷰)+가속도계 | 70 seq(30 fall/40 ADL), 5명 (2014) | 프레임 라벨 -1(not lying)/1(lying on ground) 제공 ✅ / 'bed 눕기' ADL 클래스는 페이지 미명시 | fenix.ur.edu.pl/~mkepski/ds/uf.html | ✅ confirmed (CC BY-NC-SA) |
| **UP-Fall** | RGB(2)+IR(6)+IMU(5)+EEG+환경 | 17명×11활동(5낙상/6ADL)×3 (2019) | 'laying' 별도 클래스(논문 통설, 발췌 직접확인 X) | sites.google.com/up.edu.mx/har-up | ✅ confirmed |
| **NTU RGB+D 120** | RGB+depth+IR+3D skeleton(25 joints) | 106명, 120클래스, 114,480 clip (2019) | A43 falling / A42 staggering / sit·stand 별개 클래스 ✅ | github.com/shahroudy/NTURGB-D | ✅ confirmed |
| **OmniFall** | RGB(staged+synthetic+wild), frame-level | ~80h/15k videos, 16-class, 3 도메인 (2025) | **transient(lie_down) vs static(lying) vs fall/fallen 분리 — 본 과제에 최적** | arxiv.org/abs/2505.19889 | ✅ confirmed |
| **Le2i (FDD)** | 단일 RGB(640×480, 25fps) | 143 fall+79 ADL, 9명, 4환경 (2013) | sitting 有, 명시적 눕기 약함 | 원링크 사망 → Kaggle 미러 필요 | ⚠ 데이터셋 실재/URL 죽음 |
| MCFD / MultiCam | RGB 8뷰 동기 | 24 시나리오(22 falls)×8캠 (2010) | 눕기 ADL 제한적, 매트리스 낙상=하드네거티브 | iro.umontreal.ca/~labimage/Dataset/ | ※ 실재 미확인 |
| CAUCAFall | RGB+bbox, per-image label | 10명, 5낙상+5ADL (2022) | 명시적 lying 없음(sitting/kneeling 근접) | data.mendeley.com/datasets/7w7fccy7ky/4 | ※ 실재 미확인 |
| FallAllD | wearable(acc/gyro/mag/**barometer**) | 15명, 26,420 files (2020) | 영상 아님; 기압계 고도변화가 눕기/낙상 보조신호 | ieee-dataport.org/open-access/fallalld… | ※ 실재 미확인 |
| TST Fall v2 | RGB+depth+IMU | 낙상(front/back/side)+ADL(sit/lying/grasp/walk) | lying down이 ADL로 분리 | (URFD와 병기 언급) | ※ 실재 미확인 |

## 낙상 vs 눕기 구별 — 핵심 기법
- **사전충격·수직속도 임계 (Bourke 계열, PMC4101685 ※ 실재 미확인)**: 몸통 수직속도 **−1.3 m/s** 임계 시 낙상 vs ADL 100% 분리, 트렁크 충격 평균 323ms 사전 감지. 리드타임 배후 474±38 / 전방 590±123 / 측방 527±62 ms. 단 "최소 낙상속도 < 최대 ADL속도" 겹침으로 **속도 단독 100% 분리는 불가 → 다신호 융합 필요**. 웨어러블 지표지만 영상에선 **관절 수직속도/자세각**으로 이식 가능.
- **자세 + 지면영역 + 무동작 지속 (PMC8321307)**: lie/bend 자세 + 지면영역(ground region) 내부 + 이후 무동작 지속을 모두 만족할 때만 낙상 판정 → 침대/소파 자발적 눕기 필터. ※ 리스트의 "30초 규칙·90.9%"는 **오기**. 실제는 **정확도 97.29%**, 급격 전이(**약 25프레임/~1초**) + 무동작 지속 + 지면영역 **85%** 임계.
- **시간 동역학 (temporal rate)**: 낙상=좁은 시간창 내 관절좌표 급변, 자발적 눕기=완만·제어된 전이. LSTM/TCN/Transformer가 이 차이를 학습(Sensors 2022 ~92%, TCN+Transformer 2025 ※ 실재 미확인).
- **다신호 결합으로 오탐 감소 (GBDT+스켈레톤, PMC7334783 ※ 실재 미확인)**: "빠르게 앉기/눕기"가 false positive 주범 → 자세센서+스켈레톤 결합으로 완화.

## 포즈 기반 SOTA — MoveNet 구현용 feature·임계·모델
- **기하 휴리스틱 4종(딥러닝 없이 베이스라인/앙상블)**: (1) bbox 종횡비 w/h>1(누움·낙상 공통), (2) 몸통 각도(어깨–엉덩이 벡터의 수평 여부), (3) **무게중심 하강 속도**(눕기 완만/낙상 급속 — 결정 변수), (4) 머리 keypoint 이동거리. **결정 규칙: 종횡비·각도만으론 구별 불가 → "급속 하강 + 이후 지면 무동작 지속"을 AND 조건으로.**
- **Ambianic (오픈소스, MoveNet 17 keypoints ※ 실재 미확인)**: 낙상 전/후 프레임의 **척추(spine) 벡터 각도 변화 속도**로 수직→수평 급전환 판정. 각도변화 '속도' + 지속시간 게이팅으로 자발적 눕기 오탐 억제. MoveNet이 저자세/가림에서 PoseNet보다 keypoint 안정. GitHub 코드 공개 → 임계·후처리 이식 가능.
- **백본 후보**: OpenPose+LSTM/GRU ~98.2%(MDPI Appl.Sci. 2021), 12-class pose 분류(Sensors 22(12):4544, 자발적 눕기/앉기를 낙상과 분리 라벨 — 우리 라벨 스킴 참고), 3-stream ST-GCN(Sci.Rep. 2025), NTU 사전학습→URFD 전이. **엣지 실시간엔 pose→1D-CNN/LSTM이 표준, 서버 2차검증엔 ST-GCN.** (딥러닝 성능치는 ※ 실재 미확인)
- ⚠ **제외**: arXiv:2503.19501 "Pose-Based Fall Detection on Standard CPUs" — **arXiv 철회(withdrawn, 'Misleading Results')**. 근거로 사용 금지.

## 영상 활력징후 (호흡·rPPG) 데이터셋·방법
rPPG(얼굴 피부색 미세변화로 심박/호흡 비접촉 추정)는 **눕기/낙상 구별용이 아니라** 부동 이후 "심정지 의심(신호 소실)" 판정 레이어. 부동 상태는 모션 아티팩트가 적어 오히려 유리하나 **저조도·압축·피부톤**에 취약. (아래 rPPG 항목 전부 ※ 실재 미확인 — 검증 대상 아님)

| 데이터셋 | modality | 규모 | 용도 |
|---|---|---|---|
| UBFC-rPPG | RGB webcam + 접촉 PPG | 42명 (2017) | 정지 얼굴 심박 기준선 |
| PURE | RGB(무압축)+60Hz PPG | 10명·6 움직임 시나리오 (2014) | 움직임 강건성 |
| VIPL-HR | 다기기 RGB+NIR, PPG/SpO2 | 107명·9조건 (2018) | 비통제 실환경 일반화 |
| MMPD | 모바일 RGB + PPG | 33명, ~11h (2023) | 피부톤·조명 교차 |
| COHFACE | RGB + PPG·**호흡벨트** | 40명 (2017) | 압축 아티팩트·호흡 정답 |

- **rPPG 딥러닝 벤치마크(rPPG-Toolbox ※ 실재 미확인)**: UBFC intra MAE PhysNet 2.33 / TS-CAN 2.29 / DeepPhys 3.71 bpm, PhysMamba UBFC 0.45·PURE 0.24. **크로스도메인 MAE 4.5–8+ bpm로 급락** → 홈캠 적용 시 신호 신뢰도 게이팅 필수.
- **호흡수 추정(다부위 optical-flow, PLOS One 2025 ※ 실재 미확인)**: MAE 0.61–0.95 BPM. 쓰러진 사람의 **가슴 호흡 움직임 지속 여부**로 호흡정지 vs 정상 눕기 구별. 야간 IR/depth 호흡 모니터(T-BME 2014 81.4%, PMC6856090 OSA 민감도90%/특이도71.4% ※ 실재 미확인)로 침실 baseline 확보 가능.

## 심정지·agonal breathing 원격 감지 — 근거와 한계
- **핵심 근거 (Chan et al., npj Digital Medicine 2019 — ✅ confirmed, 전 수치 정확 일치)**: 실제 911 통화 오디오로 학습, 스마트스피커/폰이 임종호흡(agonal breathing) 검출. **AUC 0.9993, 민감도 97.24%, 특이도 99.51%, 오탐 0~0.22%, 최대 6m.** 심정지 약 50%에서 agonal breathing 발생, 최다 발생지가 침실 → 무목격 야간 원격감지 가치. 홈캠 **오디오 채널**의 정당화.
- **한계**: 코골이·수면무호흡 등 야간 호흡음과 혼동, 6m 초과·소음 환경 저하. 영상(부동)만으론 심정지 확정 불가 → 오디오·rPPG 보완 필요.
- **영상 관찰 근거 (Resuscitation 2025, OHCA caught on camera ※ 실재 미확인)**: 원외심정지의 시각 시퀀스 = 전조 감속 → 직립→앙와/복와/측와위 **급격 비제어 전환** → 이후 완전 무동작 + 간헐 agonal/이상운동. 자발적 눕기(느린 제어 전이 + 정상 미세움직임)와 대비되는 CV 감지 특징 제시. (정성 분석, 정량 성능 아님)
- **응급 이벤트 확장 — 경련(seizure)**: VSViG(arXiv 2311.14775 ※ 실재 미확인) 스켈레톤 spatiotemporal ViG, 민감도 100%(33/33)·오탐 0%·1.4M 파라미터(엣지 적합). 경련=리드미컬 반복 사지운동 시그니처로 눕기와 구별.

## 재가/프라이버시 실증
- **포즈-온리(비영상화)** 가 프라이버시 표준: RGB→스켈레톤 추상화 후 알림만 전송. Health Systems 2024(pose+transformer, Raspberry Pi급): 실환경 **민감도 95.24%·특이도 89.80%·F1 90.91%** (※ 실재 미확인). RGB2Depth 비지도 도메인적응(arXiv 2308.12049 ※ 실재 미확인)으로 depth-only 배포. SSHFD(occlusion 강건, arXiv 2004.00797 ※ 실재 미확인).
- **상용 사례 (전부 ※ 실재 미확인 — 벤더 주장, 독립검증 부족)**: SafelyYou Guardian(치매요양, JMIR 2021 '바닥 방치시간' 감소), Kepler Night Nurse(오탐 저감 정면 대응, 벤더주장 ~98%), AltumView Sentinare(stick-figure 온디바이스), 국내 클레버러스(엣지 어안렌즈). **정책 배경**: 2023 노인복지법 개정 요양시설 CCTV 의무화, 정부 2027까지 '지능형(쓰러짐 자동감지)' 관제 전환 → 국내 수요 형성.

## 우리 파이프라인 설계 시사점 (채택안)
- **라벨 스킴은 OmniFall식 이분화 채택**: transient(fall / lie_down) + static(fallen / lying / sitting / standing). 자발적 눕기를 명시적 confounder 클래스로.
- **판정 = 자세(state) AND 전이속도(transition) AND 낙상후 무동작 지속 AND 위치(바닥 vs 침대)** — 단일 조건 금지(PMC8321307·Bourke 근거).
- **MoveNet feature 4종**(종횡비·몸통각·무게중심 하강속도·척추각 변화속도) + 무동작 게이팅으로 규칙 베이스라인부터 구축, 이후 pose→LSTM/TCN 학습기 추가.
- **다신호 융합**: 영상=쓰러짐/부동, 오디오=agonal breathing(npj 2019 검증), rPPG/optical-flow=호흡·심박 이상. 단 rPPG는 "심정지 의심(신호 소실)" 게이트로만, 낙상 구별엔 미사용.
- **검증 데이터 경로**: MoveNet 프로토타입 검증=URFD(소규모·프레임 라벨), 눕기 vs 낙상 학습=UP-Fall/NTU120, **일반화(staged→wild) 평가=OmniFall** (도메인 시프트로 실환경 급락 사실 반영).
- **프라이버시**: 포즈/스켈레톤만 전송·저장(원영상 미저장), 온디바이스 처리 지향 — 국내 요양시설 정책·상용선례와 정합.
- **응급도 레이어**: 낙상 후 부동 + (agonal 오디오 or 호흡정지) → 119/응급실 최우선 안내 + 디스클레이머 필수.

## 출처 목록
- URFD — fenix.ur.edu.pl/~mkepski/ds/uf.html (✅)
- UP-Fall — sites.google.com/up.edu.mx/har-up/ (✅)
- NTU RGB+D 120 — github.com/shahroudy/NTURGB-D (✅)
- OmniFall — arxiv.org/abs/2505.19889 (✅)
- Fall Detection Posture-Recognition — pmc.ncbi.nlm.nih.gov/articles/PMC8321307/ (⚠ 수치 정정 필요: 97.29%)
- npj Digital Medicine 2019 (agonal breathing) — nature.com/articles/s41746-019-0128-7 (✅) / UW 프로토타입 washington.edu/news/2019/06/19/…
- Le2i FDD — 원링크 사망, Kaggle 미러 (⚠)
- Bourke pre-impact — pmc.ncbi.nlm.nih.gov/articles/PMC4101685/
- Ambianic — github.com/ambianic/fall-detection
- Pose+LSTM/GRU — mdpi.com/2076-3417/11/1/329 · Sensors 22(12):4544 · pose+transformer tandfonline 2024
- OHCA on camera — sciencedirect.com/…/S0300957225009517 · rPPG-Toolbox github.com/ubicomplab/rPPG-Toolbox
- MCFD, CAUCAFall, FallAllD, TST, rPPG 데이터셋(UBFC/PURE/VIPL-HR/MMPD/COHFACE), VSViG, 상용시스템 URL은 수집 엔트리 참조

## 미확인·주의
- **⚠ 검증 대상이나 정정/보완 필요**: (1) PMC8321307 — 리스트의 "30초 규칙·90.9%"는 오기, 실제 **97.29% + ~1초 급격전이 + 지면영역 85% + 무동작 지속**. (2) URFD의 'lying down in bed' ADL 클래스, UP-Fall의 'laying' 명시 클래스 — 통설과 일치하나 페이지 발췌로 직접 확인 안 됨(원문 재확인 권장). (3) Le2i는 실재하는 유명 벤치마크지만 제공 URL(search-mahmoud.com)이 사망 → Kaggle 미러 사용.
- **❌ 제외(사용 금지)**: arXiv:2503.19501 — arXiv에서 'Misleading Results'로 **철회(withdrawn)**. 신뢰 불가.
- **※ 실재 미확인(독립 검증 안 됨, 표기 항목)**: MCFD/MultiCam, CAUCAFall, FallAllD, TST, 모든 rPPG 데이터셋·툴박스·호흡추정 논문, Resuscitation 2025, VSViG·seizure 논문, Bourke(PMC4101685), GBDT(PMC7334783), Sensors/TCN-Transformer 등 딥러닝 성능치, 그리고 **상용 시스템 전부(SafelyYou·Kepler·AltumView·클레버러스)** — 벤더 주장 성능은 신뢰도 낮게 취급.
