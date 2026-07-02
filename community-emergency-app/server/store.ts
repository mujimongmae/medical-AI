// 브로커 로컬 영속 (데모) — 등록/병력을 server/data.json에 저장. 프로덕션은 Supabase로 스왑.
// spec/04-data-model/01-entities-and-persistence.md §3
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { RegisteredUser } from "../lib/protocol/messages";
import { users } from "./registry";

const FILE = "server/data.json";

/** 시작 시: 저장본을 읽어 등록부에 덮어쓰기/추가 (같은 id는 저장본 우선, 시드 이후 호출). */
export function loadStore(log: (m: string) => void) {
  try {
    if (!existsSync(FILE)) {
      log("store: 저장 파일 없음(신규)");
      return;
    }
    const arr = JSON.parse(readFileSync(FILE, "utf8")) as RegisteredUser[];
    for (const u of arr) if (u?.id) users.set(u.id, u);
    log(`store loaded: ${arr.length} users`);
  } catch (e) {
    log(`store load 실패: ${(e as Error).message}`);
  }
}

/** 변경 시: 등록부 전체를 파일에 저장(합성 데이터만). 실패해도 throw 안 함. */
export function saveStore() {
  try {
    writeFileSync(FILE, JSON.stringify([...users.values()], null, 2), "utf8");
  } catch {
    /* noop (데모) */
  }
}
