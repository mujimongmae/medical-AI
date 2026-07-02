import { describe, it, expect } from "vitest";
import {
  createCollapseStateMachine,
  type StateMachineConfig,
} from "@/lib/collapse-state-machine";
import type { DetectionFrame, EmergencyEvent } from "@/lib/types";
import type { ZoneRect } from "@/lib/zone-map";

// ---------------------------------------------------------------------------
// Synthetic frame builders. We control the hip/shoulder centers and the person
// bbox directly so the geometry the state machine derives is deterministic.
// COCO-17 subset: left/right shoulder + left/right hip is enough for torso angle
// and hip-center; the COCO-SSD person object fixes aspect ratio + body scale.
// ---------------------------------------------------------------------------

function makeFrame(
  tSeconds: number,
  shoulder: { x: number; y: number },
  hip: { x: number; y: number },
  bbox: [number, number, number, number],
): DetectionFrame {
  const kp = (name: string, x: number, y: number) => ({
    name,
    x,
    y,
    score: 0.9,
  });
  return {
    timestamp: tSeconds * 1000,
    width: 640,
    height: 480,
    objects: [{ class: "person", score: 0.9, bbox }],
    pose: {
      score: 0.9,
      keypoints: [
        kp("left_shoulder", shoulder.x - 15, shoulder.y),
        kp("right_shoulder", shoulder.x + 15, shoulder.y),
        kp("left_hip", hip.x - 15, hip.y),
        kp("right_hip", hip.x + 15, hip.y),
      ],
    },
  };
}

// Upright person: shoulder above hip (vertical torso), tall bbox.
function standing(t: number): DetectionFrame {
  return makeFrame(t, { x: 100, y: 100 }, { x: 100, y: 200 }, [80, 80, 40, 180]);
}

// Lying person: shoulder beside hip (horizontal torso), wide bbox on the floor.
function lying(t: number, hipX = 250, hipY = 300): DetectionFrame {
  return makeFrame(
    t,
    { x: hipX - 100, y: hipY },
    { x: hipX, y: hipY },
    [hipX - 110, hipY - 20, 180, 40],
  );
}

function makeSM(zones: ZoneRect[]): {
  sm: ReturnType<typeof createCollapseStateMachine>;
  events: EmergencyEvent[];
} {
  const events: EmergencyEvent[] = [];
  const config: StateMachineConfig = {
    cameraId: "cam-test",
    zones,
    onCandidate: (e) => events.push(e),
  };
  return { sm: createCollapseStateMachine(config), events };
}

const FLOOR: ZoneRect[] = [{ zone: "floor", bbox: [0, 250, 640, 230] }];
const BED: ZoneRect[] = [{ zone: "bed", bbox: [0, 250, 640, 230] }];

describe("collapse state machine", () => {
  it("(a) abrupt fall + floor + immobile => CANDIDATE_EMITTED (critical)", () => {
    const { sm, events } = makeSM(FLOOR);

    // 5 upright frames, then a sudden fall to horizontal on the floor.
    for (let i = 0; i <= 4; i++) sm.update(standing(i * 0.1));
    sm.update(lying(0.5)); // abrupt transition frame

    // Stay immobile on the floor well past IMMOBILE_SECONDS (3s).
    for (let t = 0.6; t <= 3.8; t += 0.1) {
      sm.update(lying(Number(t.toFixed(1))));
    }

    expect(events).toHaveLength(1);
    const e = events[0];
    expect(sm.getState()).toBe("CANDIDATE_EMITTED");
    expect(e.severity).toBe("critical");
    expect(e.signals.transition).toBe("abrupt");
    expect(e.signals.zone).toBe("floor");
    expect(e.signals.posture).toBe("horizontal");
    expect(e.signals.immobileSeconds).toBeGreaterThanOrEqual(3);
    expect(e.status).toBe("candidate");
  });

  it("(b) slow lying down in bed => no candidate (zone suppression)", () => {
    const { sm, events } = makeSM(BED);

    // Upright, then a gentle recline that ends horizontal - but inside the bed.
    for (let i = 0; i <= 3; i++) sm.update(standing(i * 0.1));
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const t = 0.4 + s * 0.1;
      const p = s / steps;
      const shoulder = { x: 100 + 50 * p, y: 100 + 200 * p };
      const hip = { x: 100 + 150 * p, y: 200 + 100 * p };
      const w = 40 + 140 * p;
      const h = 180 - 140 * p;
      sm.update(
        makeFrame(t, shoulder, hip, [hip.x - w / 2, hip.y - h / 2, w, h]),
      );
    }
    // Rest immobile in bed for a long time.
    for (let t = 1.3; t <= 4.5; t += 0.1) {
      sm.update(lying(Number(t.toFixed(1))));
    }

    expect(events).toHaveLength(0);
    expect(sm.getState()).toBe("NORMAL");
  });

  it("(c) sitting down => no candidate (never horizontal)", () => {
    const { sm, events } = makeSM(FLOOR);

    // Slowly lower the hip while the torso stays vertical and the bbox tall.
    for (let i = 0; i <= 4; i++) sm.update(standing(i * 0.1));
    const seatY = [210, 220, 230, 240, 245];
    seatY.forEach((y, i) => {
      const t = 0.5 + i * 0.1;
      sm.update(
        makeFrame(t, { x: 100, y: 150 }, { x: 100, y }, [80, 130, 45, 145]),
      );
    });
    // Hold the seated pose.
    for (let t = 1.0; t <= 4.0; t += 0.1) {
      sm.update(
        makeFrame(
          Number(t.toFixed(1)),
          { x: 100, y: 150 },
          { x: 100, y: 245 },
          [80, 130, 45, 145],
        ),
      );
    }

    expect(events).toHaveLength(0);
    expect(sm.getState()).toBe("NORMAL");
  });

  it("(d) fall then recover before immobile confirm => no candidate", () => {
    const { sm, events } = makeSM(FLOOR);

    for (let i = 0; i <= 4; i++) sm.update(standing(i * 0.1));
    sm.update(lying(0.5)); // abrupt fall

    // Lie down for < IMMOBILE_SECONDS, then get back up.
    for (let t = 0.6; t <= 1.3; t += 0.1) {
      sm.update(lying(Number(t.toFixed(1))));
    }
    // Rising: torso vertical again => recovery.
    for (let t = 1.4; t <= 2.2; t += 0.1) {
      sm.update(standing(Number(t.toFixed(1))));
    }

    expect(events).toHaveLength(0);
    expect(sm.getState()).toBe("NORMAL");
  });
});
