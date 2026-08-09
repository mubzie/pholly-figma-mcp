import type { BridgeResponse } from '@pholly/figma-protocol';

export type McpContent =
  | {type: 'text'; text: string}
  | {type: 'image'; data: string; mimeType: string};

export interface McpToolResult {
  isError: boolean;
  content: McpContent[];
}

const imageMimeTypes: Record<string, string> = {
  PNG: 'image/png',
  JPG: 'image/jpeg',
  SVG: 'image/svg+xml'
};

export function formatToolResult(toolName: string, response: BridgeResponse): McpToolResult {
  if (!response.ok) {
    return {isError:true,content:[{type:'text',text:JSON.stringify(response.error,null,2)}]};
  }
  if (toolName === 'get_screenshot' && isScreenshot(response.result)) {
    return screenshotContent(response.result);
  }
  if (toolName === 'inspect_selection' && isInspection(response.result)) {
    const {screenshot,...specification} = response.result;
    const content: McpContent[] = [{type:'text',text:JSON.stringify(specification,null,2)}];
    if (isScreenshot(screenshot)) content.push(...screenshotContent(screenshot).content.filter((block): block is {type:'image';data:string;mimeType:string} => block.type === 'image'));
    return {isError:false,content};
  }
  return {isError:false,content:[{type:'text',text:JSON.stringify(response.result,null,2)}]};
}

function screenshotContent(screenshot: {format: string; base64: string}): McpToolResult {
  const format = screenshot.format.toUpperCase();
  const mimeType = imageMimeTypes[format];
  if (!mimeType) return {isError:false,content:[{type:'text',text:JSON.stringify({format,base64:screenshot.base64},null,2)}]};
  return {isError:false,content:[{type:'text',text:JSON.stringify({format},null,2)},{type:'image',data:screenshot.base64,mimeType}]};
}

function isScreenshot(value: unknown): value is {format: string; base64: string} {
  if (!value || typeof value !== 'object') return false;
  const screenshot = value as Record<string, unknown>;
  return typeof screenshot.format === 'string' && typeof screenshot.base64 === 'string';
}

function isInspection(value: unknown): value is {screenshot?: unknown; [key: string]: unknown} {
  return Boolean(value && typeof value === 'object' && 'nodes' in value && 'selectionCount' in value);
}
