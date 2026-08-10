export interface RgbColor { r: number; g: number; b: number }
export interface RgbaColor extends RgbColor { a: number }

const HEX_PATTERN = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function hexToRgb(hex: string): RgbColor | null {
  const match = hex.trim().match(HEX_PATTERN);
  if (!match) return null;
  let value = match[1];
  if (value.length === 3 || value.length === 4) {
    value = value.split('').map(ch => ch + ch).join('');
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return { r: r / 255, g: g / 255, b: b / 255 };
}

export function normalizeColor(color: unknown, opacity?: number): RgbaColor {
  let rgb: RgbColor;
  let alpha = 1;
  if (typeof color === 'string') {
    const parsed = hexToRgb(color);
    if (!parsed) throw new Error(`Invalid color: ${color}`);
    rgb = parsed;
    const match = color.trim().match(HEX_PATTERN);
    if (match && match[1].length === 4) alpha = parseInt(match[1][3] + match[1][3], 16) / 255;
    if (match && match[1].length === 8) alpha = parseInt(match[1].slice(6, 8), 16) / 255;
  } else if (color && typeof color === 'object') {
    const c = color as Record<string, unknown>;
    if (typeof c.r !== 'number' || typeof c.g !== 'number' || typeof c.b !== 'number') throw new Error('Invalid color object');
    rgb = { r: clamp01(c.r), g: clamp01(c.g), b: clamp01(c.b) };
    if (typeof c.a === 'number') alpha = clamp01(c.a);
  } else {
    throw new Error('Invalid color: expected a hex string or an {r,g,b,a} object');
  }
  if (typeof opacity === 'number') alpha *= clamp01(opacity);
  return { ...rgb, a: Math.round(alpha * 1000) / 1000 };
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
