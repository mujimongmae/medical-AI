import {
  WS_PATH,
  envelope,
  type UpMessage,
  type DownMessage,
} from "@lib/protocol/messages";

export interface WsHandle {
  send: (m: UpMessage) => void;
  close: () => void;
}

/** ws 연결 + 자동 재연결 + HELLO (spec 03-logic §3.1) */
export function connectWs(
  id: string,
  onMessage: (m: DownMessage) => void,
): WsHandle {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let ws: WebSocket | null = null;
  let closed = false;

  const open = () => {
    ws = new WebSocket(`${proto}://${location.host}${WS_PATH}`);
    ws.onopen = () =>
      ws?.send(JSON.stringify(envelope<UpMessage>({ type: "HELLO", id })));
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data) as DownMessage);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
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
