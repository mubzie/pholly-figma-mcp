export type JsonObject = Record<string, unknown>;

export interface BridgeRequest {
  id: string;
  method: string;
  fileKey?: string;
  params?: JsonObject;
}

export interface BridgeResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

export interface ConnectedFile {
  fileKey: string;
  name: string;
  pageId?: string;
  pageName?: string;
  editorType?: string;
  connectedAt: number;
}

export interface DesignNode {
  id?: string;
  key?: string;
  type: 'FRAME' | 'SECTION' | 'GROUP' | 'TEXT' | 'RECTANGLE' | 'ELLIPSE' | 'LINE' | 'COMPONENT' | 'INSTANCE';
  name?: string;
  content?: string;
  componentId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  cornerRadius?: number;
  fills?: unknown[];
  strokes?: unknown[];
  effects?: unknown[];
  text?: JsonObject;
  layout?: JsonObject;
  children?: DesignNode[];
}

export const PROTOCOL_VERSION = 1;
