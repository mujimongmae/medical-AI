// 응급처치 프로토콜 데이터 (일반인용) — 대한심폐소생협회 2020 가이드라인 기반
// spec/logic/first-aid-protocol.md · 개정 시 수치·source 갱신
import type { FirstAidProtocol, GuidelineRef } from "./schema";

const KACPR_2020: GuidelineRef = {
  org: "대한심폐소생협회(KACPR)",
  title: "2020 한국심폐소생술 가이드라인",
  year: 2020,
};
const AHA_2020: GuidelineRef = {
  org: "American Heart Association(AHA)",
  title: "Guidelines for CPR & ECC",
  year: 2020,
};
const KRC: GuidelineRef = {
  org: "대한적십자사",
  title: "응급처치법 (일반인 교육 표준)",
  year: 2020,
};

const DISCLAIMER =
  "본 안내는 공인 가이드라인 기반 참고용이며 의학적 진단·전문 처치를 대체하지 않습니다. 상황이 위급하면 반드시 119에 먼저 신고하세요.";

export const PROTOCOLS: FirstAidProtocol[] = [
  // ─────────────────────────────────────────────────────────────
  {
    id: "P-CPR",
    name: "심폐소생술 (가슴압박)",
    aka: ["CPR", "심정지", "가슴압박소생술", "무호흡"],
    urgency: "critical",
    appliesTo: "반응이 없고 호흡이 없거나 비정상(헐떡임)인 사람",
    patientType: ["adult", "child", "infant"],
    entryConditions: ["무반응", "무호흡 또는 헐떡임(비정상 호흡)"],
    callEmergencyFirst: true,
    steps: [
      {
        id: "cpr-safety",
        order: 1,
        title: "현장이 안전한지 먼저 확인하세요",
        detail:
          "차량·전기·화재·추락 등 위험이 없는지 확인한 뒤 환자에게 다가갑니다. 위험하면 안전한 곳으로 옮긴 후 시작하세요.",
        media: "scene-safety",
      },
      {
        id: "cpr-response",
        order: 2,
        title: "양쪽 어깨를 두드리며 크게 불러 반응을 확인하세요",
        detail:
          "\"괜찮으세요?\"라고 큰 소리로 물으며 양 어깨를 가볍게 두드립니다. 눈뜸·움직임·대답이 없으면 무반응입니다.",
        durationSec: 5,
        media: "check-response",
      },
      {
        id: "cpr-call",
        order: 3,
        title: "119에 신고하고 자동심장충격기(AED)를 요청하세요",
        detail:
          "주변 사람을 특정해 지목하세요. \"거기 계신 분, 119에 신고해 주세요\", \"누구든 자동심장충격기(AED)를 가져와 주세요\". 혼자면 휴대폰 스피커폰으로 119와 통화하며 진행합니다.",
        caution:
          "막연히 \"누가 신고 좀\"이라고 하면 아무도 안 움직입니다. 반드시 한 사람을 지목하세요.",
        media: "call-119",
      },
      {
        id: "cpr-breathing",
        order: 4,
        title: "10초 안에 호흡을 확인하세요",
        detail:
          "환자의 가슴과 배가 오르내리는지 봅니다. 숨을 안 쉬거나, 헐떡이듯 이상하게 쉬면 심정지로 보고 즉시 가슴압박을 시작합니다.",
        durationSec: 10,
        caution:
          "헐떡임(agonal gasping)은 정상 호흡이 아닙니다. '숨은 쉬는 것 같다'고 멈추지 마세요.",
        media: "check-breathing",
      },
      {
        id: "cpr-position",
        order: 5,
        title: "환자를 딱딱한 바닥에 등을 대고 눕히세요",
        detail:
          "침대·소파처럼 푹신한 곳이면 바닥으로 옮깁니다. 압박 위치는 '가슴 정중앙(복장뼈 아래쪽 절반)'입니다.",
        media: "position",
      },
      {
        id: "cpr-compress",
        order: 6,
        title: "가슴을 세게, 빠르게 압박하세요",
        detail:
          "손꿈치를 가슴 정중앙에 대고 다른 손을 포개 깍지 낍니다. 팔꿈치를 펴고 어깨가 손 바로 위에 오도록 수직으로 누릅니다. 매번 가슴이 완전히 올라오도록 힘을 뺍니다.",
        repeat: {
          ratePerMin: [100, 120],
          cycle: { compressions: 30, breaths: 2 },
          until:
            "AED가 도착하거나, 환자가 움직이거나 정상 호흡을 회복하거나, 구급대가 도착할 때까지",
        },
        byPatient: {
          adult: "깊이 약 5cm (6cm를 넘지 않게), 두 손으로",
          child: "가슴 두께의 약 1/3(4~5cm), 한 손 또는 두 손으로",
          infant: "가슴 두께의 약 1/3(약 4cm), 두 손가락 또는 양 엄지로",
        },
        caution:
          "압박 중단은 10초를 넘기지 마세요. 갈비뼈가 부러질 수 있어도 멈추지 말고 계속합니다. 일반인은 인공호흡 없이 '가슴압박만' 계속해도 됩니다(가슴압박소생술).",
        media: "compressions",
      },
      {
        id: "cpr-breaths-optional",
        order: 7,
        title: "(선택) 인공호흡을 할 수 있으면 30:2로 하세요",
        detail:
          "인공호흡 훈련이 되어 있고 할 의지가 있으면, 가슴압박 30회마다 인공호흡 2회를 합니다. 머리를 젖히고 턱을 들어 기도를 연 뒤 코를 막고 1초씩 2번 불어넣습니다. 자신 없으면 가슴압박만 계속하세요.",
        caution:
          "인공호흡 때문에 압박이 오래 중단되면 안 됩니다. 확신이 없으면 압박만 하는 것이 낫습니다.",
        media: "rescue-breaths",
      },
    ],
    doNot: [
      "'숨 쉬는 것 같다'며 압박을 미루지 말 것 (헐떡임은 심정지 신호)",
      "압박 위치를 명치·갈비뼈로 두지 말 것 (가슴 정중앙)",
      "확신 없이 인공호흡하느라 압박을 오래 멈추지 말 것",
    ],
    handoff:
      "쓰러진 시각, 목격 여부, 시작한 시각, 시행한 처치(가슴압박/AED 충격 횟수), 환자 반응 변화를 구급대에 전달하세요.",
    source: [KACPR_2020, AHA_2020],
    disclaimer: DISCLAIMER,
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: "P-AED",
    name: "자동심장충격기(AED) 사용",
    aka: ["AED", "자동제세동기", "심장충격기"],
    urgency: "critical",
    appliesTo: "심정지(무반응·무호흡) 환자에게 AED가 도착했을 때",
    patientType: ["adult", "child", "infant"],
    entryConditions: ["심폐소생술 진행 중 AED 도착"],
    callEmergencyFirst: true,
    steps: [
      {
        id: "aed-power",
        order: 1,
        title: "전원을 켜고 음성 안내를 따르세요",
        detail:
          "덮개를 열면 켜지는 기종도 있습니다. 이후 모든 단계는 기기 음성 안내를 그대로 따르면 됩니다.",
        media: "aed-power",
      },
      {
        id: "aed-pads",
        order: 2,
        title: "패드 두 장을 그림대로 맨살에 붙이세요",
        detail:
          "① 오른쪽 빗장뼈 아래, ② 왼쪽 젖꼭지 아래 옆구리(겨드랑이선). 패드에 그려진 그림 위치 그대로 붙입니다. 패드를 붙이는 동안에도 가능하면 가슴압박은 계속합니다.",
        byPatient: {
          child:
            "8세 미만 또는 체중 25kg 미만은 소아용 패드/모드를 사용. 없으면 성인용 패드를 앞뒤(가슴 중앙·등)로 붙임",
          infant:
            "영아도 AED를 쓸 수 있음: 소아용 패드/모드 우선, 없으면 성인용 패드를 앞뒤로 붙임 (패드끼리 닿지 않게)",
        },
        caution:
          "가슴이 젖었으면 닦고, 털이 많아 밀착이 안 되면 밀거나 제거. 붙이는 약물 패치·페이스메이커 돌출부 위는 피해 붙입니다.",
        media: "aed-pads",
      },
      {
        id: "aed-analyze",
        order: 3,
        title: "\"분석 중\"이면 환자에게서 모두 손을 떼세요",
        detail:
          "\"환자에게서 떨어지세요\" 안내가 나오면 아무도 환자를 만지지 않습니다.",
        durationSec: 5,
        caution: "분석 중 접촉하면 분석이 틀어집니다. 모두 물러나세요.",
        media: "aed-analyze",
      },
      {
        id: "aed-shock",
        order: 4,
        title: "\"제세동 필요\"면 접촉 없음을 확인하고 버튼을 누르세요",
        detail:
          "충격 버튼이 깜빡이면, 다시 한 번 \"모두 떨어졌나요?\"를 확인한 뒤 버튼을 누릅니다. 충격 후에는 지체 없이 가슴압박을 재개합니다.",
        caution: "\"제세동 불필요\" 안내면 버튼을 누르지 말고 즉시 가슴압박을 재개합니다.",
        media: "aed-shock",
      },
      {
        id: "aed-resume",
        order: 5,
        title: "즉시 가슴압박을 다시 시작하세요",
        detail:
          "AED는 보통 2분마다 다시 분석하라고 안내합니다. 그때까지 가슴압박을 계속하고, 안내가 나오면 3~4단계를 반복합니다.",
        repeat: {
          until: "구급대가 도착하거나 환자가 움직이거나 정상 호흡을 회복할 때까지",
        },
        media: "aed-resume",
      },
    ],
    doNot: [
      "패드 붙였다고 가슴압박을 오래 멈추지 말 것",
      "분석·충격 순간 환자를 만지지 말 것",
      "물기 있는 바닥/가슴에서 그대로 충격하지 말 것 (닦고 진행)",
    ],
    handoff: "AED 충격 횟수와 시각, 마지막 분석 결과를 구급대에 전달하세요.",
    source: [KACPR_2020, AHA_2020],
    disclaimer: DISCLAIMER,
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: "P-RECOVERY",
    name: "회복자세",
    aka: ["회복자세", "옆으로 눕히기", "무반응 정상호흡"],
    urgency: "urgent",
    appliesTo: "반응은 없지만 정상적으로 숨을 쉬는 사람",
    patientType: ["adult", "child"],
    entryConditions: ["무반응", "정상 호흡 있음"],
    callEmergencyFirst: true,
    steps: [
      {
        id: "rec-call",
        order: 1,
        title: "먼저 119에 신고하세요",
        detail: "무반응 상태는 응급입니다. 호흡이 있어도 반드시 119에 신고합니다.",
        media: "call-119",
      },
      {
        id: "rec-position",
        order: 2,
        title: "환자를 옆으로 돌려 눕히세요 (회복자세)",
        detail:
          "가까운 쪽 팔을 위로 펴고, 반대쪽 손등을 뺨에 대며, 반대쪽 무릎을 세워 그 힘으로 몸을 내 쪽으로 옆으로 돌립니다. 위쪽 무릎은 직각으로 굽혀 몸을 고정합니다.",
        media: "recovery-position",
      },
      {
        id: "rec-airway",
        order: 3,
        title: "고개를 살짝 젖혀 기도를 열고 계속 지켜보세요",
        detail:
          "턱을 앞으로 살짝 들어 기도를 확보합니다. 입 안의 토사물·이물질은 흘러나오게 둡니다. 호흡을 계속 관찰합니다.",
        caution:
          "호흡이 멈추거나 헐떡이면 즉시 등을 대고 눕혀 심폐소생술(P-CPR)을 시작하세요.",
        media: "monitor",
      },
    ],
    doNot: [
      "정상 호흡이 있는데 가슴압박을 하지 말 것",
      "목·척추 손상이 의심되면 무리하게 몸을 비틀지 말 것 (기도 확보 우선, 최소한으로 움직임)",
      "물·음식·약을 입에 넣지 말 것",
    ],
    handoff: "무반응이 된 시각, 호흡 상태 변화, 구토 여부를 전달하세요.",
    source: [KACPR_2020, KRC],
    disclaimer: DISCLAIMER,
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: "P-CHOKING",
    name: "기도폐쇄 (질식) 응급처치",
    aka: ["질식", "하임리히", "복부밀어내기", "이물질", "목막힘"],
    urgency: "critical",
    appliesTo: "음식·이물질로 기도가 막혀 숨을 못 쉬는 사람",
    patientType: ["adult", "child", "infant"],
    entryConditions: ["목을 움켜쥠", "기침·말·숨을 못 함", "얼굴이 파래짐"],
    callEmergencyFirst: false,
    steps: [
      {
        id: "chk-assess",
        order: 1,
        title: "기침을 할 수 있는지 확인하세요",
        detail:
          "기침·말·숨이 조금이라도 가능하면(부분 폐쇄) 억지로 손대지 말고 계속 세게 기침하도록 격려합니다. 소리도 못 내고 숨을 못 쉬면(완전 폐쇄) 즉시 다음 단계로.",
        media: "choking-assess",
      },
      {
        id: "chk-call",
        order: 2,
        title: "완전 폐쇄면 주변에 119 신고를 요청하세요",
        detail: "한 사람을 지목해 119에 신고하게 하고, 처치를 바로 시작합니다.",
        media: "call-119",
      },
      {
        id: "chk-back",
        order: 3,
        title: "등 두드리기 5회",
        detail:
          "환자를 앞으로 숙이게 한 뒤, 양 날개뼈(견갑골) 사이를 손바닥 밑동으로 세게 5회 두드립니다.",
        byPatient: {
          infant:
            "영아는 얼굴이 아래로 향하게 팔 위에 엎어 머리를 낮추고 등 두드리기 5회",
        },
        media: "back-blows",
      },
      {
        id: "chk-thrust",
        order: 4,
        title: "복부 밀어내기(하임리히) 5회",
        detail:
          "뒤에서 감싸 안고, 주먹을 배꼽과 명치 사이에 대고 다른 손으로 감싼 뒤 안쪽·위쪽으로 강하게 5회 밀어 올립니다. 이물질이 나오거나 숨을 쉴 때까지 등 두드리기 5회 ↔ 복부 밀어내기 5회를 번갈아 반복합니다.",
        byPatient: {
          infant:
            "영아는 복부 밀어내기 금지. 등 두드리기 5회 → 가슴 압박 5회(젖꼭지 잇는 선 바로 아래)를 번갈아 반복",
        },
        caution:
          "임산부·고도비만은 복부 대신 가슴 밀어내기(가슴 중앙)를 합니다.",
        media: "abdominal-thrust",
      },
      {
        id: "chk-collapse",
        order: 5,
        title: "의식을 잃으면 바로 심폐소생술을 시작하세요",
        detail:
          "환자가 축 늘어지면 바닥에 눕히고 119에 다시 알린 뒤 가슴압박(P-CPR)을 시작합니다. 압박 중 입 안에 이물질이 보이면 꺼냅니다.",
        caution: "이물질이 안 보이는데 손가락을 입에 넣어 훑지 마세요 (더 밀려들어갈 수 있음).",
        media: "choking-collapse",
      },
    ],
    doNot: [
      "부분 폐쇄(기침 가능)일 때 등을 두드리거나 손대지 말 것",
      "영아에게 복부 밀어내기(하임리히) 하지 말 것",
      "보이지 않는 이물질을 손가락으로 훑지 말 것",
    ],
    handoff: "막힌 원인(음식 등), 지속 시간, 의식 소실 여부를 전달하세요.",
    source: [KACPR_2020, KRC],
    disclaimer: DISCLAIMER,
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: "P-STROKE",
    name: "뇌졸중 의심 (FAST)",
    aka: ["뇌졸중", "중풍", "FAST", "안면마비", "언어장애"],
    urgency: "critical",
    appliesTo: "갑자기 얼굴·팔·말에 이상이 생긴 사람",
    patientType: ["adult", "child"],
    entryConditions: ["한쪽 얼굴 처짐", "한쪽 팔 힘 빠짐", "말이 어눌함"],
    callEmergencyFirst: true,
    steps: [
      {
        id: "stroke-fast",
        order: 1,
        title: "FAST로 30초 안에 확인하세요",
        detail:
          "F(Face): 웃게 해 한쪽 입꼬리가 처지는지 · A(Arm): 두 팔을 들게 해 한쪽이 내려오는지 · S(Speech): 짧은 문장을 따라 하게 해 발음이 어눌한지. 하나라도 이상하면 뇌졸중을 의심합니다.",
        media: "fast",
      },
      {
        id: "stroke-time",
        order: 2,
        title: "T(Time): 증상 시작 시각을 기억하고 즉시 119",
        detail:
          "\"마지막으로 멀쩡했던 시각\"을 기억하세요. 뇌졸중은 시간이 생명입니다. 곧바로 119에 신고합니다.",
        caution:
          "증상 시작 시각은 혈전용해 치료 가능 여부를 결정합니다. 반드시 기록·전달하세요.",
        media: "call-119",
      },
      {
        id: "stroke-care",
        order: 3,
        title: "편하게 눕히고 아무것도 먹이지 마세요",
        detail:
          "상체를 약간 높여 편하게 눕히고 조이는 옷을 풉니다. 구급대가 올 때까지 곁에서 상태를 지켜봅니다.",
        caution:
          "삼킴 장애로 사레·질식 위험이 있으니 물·음식·약을 절대 주지 마세요.",
        media: "stroke-care",
      },
    ],
    doNot: [
      "물·음식·약(아스피린 포함) 임의로 먹이지 말 것",
      "\"곧 괜찮아지겠지\" 하며 기다리지 말 것 (즉시 119)",
      "증상 시작 시각을 놓치지 말 것",
    ],
    handoff: "증상 시작(마지막 정상) 시각, 나타난 증상, 기저질환·복용약을 전달하세요.",
    source: [KACPR_2020, KRC],
    disclaimer: DISCLAIMER,
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: "P-BLEED",
    name: "심한 출혈 지혈",
    aka: ["출혈", "지혈", "상처", "피"],
    urgency: "critical", // 생명 위협 대량출혈은 시간 민감 응급 (심정지 다음가는 위중도)
    appliesTo: "멈추지 않고 계속 흐르거나 솟구치는 출혈",
    patientType: ["adult", "child", "infant"],
    entryConditions: ["다량 출혈", "직접 압박에도 계속 새는 출혈"],
    callEmergencyFirst: true,
    steps: [
      {
        id: "bleed-call",
        order: 1,
        title: "심한 출혈이면 119에 신고하세요",
        detail: "피가 솟구치거나 멈추지 않으면 즉시 신고합니다. 가능하면 장갑 등으로 감염을 예방합니다.",
        media: "call-119",
      },
      {
        id: "bleed-press",
        order: 2,
        title: "깨끗한 천으로 상처를 직접, 강하게 누르세요",
        detail:
          "거즈·수건 등으로 상처를 덮고 손바닥으로 체중을 실어 계속 누릅니다. 피가 배어 나와도 천을 떼지 말고 그 위에 덧대어 계속 압박합니다.",
        media: "direct-pressure",
      },
      {
        id: "bleed-elevate",
        order: 3,
        title: "직접 압박을 유지한 채, 가능하면 상처를 심장보다 높이세요",
        detail:
          "지혈의 핵심은 '직접 압박'입니다. 거상은 보조 수단일 뿐이니, 압박을 절대 멈추지 말고 유지한 상태에서만 팔·다리 상처를 심장보다 높게 들어 출혈을 줄입니다.",
        caution:
          "거상 때문에 압박이 느슨해지면 안 됩니다. 뼈가 부러진 것 같으면 들지 말고 압박에만 집중하세요.",
        media: "elevate",
      },
      {
        id: "bleed-tourniquet",
        order: 4,
        title: "(최후 수단) 사지 대량출혈이 안 멎으면 지혈대",
        detail:
          "팔·다리에서 생명을 위협하는 출혈이 직접 압박으로도 멈추지 않을 때만, 상처보다 심장 쪽에 지혈대(또는 넓은 띠)를 세게 감습니다. 감은 시각을 적어 두고 구급대에 알립니다.",
        caution: "가는 끈·철사로 감지 마세요. 한번 감으면 임의로 풀지 말고 구급대에 인계합니다.",
        media: "tourniquet",
      },
    ],
    doNot: [
      "상처에 박힌 이물질(칼·유리 등)을 빼지 말 것 (주변을 고정하고 압박)",
      "배어 나온다고 덮은 천을 떼어내지 말 것",
      "상처에 소독약을 붓거나 입으로 빨지 말 것",
    ],
    handoff: "출혈 부위·양, 압박·지혈대 적용 시각, 이물질 유무를 전달하세요.",
    source: [KRC, AHA_2020],
    disclaimer: DISCLAIMER,
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: "P-SEIZURE",
    name: "발작 · 경련 대응",
    aka: ["발작", "경련", "간질", "뇌전증"],
    urgency: "urgent",
    appliesTo: "전신이 뻣뻣해지거나 떨리며 의식이 없는 경련",
    patientType: ["adult", "child", "infant"],
    entryConditions: ["전신 경련", "의식 없이 떨림·뻣뻣함"],
    callEmergencyFirst: false,
    steps: [
      {
        id: "seiz-protect",
        order: 1,
        title: "주변 위험물을 치우고 머리를 보호하세요",
        detail:
          "가구·모서리·뜨거운 물건 등을 치우고, 머리 아래에 옷·방석 등 부드러운 것을 받쳐 다치지 않게 합니다.",
        media: "seizure-protect",
      },
      {
        id: "seiz-time",
        order: 2,
        title: "경련 시작 시각을 확인하고 지켜보세요",
        detail:
          "억지로 붙잡거나 움직임을 멈추려 하지 말고, 발작이 얼마나 지속되는지 시간을 잽니다.",
        caution:
          "몸을 억지로 누르면 골절·탈구 위험이 있습니다. 지켜보며 보호만 합니다.",
        media: "seizure-time",
      },
      {
        id: "seiz-call",
        order: 3,
        title: "다음이면 즉시 119에 신고하세요",
        detail:
          "① 경련이 5분 이상 지속 ② 멈췄다 다시 반복 ③ 첫 발작 ④ 호흡이 힘들거나 얼굴이 파래짐 ⑤ 임신 중 ⑥ 다쳤거나 물에 빠짐 ⑦ 경련 후에도 의식이 안 돌아옴.",
        media: "call-119",
      },
      {
        id: "seiz-recovery",
        order: 4,
        title: "경련이 멎으면 옆으로 눕혀(회복자세) 기도를 확보하세요",
        detail:
          "경련이 끝나면 옆으로 돌려 눕혀 침·토사물이 흘러나오게 하고 호흡을 지켜봅니다. 깨어날 때까지 곁을 지킵니다.",
        media: "recovery-position",
      },
    ],
    doNot: [
      "입에 손가락·수저 등 아무것도 넣지 말 것 (질식·부상 위험)",
      "몸을 억지로 붙잡아 경련을 멈추려 하지 말 것",
      "물·약을 먹이지 말 것 (완전히 깰 때까지)",
    ],
    handoff:
      "경련 지속 시간, 반복 여부, 시작 부위, 첫 발작인지, 다친 곳·기저질환을 전달하세요.",
    source: [KRC, AHA_2020],
    disclaimer: DISCLAIMER,
  },

  // ─────────────────────────────────────────────────────────────
  {
    id: "P-SYNCOPE",
    name: "실신 · 기절 대응",
    aka: ["실신", "기절", "졸도", "어지러움"],
    urgency: "caution",
    appliesTo: "잠깐 정신을 잃고 쓰러졌으나 곧 반응이 돌아오는 경우",
    patientType: ["adult", "child"],
    entryConditions: ["일시적 의식 소실", "곧 반응 회복", "정상 호흡"],
    callEmergencyFirst: false,
    steps: [
      {
        id: "syn-check",
        order: 1,
        title: "반응과 호흡을 먼저 확인하세요",
        detail:
          "반응이 없고 호흡이 없거나 비정상이면 실신이 아니라 심정지일 수 있습니다. 즉시 심폐소생술(P-CPR)로 전환하세요.",
        caution: "무반응 + 무호흡/헐떡임이면 실신으로 보지 말고 바로 CPR.",
        media: "check-response",
      },
      {
        id: "syn-legs",
        order: 2,
        title: "바로 눕히고 다리를 30cm 정도 올리세요",
        detail:
          "평평한 곳에 눕히고 다리를 심장보다 높이 올려 뇌로 가는 피를 늘립니다. 조이는 옷·넥타이·벨트를 풉니다.",
        media: "legs-up",
      },
      {
        id: "syn-observe",
        order: 3,
        title: "회복을 지켜보고, 이상이 있으면 119",
        detail:
          "보통 1~2분 내 회복됩니다. 회복 후에도 갑자기 일으키지 말고 잠시 앉혔다 세웁니다.",
        caution:
          "① 금방 안 깨어남 ② 가슴 통증·호흡곤란 ③ 머리를 심하게 부딪힘 ④ 임신·고령·기저질환 ⑤ 반복 실신이면 119에 신고하세요.",
        media: "observe",
      },
    ],
    doNot: [
      "쓰러진 사람을 억지로 흔들어 세우지 말 것",
      "깨어나기 전에 물·음식을 주지 말 것",
      "무반응·무호흡을 단순 실신으로 넘기지 말 것",
    ],
    handoff: "의식 잃은 시간, 회복까지 걸린 시간, 동반 증상(가슴통증 등), 부상 여부를 전달하세요.",
    source: [KRC, AHA_2020],
    disclaimer: DISCLAIMER,
  },
];

export const PROTOCOL_BY_ID: Record<string, FirstAidProtocol> =
  Object.fromEntries(PROTOCOLS.map((p) => [p.id, p]));
