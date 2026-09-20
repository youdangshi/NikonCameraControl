/**
 * Nikon Flexible Color Picture Control (.NP3) mapping.
 *
 * Binary parsing is provided by the MIT-licensed
 * `nikon-flexible-color-picture-control` package.
 */

import { deserialize } from 'nikon-flexible-color-picture-control';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslColor(hue, saturation, lightness = 0.5) {
  const h = ((Number(hue) || 0) % 360 + 360) % 360 / 360;
  const s = clamp(Math.abs(Number(saturation) || 0) / 100, 0, 1);
  if (!s) return { r: 1, g: 1, b: 1 };
  const q = lightness < 0.5 ? lightness * (1 + s) : lightness + s - lightness * s;
  const p = 2 * lightness - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
  };
}

function gradingOffset(values) {
  if (!values) return { r: 0, g: 0, b: 0 };
  const hue = Number(values.hue) || 0;
  const chroma = clamp(Number(values.chroma) || 0, -100, 100) / 100;
  const brightness = clamp(Number(values.brightness) || 0, -100, 100) / 100;
  const color = hslColor(hue, chroma * 100, 0.5);
  const amount = Math.abs(chroma) * 0.22;
  const neutral = 1 / 3;
  return {
    r: (color.r - neutral) * amount + brightness * 0.12,
    g: (color.g - neutral) * amount + brightness * 0.12,
    b: (color.b - neutral) * amount + brightness * 0.12,
  };
}

function blenderPatch(colorBlender = {}) {
  const patch = {};
  for (const [name, values] of Object.entries(colorBlender)) {
    if (!values) continue;
    patch[`${name}Hue`] = clamp(Number(values.hue) || 0, -100, 100);
    patch[`${name}Sat`] = clamp(Number(values.chroma) || 0, -100, 100);
    patch[`${name}Lum`] = clamp(Number(values.brightness) || 0, -100, 100);
  }
  return patch;
}

export function parseNp3(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const pictureControl = deserialize(bytes);
  const adjustments = {
    contrast: pictureControl.contrast,
    highlights: pictureControl.highlights,
    shadows: pictureControl.shadows,
    whites: pictureControl.whiteLevel,
    blacks: pictureControl.blackLevel,
    saturation: pictureControl.saturation,
    sharpen: clamp((pictureControl.sharpning || 0) / 9 * 100, -100, 100),
    texture: clamp((pictureControl.midRangeSharpning || 0) * 20, -100, 100),
    clarity: clamp((pictureControl.clarity || 0) * 20, -100, 100),
  };
  const grading = {
    shadows: gradingOffset(pictureControl.colorGrading?.shadows),
    midTone: gradingOffset(pictureControl.colorGrading?.midTone),
    highlights: gradingOffset(pictureControl.colorGrading?.highlights),
  };
  return {
    name: pictureControl.name || 'Nikon NP3',
    comment: pictureControl.comment || '',
    adjustments,
    colorMix: blenderPatch(pictureControl.colorBlender),
    grading,
    toneCurve: pictureControl.toneCurve?.raw?.length >= 257 ? Array.from(pictureControl.toneCurve.raw) : null,
  };
}
