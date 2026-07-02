// 데모 합성 시드 — 서버 시작 시 in-memory 등록부에 데모 페르소나를 채운다.
// ⚠️ 전부 가짜(합성) 데이터. 실제 PHI/PII/이름/주소/병력 금지 (spec/03-logic/01 §4).
// 추후 SQLite 전환 시 이 시드 로직을 마이그레이션 시더로 옮긴다(스펙 표기).
import type { RegisteredUser } from "../lib/protocol/messages";
import { users } from "./registry";

/** 데모 마을 (합성). 좌표도 임의 합성값. */
export const SEED_VILLAGE = "방림리";

// 마을 중심 근처 합성 좌표 (강원 산간 가정, 실제 주소와 무관한 가짜값)
const CENTER = { lat: 37.512, lng: 128.401 };
const jitter = (base: number, d: number) => Number((base + d).toFixed(6));

/** 데모 페르소나: 독거노인 환자 1 + 이웃 4 (같은 마을). 이름·병력 전부 합성. */
const SEED_USERS: RegisteredUser[] = [
  {
    id: "seed-patient-1",
    role: "patient",
    name: "김복순(합성)",
    village: SEED_VILLAGE,
    home: { lat: jitter(CENTER.lat, 0.0), lng: jitter(CENTER.lng, 0.0) },
    history: ["고혈압", "협심증(심장질환)"],
  },
  {
    id: "seed-neighbor-1",
    role: "neighbor",
    name: "이영자(합성)",
    village: SEED_VILLAGE,
    home: { lat: jitter(CENTER.lat, 0.0008), lng: jitter(CENTER.lng, 0.0006) },
    history: [],
  },
  {
    id: "seed-neighbor-2",
    role: "neighbor",
    name: "박정길(합성)",
    village: SEED_VILLAGE,
    home: { lat: jitter(CENTER.lat, -0.0011), lng: jitter(CENTER.lng, 0.0014) },
    history: ["당뇨"],
  },
  {
    id: "seed-neighbor-3",
    role: "neighbor",
    name: "최말자(합성)",
    village: SEED_VILLAGE,
    home: { lat: jitter(CENTER.lat, 0.0021), lng: jitter(CENTER.lng, -0.0009) },
    history: [],
  },
  {
    id: "seed-neighbor-4",
    role: "neighbor",
    name: "정순덕(합성)",
    village: SEED_VILLAGE,
    home: { lat: jitter(CENTER.lat, -0.0025), lng: jitter(CENTER.lng, -0.0018) },
    history: [],
  },
];

/** 데모 환자 id (fall-event mock 트리거·문서용) */
export const SEED_PATIENT_ID = SEED_USERS[0].id;

/** 등록부에 시드 주입 (id 접두사 seed- → /api/register의 dev-NNN 시퀀스와 충돌 없음). */
export function seedRegistry(): void {
  for (const u of SEED_USERS) users.set(u.id, u);
}
