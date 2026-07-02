import {
  WS_PATH,
  envelope,
  type UpMessage,
  type DownMessage,
} from "@lib/protocol/messages";
import { WS_BASE } from "../config";

export interface WsHandle {
  send: (m: UpMessage) => void;
  close: () => void;
}

/**
 * ws 연결 + 자동 재연결 + HELLO (spec 03-logic §3.1)
 * @param onStatus 접속 상태 콜백(선택). true=연결됨, false=끊김/재연결 대기. UI 상태표시용.
 */
export function connectWs(
  id: string,
  onMessage: (m: DownMessage) => void,
  onStatus?: (connected: boolean) => void,
): WsHandle {
  let ws: WebSocket | null = null;
  let closed = false;

  const open = () => {
    ws = new WebSocket(`${WS_BASE}${WS_PATH}`);
    ws.onopen = () => {
      onStatus?.(true);
      ws?.send(JSON.stringify(envelope<UpMessage>({ type: "HELLO", id })));
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data) as DownMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      onStatus?.(false);
      if (!closed) setTimeout(open, 1000); // 재연결
    };
  };
  open();

  return {
    send: (m) => {
      if (ws?.readyState === 1) ws.send(JSON.stringify(envelope(m)));
    },
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
