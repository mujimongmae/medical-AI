// OWNER: state-machine part. Vitest unit tests for the collapse state machine.
// TODO(state-machine): replace this smoke test with real transition scenarios
// (abrupt drop → DOWN, immobility → CANDIDATE_EMITTED, recovery → NORMAL).

import { describe, it, expect } from "vitest";
import { THRESHOLDS } from "@/lib/types";

describe("collapse-state-machine (scaffold)", () => {
  it("exposes demo thresholds", () => {
    expect(THRESHOLDS.IMMOBILE_SECONDS).toBe(3);
  });
});
