# 쓰러짐 행태→의학적 응급 판별 가능성 — 의료 CV·Physical AI 문헌

> 경량 리서치(8 에이전트) · 핵심 논문 URL 직접 검증 · 2026-07-02
> 질문: 홈캠(RGB)으로 쓰러지는 행태+맥락만으로 의학적 응급(느린 붕괴 포함)을 어디까지 판별 가능한가

## Executive Summary

- **되는 것은 "움직임이 큰 의학적 사건"뿐이다.** 경련성 발작(tonic-clonic)은 RGB 영상만으로 임상급 검출(민감도 95~100%, 오탐 <0.1/h)이 확립돼 있다. 반대로 **움직임이 미묘하거나 없는 붕괴(실신·심정지·비경련성 발작)는 영상 단독으로 원리적 상한에 부딪힌다.**
- 낙상 "검출"(fall/ADL 이진)은 성숙(정확도 94~98%)했지만, **"왜 쓰러졌나(의학적 vs 사고성)" 원인 분류는 문헌상 미개척 영역**이다. 대규모 원인-라벨 영상 데이터가 사실상 없다.
- 우리 팀의 질문 — "급격 전이만 보던 걸 느린 의학적 붕괴까지 확장" — 은 **문헌이 가장 어렵다고 지목하는 바로 그 케이스(soft fall)** 다. 순수 영상 kinematics로는 자발적 눕기와 구별 불가에 수렴한다.
- 돌파구는 영상 단독이 아니라 **맥락 prior(병력·장소·시간·개인 baseline) + 보조 모달(오디오 agonal breathing, rPPG) 융합**에 있으며, 이 방향은 학술 선례가 탄탄하다.
- 냉정한 결론: **"원인을 진단"하지 말고, "붕괴 후 무반응·무동작 지속 + 생체신호 이상"으로 에스컬레이션**하는 설계가 근거에 부합한다.

## 되는 것 — 근거 강한 영역

**경련성 발작(seizure)의 영상 검출은 임상 검증 단계다.** 이것이 "행태만으로 의학적 이벤트를 잡은" 가장 강한 성공 사례.

- **Nelli**(근적외선 스테레오+오디오, 실거주/EMU 임상): tonic-clonic 민감도 95.2~100%, 오탐 0.09~0.16/h. 단 minor motor 발작은 8.3%로 급락 — 성능이 **운동성 크기에 정확히 비례**. [S1][S2]
- **VSViG**(skeleton 시공간 ViG, ECCV 2024): 정확도 ≈94%, 임상 발병 13.1s 전 조기감지, 1.4M 파라미터 경량 실시간. [S3] *(검증: confirmed)*
- **Frontiers Neuroinformatics 2024**(video-EEG gold standard): 주요 운동성 발작 88% 민감도, FDR <7/h. [S2]
- **IEEE JBHI 2021**(CNN+LSTM, 37명 76발작): 민감도 88%/특이도 92%. **Epilepsia 2018**(요양환경 야간): >70% 민감도, <7 FA/h. [S4][S5]

**낙상 "검출"(이진)도 성숙.** pose+Transformer 정확도 98%(엣지 구동), TD-CNN-LSTM 98%, 복잡 가정환경 RGB 94.5%. [S6][S7][S8] — 다만 전부 "fall/non-fall"에 머물고 **원인 판별은 범위 밖**이다.

## 회색지대 — 되지만 취약

**실신의 운동학적 시그니처는 이론적으로 존재하나, 영상 임상 검증은 없다.** 실신은 자세긴장(postural tone) 소실로 인한 무방어 축 붕괴 — 자발적 눕기(근긴장 유지, 통제된 하강)와 물리적으로 다르다. [S9] 낙상 문헌은 "trunk 수직 속도·하강 궤적"을 구별 피처로 반복 인용. [S10] 실증적 뒷받침:

- **실제 노인 낙상 26건 영상 분석**: 결정적 국면 평균 1,946ms(모두 >500ms) — 순간 사건이 아니라 시간 전개가 있음. 방어반응(스텝 69%, 붙잡기 31%) 관찰. "천천히 무너지는" 낙상 3건은 물체를 붙잡는 균형회복 시도였음. → **방어반응 유무가 관찰 가능한 행태 신호**가 될 수 있다는 실증 단서(단, 이 논문은 실신 분류를 직접 하지 않음). [S11]
- **DETECT-2**(손목 가속도, 2026): sudden fall 민감도 100%, **soft fall 88.1%로 하락**. RGB pose에도 동일 원리(급강하 vs 완만 하강). 웨어러블 기반이라 영상 직접 증거 아님. [S12] *(검증: confirmed)*

**낙상 원인 분류는 프로토타입/개념 수준.** IEEE DataPort multiclass 데이터셋이 Medical Fall(dizziness/fainting)을 명시 라벨링하나 **총 128 영상·연출·벤치마크 미보고**. [S13] IMU pre-impact 원인 분류(slip/trip/fainting)는 87.9%지만 웨어러블·젊은 연출 피험자. [S14]

**멀티모달 심각도 보강은 유망하나 붕괴 순간에 취약.**
- **rPPG**(얼굴 RGB→심박·호흡·SpO2): 정지·근거리 MAE 낮음, 호흡수 원격측정 병원 검증. 하지만 **저조도·움직임·피부톤에 취약, 쓰러지는 격한 모션에서 신뢰도 급락**, 임상 검증 상용 시스템 부재. [S15][S16][S17]
- **오디오 agonal breathing**(npj Digital Medicine 2019): 심정지 검출 AUC 0.9993, 6m서 민감도 97%, 오탐 0.14%. **가장 강한 비접촉 보조 신호.** [S18] *(검증: confirmed)*
- 후기융합(IMU+vision) F1 97.3%, 오탐 3.6%로 억제. [S19]

## 안 되는 것 — 문헌이 뒷받침 못 하는 주장

- **"느린 실신 vs 낮잠/자발적 눕기를 순수 영상으로 구별한다"** — 미뒷받침. 다수 리뷰가 "낙상 vs 의도적 눕기 구별은 미해결"이라 명시. inactivity 기반 규칙은 요가·바닥휴식을 오탐하고 느린 붕괴를 미탐. [S20][S21]
- **"soft fall(완만한 주저앉음)을 표준 낙상검출로 잡는다"** — 오히려 가장 놓치기 쉬운 구조적 난제. 뇌졸중·심정지형 붕괴는 충격·급강하가 약해 오탐 억제용으로 튜닝된 검출기가 "비낙상"으로 흘림. [S22]
- **"영상으로 붕괴의 원인(혈압 급락)을 관측한다"** — 불가. 영상은 실신의 결과(운동학)만 보고 원인(뇌관류·혈압)을 못 봄. [S23]
- **"영상 라벨로 의학적 vs 사고성을 임상 정확도로 분류한다"** — ICU 후향 코호트: **사람 의사조차 syncopal vs mechanical 구분이 "본질적으로 주관적"**, 부정맥 비율 45.5% vs 50.8%로 거의 동일 → 라벨 자체가 노이즈. gold-standard의 천장이 낮다. [S24]
- **"무운동성 붕패를 발작 검출기로 잡는다"** — 모든 seizure CV가 운동 신호에 의존 → 조용한 실신·비경련성 발작은 사각지대. [S25]

## Physical AI·비디오 파운데이션 모델 프론티어

- **Video-LLM/VLM**(Grounded-VideoLLM, VAD-LLM 계열): zero-shot 이상행동 서술 + temporal grounding으로 "왜 이 쓰러짐이 위험한가(방어반응 없음, 무반응 지속)"를 맥락 서술할 잠재력. **그러나 의료 응급 판별 전용 임상검증 없음**, 시간정밀도·환각·저조도·실시간성 미해결. [S26] **※ 특정 "의료 응급 판별 VLM" 논문은 실재 미확인(낮은 신뢰).**
- **비접촉 카메라 발작 예측**(cross-species transfer, arXiv 2603.12887): rodent 영상 사전학습으로 3~10초 영상만으로 발작 전조 예측 >70%. 초기 개념. [S27] *(검증: confirmed)*
- **Cross-Joint Attention**(arXiv 2603.23757): 교차 피험자 일반화를 정면으로 다룸 — 자발/비자발 운동 구별이 개인차·유형차로 본질적으로 어렵다는 점도 명시. [S28] *(검증: confirmed)*
- **EgoEMS**(AAAI 2026): 응급 이벤트 인식용 멀티모달 데이터 인프라(1인칭). 주석 스키마 참조 선례. [S29]

## 병력/맥락 prior 융합의 학술 선례

"사전확률·맥락을 검출 문턱에 반영한다"는 발상은 근거가 탄탄하다.

- **EHR XGBoost 낙상 위험 예측**(Age and Ageing 2025, 114만명): AUROC 0.979(내부)/0.939(외부). 개인 병력을 위험 prior로 쓰는 강력한 실증. [S30] *(검증: confirmed)*
- **Dynamic Bayesian Networks 맥락인지 낙상위험**: 활동별 posterior probability 산출, 생리데이터 병합 확장 명시. [S31]
- **멀티모달 EHR 융합 리뷰**(Information Fusion 2025): 단일모달 대비 진단정확도 +3~48.9%. [S32]
- **UP-Fall**(RGB+IMU+EEG): 융합 모델이 단일모달 초과 성능 실증(단 18~24세 연출). [S33]
- **스마트홈 ADL baseline 이탈 탐지**: 자발적 눕기(정상 루틴)와 비정상 붕괴를 "개인 baseline 대비 이탈"로 구별하는 접근. [S34]

## 우리 설계에 대한 냉정한 권고

**유지할 것 (근거 강함):**
1. **급격 전이(sudden collapse) 기반은 그대로 유지.** DETECT-2가 sudden fall 100%로 확인 — 우리의 기존 강점이 문헌과 일치. 이걸 약화시키지 말 것.

**추가해도 되는 것 (근거 있음, 취약점 명시하며):**
2. **"soft fall 모드": 완전한 낙상 특징이 아니어도 일부만 만족하면 트리거**하고, **붕괴 후 무동작·무반응 지속(수 초~수십 초)** 을 확인 신호로 사용. 실제 낙상 26건이 500ms 이상 전개된다는 근거와 부합. [S11][S22]
3. **맥락 prior 융합**: 장소(침대/소파면 눕기 확률↑), 시간대, 개인 baseline 이탈, (있으면) 병력. 이벤트 점수에 prior를 곱하는 personalized 문턱. [S30][S31]
4. **오디오 융합이 비용 대비 최강 보강**: 마이크로 agonal breathing 검출 → "쓰러진 뒤 정상 호흡 vs 심정지 헐떡임" 구별. 홈캠 데모에 현실적. [S18]
5. **rPPG는 "실험적 보조"로만**: 붕괴 직후 얼굴이 잡히면 심박/호흡 이상 추정. **모션·조도 취약을 반드시 디스클레임**하고 핵심 판정 로직으로 쓰지 말 것. [S15][S17]

**하지 말 것 (근거 없음/법적 리스크):**
6. **"실신 vs 낮잠을 영상으로 구별한다"고 주장 금지** — 문헌 미뒷받침, 데모에서 반증되기 쉬움. [S20]
7. **"의학적 원인을 자동 진단/분류"한다고 주장 금지** — 임상 gold-standard조차 주관적. [S24] 항상 "참고용, 의학적 진단 아님" 디스클레이머 + 응급 시 119 안내 최우선.
8. **포지셔닝: "왜 쓰러졌는지 진단"이 아니라 "위험한 붕괴 패턴을 감지해 에스컬레이션"** — 무반응 지속 + 보조신호 이상을 트리거로. 이것이 근거가 허용하는 정직한 범위.

## 출처 목록

- [S1] Nelli 야간 발작(Seizure/E&B 2022): https://www.sciencedirect.com/science/article/pii/S1525505022002530
- [S2] AI 영상 발작 검출(Frontiers Neuroinformatics 2024): https://www.frontiersin.org/journals/neuroinformatics/articles/10.3389/fninf.2024.1324981/full
- [S3] VSViG(ECCV 2024, arXiv 2311.14775): https://arxiv.org/abs/2311.14775
- [S4] Video GTCS 검출 CNN+LSTM(IEEE JBHI 2021): https://pubmed.ncbi.nlm.nih.gov/33406048/
- [S5] 야간 경련 발작 요양환경(Epilepsia 2018): https://pubmed.ncbi.nlm.nih.gov/29638008/
- [S6] Pose+Transformer 낙상검출(Health Systems 2024): https://www.tandfonline.com/doi/full/10.1080/20476965.2024.2395574
- [S7] Pose 기반 낙상 DNN(Sensors/MDPI 2022): https://www.mdpi.com/1424-8220/22/12/4544
- [S8] 가정환경 RGB 낙상(Interdisciplinary Nursing Research 2022): https://journals.lww.com/inr/fulltext/2022/11000/an_rgb_camera_based_fall_detection_algorithm_in.4.aspx
- [S9] Syncope 임상 정의(StatPearls/NCBI): https://www.ncbi.nlm.nih.gov/books/NBK442006/
- [S10] Syncope 운동학 시그니처(PMC7805655): https://pmc.ncbi.nlm.nih.gov/articles/PMC7805655/
- [S11] 노인 실제 낙상 26건 영상 분석(PMC3850536): https://pmc.ncbi.nlm.nih.gov/articles/PMC3850536/
- [S12] DETECT-2(EHJ Digital Health 2026, ztag043): https://academic.oup.com/ehjdh/article/7/3/ztag043/8510637
- [S13] Fall Detection Multiclass 데이터셋(IEEE DataPort 2025): https://ieee-dataport.org/documents/fall-detection-dataset-multiclass-classification
- [S14] Pre-impact 낙상원인 분류(Sensors/PMC 2022): https://pmc.ncbi.nlm.nih.gov/articles/PMC8989476/
- [S15] rPPG SOTA 리뷰(PMC12297079): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12297079/
- [S16] rPPG 원격 호흡수(PMC9267568, 2022): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9267568/
- [S17] rPPG SOTA 리뷰(medRxiv 2023, 상용검증 부재): https://www.medrxiv.org/content/10.1101/2023.10.12.23296882v1.full
- [S18] 비접촉 심정지/agonal breathing(npj Digital Medicine 2019): https://www.nature.com/articles/s41746-019-0128-7
- [S19] Bimodal late fusion 낙상(PMC12526565, 2025): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12526565/
- [S20] 고령 CV 낙상검출 체계적 리뷰(Applied Intelligence 2024, arXiv 2401.11790): https://arxiv.org/pdf/2401.11790
- [S21] Vision 낙상검출 리뷰(arXiv 2207.10952): https://arxiv.org/pdf/2207.10952
- [S22] Soft fall 미탐 문제(USPTO 9489815): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9489815
- [S23] Active-stand 실신 ML(medRxiv 2020): https://www.medrxiv.org/content/10.1101/2020.12.07.20245159.full.pdf
- [S24] 지면낙상 syncopal vs mechanical 예측력(PMC12357759, 2025): https://pmc.ncbi.nlm.nih.gov/articles/PMC12357759/
- [S25] 발작 영상분석 리뷰(Epilepsy & Behavior 2024, arXiv 2312.10930): https://arxiv.org/abs/2312.10930
- [S26] Grounded-VideoLLM(arXiv 2410.03290): https://arxiv.org/pdf/2410.03290
- [S27] 카메라 발작 예측 cross-species(arXiv 2603.12887): https://arxiv.org/abs/2603.12887
- [S28] Cross-Joint Attention 발작 검출(arXiv 2603.23757): https://arxiv.org/pdf/2603.23757
- [S29] EgoEMS(AAAI 2026, arXiv 2511.09894): https://arxiv.org/abs/2511.09894
- [S30] EHR 낙상위험 XGBoost(Age and Ageing 2025, afaf285): https://academic.oup.com/ageing/article/54/10/afaf285/8280074
- [S31] Dynamic Bayesian 맥락인지 낙상위험(Sensors/MDPI 2014): https://www.mdpi.com/1424-8220/14/5/9330
- [S32] 멀티모달 EHR 융합 리뷰(Information Fusion 2025): https://www.sciencedirect.com/science/article/abs/pii/S1566253525000545
- [S33] UP-Fall 멀티모달 데이터셋(Sensors 2019): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6539235/
- [S34] 스마트홈 노인 이상행동 탐지(PMC12106144, 2025): https://pmc.ncbi.nlm.nih.gov/articles/PMC12106144/
- (보강) PPG-HRV vasovagal 예측(EHJ Digital Health 2026, ztag053, AUROC 0.91): https://academic.oup.com/ehjdh/article/7/4/ztag053/8586837 *(검증: confirmed)*
- (보강) 멀티모달 발작 검출/예측 전망 리뷰(arXiv 2601.05095, 2026): https://arxiv.org/html/2601.05095v1 *(검증: confirmed)*

## 미확인·주의

- **ACM TALLIP 2024 "cause-aware fall classification"** — cause-aware 영상 낙상 분류를 정면으로 다루는 소수 사례지만 **페이월로 성능 수치(정확도/민감도) 실재 미확인**. 근거로 인용 시 성능 주장 금지. https://dl.acm.org/doi/10.1145/3687125 **※ 성능 실재 미확인.**
- **"의료 응급 판별 전용 VLM"** — Physical AI 흐름은 실재하나, 홈캠 의료 응급 판별에 임상검증된 VLM 논문은 **확인 못함. ※ 실재 미확인(낮은 신뢰).**
- **Fall-type pose-angle 시그니처(trip/slip/faint)** — 주로 특허(USPTO 10629048)·개념 수준, 정량 벤치마크 제한적. 검증된 임상 성능 아님.
- **EPIDetect / Cell Reports Methods 발작 검출** — 동물모델(전임상). 사람 홈캠 이식 미검증 — 방법론 타당성 근거로만.
- **공통 한계**: 위 영상 발작 검출 성능 대부분은 통제된 EMU/병실·소규모·환자별 튜닝 기반 → **가정(홈캠) 환경 일반화는 문헌 전반에서 미해결.** 데모에서 "임상 성능"을 그대로 주장하지 말 것.
