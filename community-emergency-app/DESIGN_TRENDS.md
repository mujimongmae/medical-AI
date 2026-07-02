# 디자인 트렌드 브리프 — 마을 공동체 응급대응 앱

> **대상**: 강원 농촌 독거노인(환자) + 이웃 / **기기**: Galaxy S25+ (Android, One UI) APK, Capacitor 웹뷰 / **스택**: React + Tailwind
> **핵심 제약**: 고령자 · 응급 상황 → 큰 글씨 · 고대비 · 큰 터치타깃 · 한 손 조작 · 단일 명확 액션 · 최소 인지부하
> 최신(2024–2025) 모바일 UI/UX 트렌드를 **우리 화면(환자/이웃)에 바로 적용 가능한 do**로 정리. 근거 출처는 문서 끝 목록.

## 지금 우리 토큰 스냅샷 (기준선)

| 항목 | 현재 값 | 트렌드 대비 평가 |
|---|---|---|
| 본문 폰트 | `base` 18px / `lg` 22px / `xl` 28px / `2xl` 36px | ✅ 고령 기준 충족 (본문 16px 이상 권고) |
| 버튼 최소 높이 | `min-h-[56px]` | ✅ 48dp 초과. 단 **주요 CTA는 64dp+** 로 상향 여지 |
| 시맨틱 색 | `danger #d81e06` / `safe #0a7d2c` | ✅ 둘 다 흰 배경 대비 **AA 통과** (danger ~5.1:1, safe ~5.3:1) |
| 라운딩 | `rounded-lg/xl/2xl` 혼용 | △ Material 3 Expressive 대세는 **더 크고 일관된 라운딩** |
| 모션 | CPR 압박 애니 + `prefers-reduced-motion` 대응 | ✅ 접근성 모범. 카운트다운 등에 **긴박감 모션** 추가 여지 |
| 포커스 | `ring-4 ring-blue-500/60` | ✅ 고대비 포커스 링 양호 |

---

## 1. 2025 모바일 UI 트렌드 — Material 3 Expressive / Material You

**핵심 원칙**
- **Material 3 Expressive**(2025 안정화, Android/One UI 기본 방향): 더 크고 굵은 타이포, **크고 둥근 컴포넌트**(라운딩 5단계 XS→XL, 셰이프 35종), **스프링(springy) 모션**, 강조 버튼(emphasized/large button)으로 "지금 눌러야 할 것"을 시각적으로 최상위에 배치.
- **타이포 위계 강화**: 헤드라인·핵심 액션은 더 큰 사이즈 + 더 무거운 weight로 "한눈에 튀게".
- **Dynamic Color(Material You)**: 시스템 테마 색을 앱에 반영 — 단, **응급 앱에는 부분 적용**이 정답.

**우리 앱 적용 (구체 do)**
- 라운딩 토큰 통일: 카드 `rounded-2xl`(16px), 히어로/알림 패널 `rounded-3xl`(24px), 카운트다운 링 `rounded-full`. 지금의 `lg/xl` 혼용을 **2xl 기본**으로 수렴.
- 주요 CTA는 **emphasized 스타일**: 채워진 배경 + `text-2xl`(28px) + `font-extrabold` + 큰 패딩(`py-6~8`). (환자 해제 버튼·이웃 "도착했습니다"·"AI 추천 받기"가 이미 이 방향 — 라운딩만 `rounded-2xl→3xl`로 키우면 톤 일치)
- **Dynamic Color 경계**: `danger`(빨강)·`safe`(초록)는 **시맨틱 고정색**으로 절대 동적 치환 금지. Material You는 중립 배경/보조 톤에만 제한 적용. (응급에서 색은 의미다)
- 버튼 press 피드백에 스프링 감각: `active:scale-95` + `transition` (이미 일부 적용) → 전 버튼 공통 규칙화.

---

## 2. 고령자 접근성 (Accessibility for elderly)

**핵심 원칙** (WCAG 2.2 + 노인 UI 연구)
- **본문 ≥16px**, 가능하면 **OS 글자 크기 설정 존중**(사용자가 키울 수 있게). 레이아웃은 확대 시 reflow.
- **터치타깃 ≥48×48dp**(Material), 아이콘이 24dp여도 **투명 패딩으로 48dp 확보**. WCAG 2.2 AA는 24px 최소지만 **고령자는 AAA(44px+)** 지향.
- **인접 타깃 간 간격 ≥8–16dp** — 운동기능 저하로 인한 오탭 방지.
- **대비**: 본문 4.5:1 / 큰 텍스트·UI 3:1 (AA). 고령자는 **7:1(AAA)** 권장.
- 음성/오디오 피드백, 오류 관용적(error-tolerant) 인터페이스가 노인 만족도↑.

**우리 앱 적용 (구체 do)**
- 폰트 스케일 그대로 유지(이미 우수). 추가로 **Capacitor 웹뷰에서 `font-size`를 px로 하드록하지 말 것** — `rem` 유지 + Android 접근성 "글자 크게" 설정이 먹히도록 뷰포트/메타 확인.
- 주요 CTA 최소 높이 상향: `min-h-[56px]` → **`min-h-[64px]` (히어로 CTA는 80px+)**. 응급/노인 맥락에선 클수록 안전.
- 버튼 사이 간격: 리스트형 선택지(트리아지 옵션)는 `gap-4`(16px) 유지, **CPR 같은 파괴적/치명적 선택지 주변만 `gap-5~6`(20–24px)** 로 벌려 오탭 방지.
- 소형 회색 텍스트(디스클레이머·라벨) 대비 점검: 현재 `text-gray-500`은 흰 배경 4.6:1(AA 통과)이나 **핵심 안내는 `gray-600/700`** 으로. 빨간 소형 본문은 지양(빨강은 큰/굵은 텍스트 전용).
- **아이콘+텍스트 이중 코딩**: 색만으로 상태 구분 금지(색약 고려). "정상 감시 중 ●" 처럼 아이콘+라벨 병기 유지·확대.

---

## 3. 응급/의료알림 앱 UX (Emergency / medical alert)

**핵심 원칙**
- **5초 규칙**: 당황한 사용자가 "다음 할 일"을 5초 안에 찾을 수 있어야. → **화면당 단일 주요 액션**.
- **Glanceability**: 최소 텍스트 + 큰 버튼 + 단순 시각 지표(빨강/점멸)로 치명 액션 강조.
- **패닉 감소**: 상황이 어떻게 진행되는지 **명확한 기대치·상태 업데이트** 제공 → 신뢰·안정.
- **색 코딩·타임라인·지도** 같은 즉시성 높은 시각요소. 미학보다 **실사용 스트레스 테스트** 우선.

**환자 화면 (AlertScreen — 초대형 버튼·카운트다운)**
- 유지: 풀스크린 빨강 + 초대형 숫자 + 단일 해제 버튼 = 이미 교과서적. 아래는 강화안.
- **카운트다운 링 시각화**: 숫자만이 아니라 SVG stroke가 줄어드는 **원형 프로그레스 링**을 추가 → 남은 시간 glanceable. 마지막 5초엔 링/숫자 **펄스 모션**(§5) — 단 `prefers-reduced-motion`이면 정지.
- 숫자 더 키우기: `text-7xl`(72px) → **`text-8xl`(96px)** (S25+ 6.9" 화면 여유). `tabular-nums` 유지.
- 설명문 다이어트: 3줄 → **아이콘 1개 + 한 줄**("⏱ 15초 안에 안 누르면 119·이웃 호출")로 인지부하↓.
- 해제 버튼을 **화면 하단(엄지 존)에 고정**: 현재 `justify-center`라 세로 긴 S25+에선 버튼이 중앙에 뜸 → **`mt-auto`로 하단 anchor**, 숫자/설명은 상단. (§4)

**이웃 화면 (환자 카드·처치 스텝·수락 버튼)**
- **호출 수신 화면**: 빨간 배너 "지금 가주세요" + 라벨-값 카드(환자/위치/진입/병력) = 스캔성 좋음(유지). 카드 라벨을 `text-sm gray-500` → **`text-base gray-600`** 로 키워 노인 이웃도 읽기 쉽게.
- 주요 CTA "도착했습니다": 하단 고정 + `rounded-3xl`로 강조.
- **119 상시 노출**: 이웃 화면 어디서든 눌리는 **고정 "📞 119 전화" 버튼**(하단 바) 추가 권장 — 앱이 자동 호출해도 사람이 직접 걸 안전판. 색은 `danger` 아웃라인.
- **트리아지 선택지**: 큰 옵션 버튼(28px, `py-6`) 유지. CPR(치명·빨강 채움)은 다른 옵션과 **간격을 벌리고 시각적으로 분리**(오탭 시 리스크 큼).
- **CPR 화면**: 초대형 박자 숫자 + 압박 애니 + 비트음/진동 = 강력. "중지/다시 시작" 버튼은 리듬 영역과 분리 유지. 상단에 얇은 진행 상태("압박 12/30")는 이미 있음 — 좋음.
- **패닉 감소 카피**: 각 화면 상단에 "구급대가 오는 중입니다" 같은 **진행 상태 한 줄** 상시 노출로 이웃 안심.

---

## 4. 한 손 조작 · 엄지 존 · 바텀시트

**핵심 원칙**
- 스마트폰 터치의 **약 75%가 엄지**. 6.5"+ 대화면(=S25+)은 **한 손으로 화면의 ~40%만** 편히 닿음 → **핵심 요소를 하단 2/3에 배치**.
- 존 구분: **초록(하단 중앙, 무리 없음)=주요 액션** / 노랑(중앙 측면)=보조 / **빨강(상단 모서리)=회피**.
- 주요 액션·내비는 **하단 바 / 바텀시트 / FAB(하단 중앙 권장)**. 상단 모서리엔 인터랙션 두지 말 것.

**우리 앱 적용 (구체 do)**
- **모든 주요 CTA를 화면 하단에 anchor**: `flex-col` 컨테이너에서 버튼 앞에 `mt-auto`, 또는 `sticky bottom-0` 바. (환자 AlertScreen 해제 버튼, 이웃 "도착했습니다", "AI 추천 받기" 모두)
- 상단(빨강 존)은 **비인터랙티브 정보만**: 제목·상태 배너·디스클레이머 — 현재 구조가 이미 부합(유지).
- 보조 선택은 **바텀시트** 패턴으로: 예) "다시 설명하기 / 자세히 보기" 류를 하단 시트로 모으면 엄지 이동 최소화.
- "역할 변경" 등 저빈도·위험 액션은 하단이되 주요 CTA와 **색·형태로 분리**(현재 회색 underline — 적절, 유지).
- 뒤로/처음부터 NavBar는 하단 유지(이미 그러함).

---

## 5. 알림 / 풀스크린 경보 · 햅틱 · 모션

**핵심 원칙**
- **Full-Screen Intent(FSI)** 가 알람의 정석. 단 **Android 14/15부터 제약 강화** → 매니페스트에 `USE_FULL_SCREEN_INTENT` 선언 + Play Console에서 **알람/통화 앱으로 신고** 필요. 기기 사용 중이면 heads-up로 표시.
- **햅틱**: 짧고 예측 가능하고 선명하게. **강하거나 예측 불가한 진동은 부담** → 최소/끄기 옵션 제공. 진동 리듬을 이벤트 종류와 매칭.
- **모션**: 평상 흐름엔 자연스러운 스프링 모션(딜라이트), **긴박감엔 펄스/어텐션 모션** — 항상 `prefers-reduced-motion` 존중.
- **다중 감각 중복 신호**(소리+진동+시각) — 감각 저하 고령자에 필수.

**우리 앱 적용 (구체 do)**
- **네이티브 빌드 필수 작업(엔지니어 플래그)**: Capacitor Android 매니페스트에 `USE_FULL_SCREEN_INTENT` 추가, 응급 호출 푸시가 **잠금화면에서도 풀스크린으로 뜨도록** FSI 채널 구성. Play 정책 대비 알람 앱 신고 검토. (현재 인앱 사이렌은 앱 열려 있을 때만 동작 — 백그라운드/잠금 상황 커버 필요)
- **경보음+진동+색+모션 4중 신호** 이미 구현(우수). 진동 패턴 `[500,150]` 반복 유지하되, **"최소 진동/끄기" 설정**을 준비(요양 상황·민감자 대비).
- **긴박감 모션 추가**: 카운트다운 마지막 5초 `animate-pulse`(또는 커스텀), CPR 비트에 화면 미세 플래시. 전부 `prefers-reduced-motion`에서 완화(이미 CPR은 처리).
- 버튼 press는 스프링 감각(`active:scale-95`) 공통화 — 촉각 없이도 "눌렸다" 피드백.

---

## 6. 다크 모드 & 고대비

**핵심 원칙**
- **고령자는 오히려 라이트 모드 선호**(명료·친숙, 밝은 환경 가독). → **라이트 고대비를 기본**, 다크는 강제하지 말 것.
- 다크 지원 시 **순수 검정(#000) 금지** → **다크 그레이(#121212 계열) + 오프화이트(#EDEDED, 순백 아님)** 로 헐레이션(글자 번짐) 감소.
- 대비는 과하지도 부족하지도 않게(Material은 배경/텍스트 최대 15.8:1까지 권고, 실무는 7:1 근처가 눈에 편함).

**우리 앱 적용 (구체 do)**
- **기본 = 라이트 고대비 유지**(현재 흰 배경/진한 텍스트 — 적절).
- **응급 화면은 테마 무관 고정색**: AlertScreen(빨강)·"가주세요" 배너·CPR(빨강)은 시스템 다크모드에서도 **반드시 그 색 그대로**. One UI 자동 다크/색반전이 웹뷰 색을 뒤집지 않도록 `<meta name="color-scheme" content="light">` 또는 컨테이너에 명시 배경 지정 후 실기기 검증.
- danger #d81e06 / safe #0a7d2c는 AA 통과 확인됨 — **소형 본문엔 빨강 지양**(큰/굵은 텍스트 전용), 필요 시 `danger-700`(더 어두운 빨강) 토큰을 소형 텍스트용으로 별도 추가.
- Android **"고대비 텍스트"·"글자 크게"** 접근성 설정과 충돌 없는지 실기기(S25+) 확인.

---

## 즉시 반영 체크리스트 (우선순위)

| # | 액션 | 화면 | 근거 |
|---|---|---|---|
| P1 | 주요 CTA를 **하단 anchor**(`mt-auto`), 엄지 존 배치 | 환자 Alert / 이웃 전체 | §4 |
| P1 | FSI(`USE_FULL_SCREEN_INTENT`) — 잠금화면 풀스크린 경보 | 네이티브(엔지니어) | §5 |
| P1 | 주요 CTA 높이 `56→64px+`, 라운딩 `2xl→3xl` 통일 | 전체 | §1,§2 |
| P2 | 카운트다운 **원형 프로그레스 링** + 마지막 5초 펄스 | 환자 Alert | §3,§5 |
| P2 | 이웃 화면 상시 **"📞 119 전화"** 하단 버튼 | 이웃 | §3 |
| P2 | CPR 등 치명 선택지 주변 간격 `gap-5~6`로 분리 | 이웃 트리아지 | §2,§3 |
| P3 | 카드 라벨 `sm/gray-500 → base/gray-600` 상향 | 이웃 카드 | §2 |
| P3 | 진동 "최소/끄기" 설정, `soft danger-700` 토큰 추가 | 전체 | §5,§6 |
| P3 | 응급 화면 테마 고정(색반전 방지) 실기기 검증 | 전체 | §6 |

### 제안 토큰 (tailwind.config.js — 참고용, 코드 미변경)
- `fontSize`: 현행 유지 + `3xl`(48px) 추가(카운트다운용).
- `borderRadius`: 카드=2xl(16px), 히어로/알림=3xl(24px) 관례화.
- `minHeight`: `cta: 64px`, `cta-hero: 80px` 유틸 추가.
- `colors`: `danger-700 #b01608`(소형 텍스트용), `safe` 유지.
- `keyframes`: `pulse-urgent`(마지막 5초용) + `prefers-reduced-motion` 완화 규칙.

---

## 출처 (Sources)

**Material 3 Expressive / 2025 트렌드**
- https://supercharge.design/blog/material-3-expressive
- https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-supported-devices-3556392/
- https://blog.google/products-and-platforms/platforms/android/material-3-expressive-android-wearos-launch/
- https://m3.material.io/foundations/designing/structure

**고령자 접근성 / 터치타깃 / WCAG**
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12350549/ (Optimizing mobile app design for older adults, systematic review)
- https://mhealth.jmir.org/2023/1/e43186 (Design Guidelines of Mobile Apps for Older Adults)
- https://www.toptal.com/designers/ui/ui-design-for-older-adults
- https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
- https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/
- https://support.google.com/accessibility/android/answer/7101858?hl=en

**응급 / 위기 UX**
- https://medium.com/uxcentury/ux-in-crisis-designing-for-emergency-situations-a1a970372199
- https://www.uxmatters.com/mt/archives/2025/03/ux-design-for-crisis-situations-lessons-from-the-los-angeles-wildfires.php
- https://vrunik.com/ux-for-public-safety-designing-emergency-alert-systems/

**한 손 조작 / 엄지 존**
- https://elaris.software/blog/mobile-ux-thumb-zones-2025/
- https://timgraf.com/ux-design/designing-for-the-thumb-zone-a-modern-guide-to-mobile-ux-that-respects-human-anatomy/
- https://parachutedesign.ca/blog/thumb-zone-ux/

**풀스크린 알림 / 햅틱 / 모션**
- https://proandroiddev.com/full-screen-intent-fsi-notifications-in-android-14-15-what-changed-why-its-breaking-and-e5e862a75936
- https://medium.com/android-news/full-screen-intent-notifications-android-85ea2f5b5dc1
- https://saropa-contacts.medium.com/2025-guide-to-haptics-enhancing-mobile-ux-with-tactile-feedback-676dd5937774

**다크 모드 / 고대비**
- https://www.mindinventory.com/blog/how-to-design-dark-mode-for-mobile-apps/
- https://www.emergobyul.com/news/dark-mode-vs-light-mode-medical-device-uis
- https://arxiv.org/pdf/2409.10841 (Contrast Polarity & Visualization Performance Between Age Groups)
