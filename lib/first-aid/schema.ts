// 응급처치 프로토콜 스키마 (일반인용) — spec/03-logic/02-first-aid-protocol.md
// 임상 내용의 진실 원천은 각 프로토콜의 source[] 가이드라인. 개정 시 데이터·연도 갱신.

/** 응급도 — UI 색상·정렬·119 우선순위 결정 */
export type Urgency = "critical" | "urgent" | "caution";

/** 처치 대상 (압박 깊이·방법·AED 패드가 달라짐) */
export type PatientType = "adult" | "child" | "infant";
// adult: 사춘기 이후 / child: 1세~사춘기 / infant: 1세 미만

/** 공신력 있는 출처 참조 */
export interface GuidelineRef {
  org: string; // 예: "대한심폐소생협회(KACPR)"
  title: string; // 예: "2020 한국심폐소생술 가이드라인"
  year: number;
  edition?: string;
  note?: string; // 해당 프로토콜에서 인용한 구체 항목
}

/** 반복 동작(예: 가슴압박)의 규칙 */
export interface RepeatRule {
  /** 분당 횟수 범위 [min, max] (예: 가슴압박 [100, 120]) */
  ratePerMin?: [number, number];
  /** 사이클 구성 (훈련자용): 압박:인공호흡 = [30, 2] */
  cycle?: { compressions: number; breaths: number };
  /** 언제까지 반복하는가 (일반인이 이해할 종료 조건) */
  until: string; // 예: "AED가 도착하거나, 환자가 움직이거나 정상 호흡을 회복하거나, 구급대가 도착할 때까지"
}

/** 단일 실행 단계 — 앱에서 한 화면 = 한 행동 */
export interface ProtocolStep {
  id: string;
  order: number;
  /** 짧고 명령형인 행동 지시 (큰 글씨/음성용) */
  title: string;
  /** 부연 설명 (자세·위치·요령) */
  detail: string;
  /** 이 단계 권장 소요 시간(초). 예: 호흡 확인 10초 */
  durationSec?: number;
  /** 반복 동작이면 규칙 */
  repeat?: RepeatRule;
  /** 대상별로 값이 다른 핵심 수치 (예: 압박 깊이) */
  byPatient?: Partial<Record<PatientType, string>>;
  /** 이 단계에서의 주의/흔한 실수 */
  caution?: string;
  /** 앱 애니메이션·이미지 리소스 키 (UI 연동용) */
  media?: string;
}

/** 하나의 완결된 응급처치 프로토콜 */
export interface FirstAidProtocol {
  id: string; // 예: "P-CPR"
  name: string; // 예: "심폐소생술(가슴압박)"
  aka?: string[]; // 다른 이름/검색어
  urgency: Urgency;
  /** 이 프로토콜이 적용되는 상황 요약 */
  appliesTo: string;
  patientType: PatientType[];
  /** 트리아지에서 이 프로토콜로 오는 진입 조건(사람이 읽는 문장) */
  entryConditions: string[];
  /** true면 처치보다 119 신고를 먼저 하도록 UI가 강제 */
  callEmergencyFirst: boolean;
  steps: ProtocolStep[];
  /** 절대 하면 안 되는 것 (금기) */
  doNot: string[];
  /** 구급대 도착 시 전달할 정보 요약 */
  handoff: string;
  source: GuidelineRef[];
  disclaimer: string;
}

/** 트리아지 결정트리 노드 */
export interface TriageNode {
  id: string;
  /** 목격자에게 보여줄 질문/지시 */
  prompt: string;
  /** 부연 (판단 요령) */
  hint?: string;
  /** 선택지 → 다음 노드 또는 프로토콜 */
  options?: TriageOption[];
  /** 종착점이면 연결할 프로토콜 id */
  protocolId?: string;
}

export interface TriageOption {
  label: string; // 예: "무반응"
  /** 다음 트리아지 노드 id */
  next?: string;
  /** 바로 프로토콜로 연결 */
  protocolId?: string;
}

/** 앱 전역 디스클레이머 (모든 화면 상단 노출) */
export const GLOBAL_DISCLAIMER =
  "본 안내는 공인 응급처치 가이드라인(대한심폐소생협회 등)에 기반한 참고용 정보이며, 의학적 진단이나 전문 응급처치를 대체하지 않습니다. 응급 상황에서는 반드시 119에 먼저 신고하세요.";
