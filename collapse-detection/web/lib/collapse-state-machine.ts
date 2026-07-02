// OWNER: state-machine part. Consumes DetectionFrames, emits collapse candidates.
// Rules (screening/07): primary axis = abrupt transition; zone + immobility assist.
// NORMAL → SUSPECTED → DOWN → IMMOBILE_CONFIRM → CANDIDATE_EMITTED (recover → NORMAL).
// TODO(state-machine): implement transition logic + candidate assembly.

import type {
  CollapseState,
  DetectionFrame,
  EmergencyEvent,
} from "@/lib/types";
import type { ZoneRect } from "@/lib/zone-map";

export interface StateMachineConfig {
  cameraId: string;
  /** User-drawn zones for bed/couch suppression + floor suspicion. */
  zones: ZoneRect[];
  /** Called when a candidate is emitted (wire to event-bus.emitEmergencyEvent). */
  onCandidate: (event: EmergencyEvent) => void;
  /** Optional: capture a keyframe data URL at emission time. */
  captureKeyframe?: () => string | undefined;
}

export interface CollapseStateMachine {
  /** Feed one detection frame; advances the state machine. */
  update: (frame: DetectionFrame) => void;
  /** Current state (for UI banner). */
  getState: () => CollapseState;
  /** Reset to NORMAL (e.g. after app-side cancel). */
  reset: () => void;
}

/**
 * Create a collapse state machine.
 * TODO(state-machine): track hip-center velocity, torso angle, aspect flip,
 * zone, and immobility timer against THRESHOLDS.
 */
export function createCollapseStateMachine(
  _config: StateMachineConfig,
): CollapseStateMachine {
  throw new Error(
    "TODO(state-machine): createCollapseStateMachine not implemented",
  );
}
