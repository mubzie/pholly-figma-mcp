import type { ConnectedFile } from '@pholly/figma-protocol';

export interface BridgeSocket {
  send(data: string): void;
  readyState?: number;
}

export type ConnectedTarget<S extends BridgeSocket = BridgeSocket> = {
  socket: S;
  info: ConnectedFile;
};

export type Registration = { fileKey: string; accepted: boolean };

export function isSocketOpen<S extends BridgeSocket>(socket: S): boolean {
  if (socket.readyState === undefined) return true;
  return socket.readyState === 1;
}

export function registerConnectedFile<S extends BridgeSocket>(
  files: Map<string, ConnectedTarget<S>>,
  socket: S,
  previousKey: string,
  message: Record<string, unknown>,
  connectedAt = Date.now()
): Registration {
  const fileKey = typeof message.fileKey === 'string' && message.fileKey ? message.fileKey : previousKey;
  if (!fileKey) throw new Error('Connected file did not provide a file key');
  const existing = files.get(fileKey);
  if (existing && existing.socket !== socket && isSocketOpen(existing.socket)) {
    return { fileKey, accepted: false };
  }
  if (previousKey && previousKey !== fileKey && files.get(previousKey)?.socket === socket) files.delete(previousKey);
  files.set(fileKey, {
    socket,
    info: {
      fileKey,
      name: typeof message.name === 'string' && message.name ? message.name : fileKey,
      pageId: typeof message.pageId === 'string' ? message.pageId : undefined,
      pageName: typeof message.pageName === 'string' ? message.pageName : undefined,
      editorType: typeof message.editorType === 'string' ? message.editorType : undefined,
      connectedAt
    }
  });
  return { fileKey, accepted: true };
}

export function unregisterConnectedFile<S extends BridgeSocket>(
  files: Map<string, ConnectedTarget<S>>,
  socket: S,
  fileKey: string
): void {
  if (fileKey && files.get(fileKey)?.socket === socket) files.delete(fileKey);
}

/** One missed pong is tolerated; the next ping with no pong drops the socket. */
export function nextLiveness(awaitingPong: boolean, event: 'ping' | 'pong'): { awaitingPong: boolean; drop: boolean } {
  if (event === 'pong') return { awaitingPong: false, drop: false };
  if (awaitingPong) return { awaitingPong: true, drop: true };
  return { awaitingPong: true, drop: false };
}
