/**
 * 画布修图引擎
 *
 * 在浏览器/手机端用 <canvas> 完成「调色 + 人像精修」，不依赖远程模型：
 *   - 基础调色：曝光/对比/高光/阴影/白/黑/色温/色调/饱和/自然饱和/清晰/纹理/去雾/降噪/锐化/暗角/颗粒/褪色
 *   - 专业基础：五点曲线、红橙黄绿蓝紫颜色混合
 *   - 人像精修：磨皮/美白/红润/肤色提亮/瑕疵/牙齿/唇色 +（演示近似）大眼/瘦脸
 *   - stylePreset 可直接套用 STYLE_PRESETS 里的预设
 *
 * 出于性能考虑：预览按 maxDim=1100 处理，导出按 maxDim=2600。
 */

import { DEFAULT_ADJ, DEFAULT_PORTRAIT, DEFAULT_MASK, DEFAULT_WHEELS } from './presets.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d = 0) => (typeof v === 'number' && !Number.isNaN(v) ? v : d);

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败，请换一张试试'));
    img.src = src;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * 计算目标尺寸，保持比例，最长边不超过 maxDim
 * @param {HTMLImageElement} img
 * @param {number} maxDim
 */
function targetSize(img, maxDim) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (Math.max(w, h) > maxDim) {
    const k = maxDim / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return { w, h };
}

/**
 * 皮肤像素掩码（0..1）。RGB 启发式：偏暖、R>G>B、亮度适中。
 * @param {Uint8ClampedArray} data
 * @param {number} i 像素起始索引
 */
function skinMaskAt(data, i) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lum = (r * 0.299 + g * 0.587 + b * 0.114);
  const warm = r > b + 6 && r >= g;
  const notTooWhite = max > 45 && min < 245;
  const notTooDark = lum > 35;
  const satBounded = (max - min) < 120;
  if (!warm || !notTooWhite || !notTooDark || !satBounded) return 0;
  // 越自然肤色越接近 1
  const rG = r > g ? Math.abs(r - g) : -Math.abs(r - g);
  let mask = clamp(1 - Math.abs(r - b) / 120, 0, 1);
  if (rG > 0) mask *= clamp(1 - rG / 60, 0.2, 1);
  return clamp(mask, 0, 1);
}

/**
 * 用 canvas filter 生成「模糊版本」用于磨皮（GPU 加速）。
 */
function blurredCanvas(source, blurPx) {
  const c = makeCanvas(source.width, source.height);
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(source, 0, 0, source.width, source.height);
  ctx.filter = 'none';
  return c;
}

/**
 * 核心渲染：把调整参数应用到 Image，返回处理后的 canvas。
 * @param {HTMLImageElement} img
 * @param {{adj?:object, portrait?:object}} opts
 * @param {number} maxDim
 */
export function renderEdited(img, {
  adj = {}, portrait = {}, mask = {}, wheels = {}, lut = null, lutStrength = 100,
  np3Grading = null, np3ToneCurve = null, curves = null,
} = {}, maxDim = 1100) {
  const A = { ...DEFAULT_ADJ, ...adj };
  const P = { ...DEFAULT_PORTRAIT, ...portrait };
  const M = { ...DEFAULT_MASK, ...mask };
  const W = { ...DEFAULT_WHEELS, ...wheels };
  const { w, h } = targetSize(img, maxDim);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  basicAdjust(imageData, A);
  applyToneCurve(imageData, A, np3ToneCurve, curves);
  applyColorMixer(imageData, A);
  applyDenoise(imageData, A);
  applyMask(imageData, M, w, h, M.type === 'brush' ? createBrushMaskCanvas(M, w, h) : null);
  applyColorWheels(imageData, W);
  applyNikonGrading(imageData, np3Grading);
  applyLut(imageData, lut, lutStrength);
  applyPortrait(imageData, A, P, canvas, w, h);
  ctx.putImageData(imageData, 0, 0);

  // 滤镜类最后叠加（基于已调好的图）
  overlayEffects(ctx, A, w, h);
  return canvas;
}

/**
 * 基础调色（按像素循环）。
 */
function basicAdjust(data, A) {
  const d = data.data;
  const n = d.length;
  const brightness = 1 + (num(A.exposure) / 100) * 0.9;
  const contrast = 1 + (num(A.contrast) / 100) * 1.4;
  const saturation = 1 + (num(A.saturation) / 100) * 1.6;
  const temp = num(A.temperature);
  const tint = num(A.tint);
  const hi = num(A.highlights), sh = num(A.shadows);
  const wh = num(A.whites), bl = num(A.blacks);
  const vib = num(A.vibrance) / 100;
  const fade = num(A.fade);
  const dehaze = num(A.dehaze) / 100;

  for (let i = 0; i < n; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];

    // 曝光
    r *= brightness; g *= brightness; b *= brightness;

    // 色温 / 色调
    r += temp * 0.25; g += -tint * 0.18 - temp * 0.02; b += -temp * 0.25 + tint * 0.18;

    // 对比度（绕 128）
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    // 去雾：轻微增强中低对比区域，并压低远景常见的蓝灰雾
    if (dehaze) {
      const dContrast = 1 + dehaze * 0.55;
      r = (r - 128) * dContrast + 128;
      g = (g - 128) * dContrast + 128;
      b = (b - 128) * dContrast + 128 - dehaze * 8;
    }

    // 饱和度
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    let sat = saturation;
    // 自然饱和度：低饱和像素提升更明显
    const baseSat = Math.max(r, g, b) - Math.min(r, g, b);
    const vibBoost = vib * (50 - baseSat) * 0.6;
    sat = clamp(sat + vibBoost / 100, 0, 2.2);
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;

    // 高光 / 阴影 / 白 / 黑（基于亮度）
    const l2 = r * 0.299 + g * 0.587 + b * 0.114;
    const hiW = clamp((l2 - 160) / 95, 0, 1);        // 高光权重
    const shW = clamp((90 - l2) / 90, 0, 1);          // 阴影权重
    const whW = clamp((l2 - 200) / 55, 0, 1);         // 白点权重
    const blW = clamp((60 - l2) / 60, 0, 1);          // 黑点权重
    const delta = hi * 0.9 * hiW + sh * 0.9 * shW + wh * 0.7 * whW - (bl * 0.7 * blW);
    r += delta; g += delta; b += delta;

    // 褪色：抬升黑位（亮部不变，暗部变灰）
    if (fade) {
      const f = fade / 100 * 26;
      r = r + f * (1 - clamp(l2 / 255, 0, 1));
      g = g + f * (1 - clamp(l2 / 255, 0, 1));
      b = b + f * (1 - clamp(l2 / 255, 0, 1));
    }

    // 清晰度：局部对比（用原图与模糊的差异）——这里用简单的高斯近似（中心增益）
    // 清晰度在 overlayEffects 里用 unsharp 处理更省，这里只保留基础。

    d[i] = clamp(r, 0, 255);
    d[i + 1] = clamp(g, 0, 255);
    d[i + 2] = clamp(b, 0, 255);
  }

  // 锐化 / 清晰度做局部对比（unsharp mask）
  if (num(A.sharpen) !== 0 || num(A.clarity) !== 0 || num(A.texture) !== 0) {
    applyUnsharp(data, num(A.sharpen), num(A.clarity), num(A.texture));
  }
}

/**
 * unsharp mask：锐化 = 原图 - 模糊；清晰度 = 增加局部对比（同样用 unsharp，但加权不同）。
 */
function applyUnsharp(data, sharpen, clarity, texture = 0) {
  // 只对已 putImageData 前做，read back 一次
  // 这里直接对传入 data 做轻卷积（3x3 拉普拉斯）
  const w = data.width, h = data.height;
  const src = new Uint8ClampedArray(data.data);
  const strong = clamp(sharpen / 100, -1, 1);
  const clear = clamp(clarity / 100, -1, 1);
  const tex = clamp(texture / 100, -1, 1);
  const amount = strong * 0.7 + clear * 0.9 + tex * 0.65;
  if (Math.abs(amount) < 0.001) return;

  const p = src;
  const out = data.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const l = (y * w + (x - 1)) * 4, r = (y * w + (x + 1)) * 4;
      const u = ((y - 1) * w + x) * 4, d = ((y + 1) * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const idx = i + c;
        const lap = 4 * p[idx] - p[l + c] - p[r + c] - p[u + c] - p[d + c];
        out[idx] = clamp(p[idx] + amount * lap * 0.35, 0, 255);
      }
    }
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Fritsch-Carlson monotone cubic interpolation. It follows the same principle
 * as professional tone-curve editors: control points are interpolated without
 * overshoot, so moving one tonal region cannot create accidental clipping or
 * oscillation in neighbouring regions.
 */
export function buildChannelCurveLut(offsets = [0, 0, 0, 0, 0]) {
  const xs = [0, 0.25, 0.5, 0.75, 1];
  const ys = xs.map((x, index) => clamp01(x + (Number(offsets[index]) || 0) * 0.005));
  const n = xs.length;
  const h = xs.slice(1).map((x, index) => x - xs[index]);
  const delta = h.map((step, index) => (ys[index + 1] - ys[index]) / step);
  const slopes = new Array(n).fill(0);
  slopes[0] = delta[0];
  slopes[n - 1] = delta[n - 2];
  for (let index = 1; index < n - 1; index += 1) {
    if (delta[index - 1] * delta[index] <= 0) {
      slopes[index] = 0;
    } else {
      const w1 = 2 * h[index] + h[index - 1];
      const w2 = h[index] + 2 * h[index - 1];
      slopes[index] = (w1 + w2) / (w1 / delta[index - 1] + w2 / delta[index]);
    }
  }

  const lut = new Uint8Array(256);
  for (let sample = 0; sample < 256; sample += 1) {
    const xValue = sample / 255;
    let interval = 0;
    while (interval < n - 2 && xValue > xs[interval + 1]) interval += 1;
    const t = (xValue - xs[interval]) / h[interval];
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const value = h00 * ys[interval]
      + h10 * h[interval] * slopes[interval]
      + h01 * ys[interval + 1]
      + h11 * h[interval] * slopes[interval + 1];
    lut[sample] = Math.round(clamp01(value) * 255);
  }
  return lut;
}

function isIdentityCurve(offsets = []) {
  return offsets.every(value => !Number(value));
}

function applyToneCurve(imageData, A, np3ToneCurve = null, curves = null) {
  const black = num(A.toneBlack), shadow = num(A.toneShadow), mid = num(A.toneMid);
  const highlight = num(A.toneHighlight), white = num(A.toneWhite);
  const hasNp3Curve = Array.isArray(np3ToneCurve) && np3ToneCurve.length >= 257;
  const hasChannelCurves = curves && ['red', 'green', 'blue'].some(key => !isIdentityCurve(curves[key] || []));
  if (!hasNp3Curve && !hasChannelCurves && !black && !shadow && !mid && !highlight && !white) return;

  const rgbOffsets = curves?.rgb || [black, shadow, mid, highlight, white];
  const rgbLut = buildChannelCurveLut(rgbOffsets);
  const channelLuts = curves
    ? {
        red: buildChannelCurveLut(curves.red || [0, 0, 0, 0, 0]),
        green: buildChannelCurveLut(curves.green || [0, 0, 0, 0, 0]),
        blue: buildChannelCurveLut(curves.blue || [0, 0, 0, 0, 0]),
      }
    : null;

  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    if (hasNp3Curve) {
      const source = clamp(Math.round((lum / 255) * 256), 0, 256);
      const target = clamp(num(np3ToneCurve[source], source / 256 * 32767) / 32767 * 255, 0, 255);
      const curveDelta = target - lum;
      d[i] = clamp(d[i] + curveDelta, 0, 255);
      d[i + 1] = clamp(d[i + 1] + curveDelta, 0, 255);
      d[i + 2] = clamp(d[i + 2] + curveDelta, 0, 255);
    }
    if (hasNp3Curve || hasChannelCurves) {
      const sourceR = clamp(Math.round(d[i]), 0, 255);
      const sourceG = clamp(Math.round(d[i + 1]), 0, 255);
      const sourceB = clamp(Math.round(d[i + 2]), 0, 255);
      if (channelLuts) {
        d[i] = channelLuts.red[rgbLut[sourceR]];
        d[i + 1] = channelLuts.green[rgbLut[sourceG]];
        d[i + 2] = channelLuts.blue[rgbLut[sourceB]];
      } else {
        d[i] = rgbLut[sourceR];
        d[i + 1] = rgbLut[sourceG];
        d[i + 2] = rgbLut[sourceB];
      }
    } else {
      const wb = clamp((45 - lum) / 45, 0, 1);
      const ws = clamp(1 - Math.abs(lum - 85) / 55, 0, 1);
      const wm = clamp(1 - Math.abs(lum - 142) / 64, 0, 1);
      const wh = clamp(1 - Math.abs(lum - 198) / 55, 0, 1);
      const ww = clamp((lum - 215) / 40, 0, 1);
      const delta = wb * black * 0.45 + ws * shadow * 0.55 + wm * mid * 0.45 + wh * highlight * 0.55 + ww * white * 0.5;
      d[i] = clamp(d[i] + delta, 0, 255);
      d[i + 1] = clamp(d[i + 1] + delta, 0, 255);
      d[i + 2] = clamp(d[i + 2] + delta, 0, 255);
    }
  }
}

function applyNikonGrading(imageData, grading) {
  if (!grading || (!grading.shadows && !grading.midTone && !grading.highlights)) return;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    const shadowWeight = Math.pow(1 - lum, 2);
    const midWeight = Math.max(0, 1 - Math.abs(lum - 0.5) * 2);
    const highlightWeight = lum * lum;
    for (const [region, weight] of [
      [grading.shadows, shadowWeight],
      [grading.midTone, midWeight],
      [grading.highlights, highlightWeight],
    ]) {
      if (!region || weight <= 0) continue;
      d[i] = clamp(d[i] + (region.r || 0) * weight * 255, 0, 255);
      d[i + 1] = clamp(d[i + 1] + (region.g || 0) * weight * 255, 0, 255);
      d[i + 2] = clamp(d[i + 2] + (region.b || 0) * weight * 255, 0, 255);
    }
  }
}

const COLOR_MIX_ANCHORS = [
  ['red', 0], ['orange', 32], ['yellow', 60], ['green', 120], ['cyan', 180], ['blue', 220], ['purple', 285], ['magenta', 320],
];

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h;
  if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / delta + 2) * 60;
  else h = ((r - g) / delta + 4) * 60;
  return [h, s, l];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const gray = l * 255;
    return [gray, gray, gray];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hueToRgb(p, q, h + 1 / 3) * 255,
    hueToRgb(p, q, h) * 255,
    hueToRgb(p, q, h - 1 / 3) * 255,
  ];
}

function applyColorMixer(imageData, A) {
  const active = COLOR_MIX_ANCHORS.some(([key]) =>
    num(A[`${key}Hue`]) || num(A[`${key}Sat`]) || num(A[`${key}Lum`])
  );
  if (!active) return;

  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (s < 0.04) continue;
    let hueShift = 0;
    let satScale = 1;
    let lightShift = 0;
    for (const [key, anchor] of COLOR_MIX_ANCHORS) {
      const dist = hueDistance(h, anchor);
      const weight = clamp(1 - dist / 58, 0, 1);
      if (!weight) continue;
      hueShift += weight * (num(A[`${key}Hue`]) / 100) * 42;
      satScale += weight * (num(A[`${key}Sat`]) / 100) * 0.9;
      lightShift += weight * (num(A[`${key}Lum`]) / 100) * 0.34;
    }
    const [r, g, b] = hslToRgb(h + hueShift, clamp(s * satScale, 0, 1), clamp(l + lightShift, 0, 1));
    d[i] = clamp(r, 0, 255);
    d[i + 1] = clamp(g, 0, 255);
    d[i + 2] = clamp(b, 0, 255);
  }
}

function applyDenoise(imageData, A) {
  const strength = clamp(num(A.denoise) / 100, 0, 1);
  if (strength <= 0.001) return;
  const w = imageData.width, h = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const out = imageData.data;
  const amount = strength * 0.62;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const neighbors = [
        ((y - 1) * w + x) * 4,
        ((y + 1) * w + x) * 4,
        (y * w + x - 1) * 4,
        (y * w + x + 1) * 4,
      ];
      for (let c = 0; c < 3; c++) {
        const center = src[i + c];
        let sum = 0, weight = 0;
        for (const ni of neighbors) {
          const diff = Math.abs(center - src[ni + c]);
          const edgeWeight = clamp(1 - diff / 52, 0.12, 1);
          sum += src[ni + c] * edgeWeight;
          weight += edgeWeight;
        }
        const avg = weight ? sum / weight : center;
        out[i + c] = center * (1 - amount) + avg * amount;
      }
    }
  }
}

function smoothMask(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function createBrushMaskCanvas(M, w, h) {
  const strokes = Array.isArray(M.brushStrokes) ? M.brushStrokes : [];
  if (!strokes.length) return null;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const shortSide = Math.min(w, h);
  for (const stroke of strokes) {
    const points = Array.isArray(stroke?.points) ? stroke.points : [];
    if (!points.length) continue;
    const width = Math.max(2, shortSide * clamp(num(stroke.size, M.brushSize || 18), 1, 100) / 100);
    const feather = clamp(num(stroke.feather, M.brushFeather || 45), 0, 100) / 100;
    ctx.globalAlpha = clamp(num(stroke.opacity, M.brushOpacity || 80), 1, 100) / 100;
    ctx.lineWidth = width;
    ctx.shadowColor = 'rgba(255,255,255,0.95)';
    ctx.shadowBlur = width * feather * 0.8;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = clamp(num(point.x, 0), 0, 1) * (w - 1);
      const y = clamp(num(point.y, 0), 0, 1) * (h - 1);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (points.length === 1) {
      const p = points[0];
      ctx.beginPath();
      ctx.arc(clamp(num(p.x, 0), 0, 1) * (w - 1), clamp(num(p.y, 0), 0, 1) * (h - 1), width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  return ctx.getImageData(0, 0, w, h);
}

function applyMask(imageData, M, w, h, brushMask = null) {
  if (M.type === 'none') return;
  const exposure = num(M.exposure);
  const contrast = num(M.contrast);
  const saturation = num(M.saturation);
  const temperature = num(M.temperature);
  if (!exposure && !contrast && !saturation && !temperature) return;

  const d = imageData.data;
  const cx = clamp(num(M.centerX, 50), 0, 100) / 100;
  const cy = clamp(num(M.centerY, 50), 0, 100) / 100;
  const radius = Math.max(0.05, clamp(num(M.radius, 38), 5, 100) / 100);
  const feather = clamp(num(M.feather, 48), 0, 100) / 100;
  const angle = (num(M.angle, 0) * Math.PI) / 180;
  const position = clamp(num(M.position, 50), 0, 100) / 100;
  const aspect = w / Math.max(1, h);
  const shortSide = Math.min(w, h);
  const brightness = 1 + (exposure / 100) * 0.9;
  const contrastScale = 1 + (contrast / 100) * 1.3;
  const saturationScale = 1 + (saturation / 100) * 1.5;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / Math.max(1, w - 1);
      const ny = y / Math.max(1, h - 1);
      let weight;
      if (M.type === 'radial') {
        const dx = (nx - cx) * aspect * shortSide;
        const dy = (ny - cy) * shortSide;
        const distance = clamp(Math.sqrt(dx * dx + dy * dy) / (radius * shortSide), 0, 1.5);
        const edge = Math.max(0.001, feather);
        weight = 1 - smoothMask((distance - (1 - edge)) / edge);
      } else if (M.type === 'linear') {
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const projected = 0.5 + dx * Math.cos(angle) + dy * Math.sin(angle);
        const edge = Math.max(0.04, feather * 1.2);
        weight = smoothMask((projected - (position - edge)) / (edge * 2));
      } else if (M.type === 'brush') {
        if (!brushMask) continue;
        weight = brushMask.data[(y * w + x) * 4] / 255;
      } else {
        continue;
      }
      if (M.invert) weight = 1 - weight;
      if (weight <= 0.001) continue;

      const i = (y * w + x) * 4;
      let r = d[i] * brightness;
      let g = d[i + 1] * brightness;
      let b = d[i + 2] * brightness;
      r += temperature * 0.34;
      g += temperature * 0.02;
      b -= temperature * 0.34;
      r = (r - 128) * contrastScale + 128;
      g = (g - 128) * contrastScale + 128;
      b = (b - 128) * contrastScale + 128;
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      r = lum + (r - lum) * saturationScale;
      g = lum + (g - lum) * saturationScale;
      b = lum + (b - lum) * saturationScale;

      d[i] = d[i] * (1 - weight) + clamp(r, 0, 255) * weight;
      d[i + 1] = d[i + 1] * (1 - weight) + clamp(g, 0, 255) * weight;
      d[i + 2] = d[i + 2] * (1 - weight) + clamp(b, 0, 255) * weight;
    }
  }
}

function applyColorWheels(imageData, W) {
  const hasWheels = ['liftX', 'liftY', 'gammaX', 'gammaY', 'gainX', 'gainY'].some(key => num(W[key]));
  if (!hasWheels) return;
  const d = imageData.data;
  const liftX = num(W.liftX) / 100;
  const liftY = num(W.liftY) / 100;
  const gammaX = num(W.gammaX) / 100;
  const gammaY = num(W.gammaY) / 100;
  const gainX = num(W.gainX) / 100;
  const gainY = num(W.gainY) / 100;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const shadowWeight = Math.pow(1 - lum, 2);
    const midWeight = Math.max(0, 1 - Math.abs(lum - 0.5) * 2);
    const highWeight = lum * lum;

    r += (0.45 * liftX + 0.45 * liftY) * 0.34 * shadowWeight;
    g += (-0.45 * liftX + 0.45 * liftY) * 0.34 * shadowWeight;
    b += (-0.25 * liftX - 0.55 * liftY) * 0.34 * shadowWeight;

    const gammaR = (0.45 * gammaX + 0.45 * gammaY) * 0.22 * midWeight;
    const gammaG = (-0.45 * gammaX + 0.45 * gammaY) * 0.22 * midWeight;
    const gammaB = (-0.25 * gammaX - 0.55 * gammaY) * 0.22 * midWeight;
    r = Math.pow(clamp(r, 0, 1), 1 / Math.max(0.2, 1 + gammaR));
    g = Math.pow(clamp(g, 0, 1), 1 / Math.max(0.2, 1 + gammaG));
    b = Math.pow(clamp(b, 0, 1), 1 / Math.max(0.2, 1 + gammaB));

    r *= 1 + (0.45 * gainX + 0.45 * gainY) * 0.25 * highWeight;
    g *= 1 + (-0.45 * gainX + 0.45 * gainY) * 0.25 * highWeight;
    b *= 1 + (-0.25 * gainX - 0.55 * gainY) * 0.25 * highWeight;
    d[i] = clamp(r * 255, 0, 255);
    d[i + 1] = clamp(g * 255, 0, 255);
    d[i + 2] = clamp(b * 255, 0, 255);
  }
}

export function parseCubeLut(text) {
  const lines = String(text || '').split(/\r?\n/);
  const values = [];
  let size = 0;
  let title = 'LUT';
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE')) {
      title = line.replace(/^TITLE\s*/i, '').replace(/^"|"$/g, '') || title;
      continue;
    }
    if (upper.startsWith('LUT_3D_SIZE')) {
      size = Number.parseInt(line.split(/\s+/)[1], 10) || 0;
      continue;
    }
    if (upper.startsWith('DOMAIN_MIN')) {
      domainMin = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (upper.startsWith('DOMAIN_MAX')) {
      domainMax = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (/^[-+.\deE]+\s+[-+.\deE]+\s+[-+.\deE]+/.test(line)) {
      const parts = line.split(/\s+/).slice(0, 3).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) values.push(...parts);
    }
  }
  const expected = size * size * size * 3;
  if (!size || size < 2 || size > 65 || values.length !== expected) {
    throw new Error(`LUT 数据无效：尺寸 ${size || '未知'}，需要 ${expected || 0} 个数值，实际 ${values.length}`);
  }
  return {
    title,
    size,
    domainMin,
    domainMax,
    data: new Float32Array(values),
  };
}

function applyLut(imageData, lut, strengthValue) {
  if (!lut?.data || !lut.size) return;
  const strength = clamp(num(strengthValue, 100), 0, 100) / 100;
  if (strength <= 0.001) return;
  const d = imageData.data;
  const size = lut.size;
  const maxIndex = size - 1;
  const domainMin = lut.domainMin || [0, 0, 0];
  const domainMax = lut.domainMax || [1, 1, 1];
  const span = domainMax.map((value, index) => Math.max(1e-6, value - domainMin[index]));
  const sample = (r, g, b, channel) => {
    const index = ((b * size + g) * size + r) * 3 + channel;
    return lut.data[index] ?? 0;
  };
  const lerp = (a, b, t) => a + (b - a) * t;

  for (let i = 0; i < d.length; i += 4) {
    const nr = clamp((d[i] / 255 - domainMin[0]) / span[0], 0, 1) * maxIndex;
    const ng = clamp((d[i + 1] / 255 - domainMin[1]) / span[1], 0, 1) * maxIndex;
    const nb = clamp((d[i + 2] / 255 - domainMin[2]) / span[2], 0, 1) * maxIndex;
    const r0 = Math.floor(nr), g0 = Math.floor(ng), b0 = Math.floor(nb);
    const r1 = Math.min(maxIndex, r0 + 1), g1 = Math.min(maxIndex, g0 + 1), b1 = Math.min(maxIndex, b0 + 1);
    const rt = nr - r0, gt = ng - g0, bt = nb - b0;
    for (let channel = 0; channel < 3; channel++) {
      const c00 = lerp(sample(r0, g0, b0, channel), sample(r1, g0, b0, channel), rt);
      const c10 = lerp(sample(r0, g1, b0, channel), sample(r1, g1, b0, channel), rt);
      const c01 = lerp(sample(r0, g0, b1, channel), sample(r1, g0, b1, channel), rt);
      const c11 = lerp(sample(r0, g1, b1, channel), sample(r1, g1, b1, channel), rt);
      const c0 = lerp(c00, c10, gt);
      const c1 = lerp(c01, c11, gt);
      const value = clamp(lerp(c0, c1, bt) * 255, 0, 255);
      d[i + channel] = d[i + channel] * (1 - strength) + value * strength;
    }
  }
}

/**
 * 人像精修：皮肤掩码 + 模糊磨皮 + 肤色/唇色/牙齿等微调。
 */
function applyPortrait(imageData, A, P, canvas, w, h) {
  const smooth = num(P.smooth);
  const whiten = num(P.whiten);
  const rosy = num(P.rosy);
  const skinB = num(P.skinBrighten);
  const blemish = num(P.blemish);
  const teethW = num(P.teethWhite);
  const lip = num(P.lipColor);
  const eye = num(P.eyeLarge);
  const slim = num(P.faceSlim);

  if (!smooth && !whiten && !rosy && !skinB && !blemish && !teethW && !lip && !eye && !slim) return;

  const d = imageData.data;
  const n = d.length;
  const blurAmount = (smooth + blemish) / 100;

  // 磨皮：需要模糊版本，只有 smooth/blemish > 0 才生成本地模糊图
  let blurred = null;
  if (blurAmount > 0.01) {
    blurred = blurredCanvas(canvas, Math.max(1, Math.round((blurAmount) * 6)));
    const bctx = blurred.getContext('2d');
    const bd = bctx.getImageData(0, 0, w, h).data;

    // 融合（皮肤掩码加权）
    for (let i = 0; i < n; i += 4) {
      const mask = skinMaskAt(d, i);
      if (mask <= 0) continue;
      const a = clamp(mask * blurAmount * 0.9, 0, 0.92);
      d[i] = d[i] * (1 - a) + bd[i] * a;
      d[i + 1] = d[i + 1] * (1 - a) + bd[i + 1] * a;
      d[i + 2] = d[i + 2] * (1 - a) + bd[i + 2] * a;
    }
  }

  // 肤色整体微调：美白/提亮/红润/牙齿/唇色
  for (let i = 0; i < n; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const mask = skinMaskAt(d, i);
    const lum = r * 0.299 + g * 0.587 + b * 0.114;

    // 美白（肤色 + 高光提亮）
    if (whiten || skinB) {
      const w = (whiten * 0.35 + skinB * 0.3) / 100;
      r += w * 60 * (1 - clamp((255 - lum) / 120, 0, 1));
      g += w * 60 * (1 - clamp((255 - lum) / 120, 0, 1));
      b += w * 70 * (1 - clamp((255 - lum) / 120, 0, 1));
    }
    // 红润（肤色加暖红）
    if (rosy && mask > 0.2) {
      const a = (rosy / 100) * 0.5 * mask;
      r += a * 26; g += a * 2; b -= a * 4;
    }
    // 唇色（暖红，偏嘴部中高光 + 肤色）
    if (lip) {
      const a = (lip / 100) * 0.4 * mask * clamp((90 - Math.abs(lum - 120)) / 90, 0, 1);
      r += a * 30; g -= a * 4; b -= a * 4;
    }
    // 牙齿美白（极高亮、低饱和像素提亮）
    if (teethW && lum > 195) {
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat < 45) {
        const a = (teethW / 100) * 0.5;
        r += a * 22; g += a * 24; b += a * 26;
      }
    }
    // 大眼（演示近似：眼睛通常在上中区域，做局部轻微锐化 + 高光）
    if (eye) {
      const a = (eye / 100);
      // 眼眶区域（上 1/3，中央）轻微提亮，其余不动
      const px = (i / 4) % w, py = Math.floor((i / 4) / w);
      const inEye = py < h * 0.45 && px > w * 0.2 && px < w * 0.8;
      if (inEye) {
        r += a * 8; g += a * 8; b += a * 8;
      }
    }
    // 瘦脸（演示近似：画面两侧轻微压暗成"脸颊收紧"的视觉）
    if (slim) {
      const px = (i / 4) % w;
      const side = clamp(Math.abs(px - w / 2) / (w / 2), 0, 1);
      const a = (slim / 100) * 0.12 * side;
      r -= a * 34; g -= a * 34; b -= a * 34;
    }

    // 瑕疵（近似：压暗/柔化肤色区域的小瑕疵，轻微提亮整体）

    d[i] = clamp(r, 0, 255);
    d[i + 1] = clamp(g, 0, 255);
    d[i + 2] = clamp(b, 0, 255);
  }
}

/**
 * 滤镜类叠加（暗角 / 颗粒），在 putImageData 后绘制。
 */
function overlayEffects(ctx, A, w, h) {
  const vig = clamp(num(A.vignette), 0, 100);
  const grain = clamp(num(A.grain), 0, 100);

  if (vig) {
    const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${(vig / 100) * 0.55})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  if (grain) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const amt = (grain / 100) * 34;
    for (let i = 0; i < d.length; i += 4) {
      const no = (Math.random() - 0.5) * amt;
      d[i] += no; d[i + 1] += no; d[i + 2] += no;
    }
    ctx.putImageData(img, 0, 0);
  }
}

/**
 * 对外：渲染预览图片。
 */
export async function renderPreview(src, params, maxDim = 1100) {
  const img = await loadImage(src);
  return renderEdited(img, params, maxDim);
}

/**
 * 对外：导出成品（加强尺寸并转 JPEG data URL）。
 */
export async function exportEdited(src, params, quality = 0.92, maxDim = 2600) {
  const img = await loadImage(src);
  const canvas = renderEdited(img, params, maxDim);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * 生成适合作为「演示相机」的示例照片（纯本地 canvas 生成，无需真机）。
 */
export function generateSample(type = 'portrait', w = 960, h = 1280) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, w, h);

  if (type === 'portrait') {
    grd.addColorStop(0, '#f3e3d8'); grd.addColorStop(0.5, '#e8c9b5'); grd.addColorStop(1, '#caa98f');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,80,60,0.25)';
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.55, h * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.28, h * 0.1, 0, Math.PI * 2); ctx.fill();
    // 眼睛
    ctx.fillStyle = '#3a2a24';
    ctx.beginPath(); ctx.arc(w * 0.42, h * 0.28, w * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.58, h * 0.28, w * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,40,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.34, w * 0.05, 0.2, Math.PI - 0.2); ctx.stroke();
    // 头发
    ctx.fillStyle = 'rgba(50,30,20,0.8)';
    ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.2, w * 0.14, h * 0.09, 0, Math.PI, 0); ctx.fill();
    // 身体
    ctx.fillStyle = '#9ec9b0';
    ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.85, w * 0.32, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'landscape') {
    grd.addColorStop(0, '#8fc9e8'); grd.addColorStop(0.55, '#cfe8f2'); grd.addColorStop(0.6, '#6fae77'); grd.addColorStop(1, '#3f7d55');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 8; i++) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(w * (0.2 + i * 0.1), h * 0.14, w * 0.06, h * 0.03, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    // 山
    ctx.fillStyle = '#5a8b60';
    ctx.beginPath(); ctx.moveTo(0, h * 0.6); ctx.lineTo(w * 0.3, h * 0.35); ctx.lineTo(w * 0.6, h * 0.62); ctx.fill();
    ctx.fillStyle = '#3f7d55';
    ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.6); ctx.lineTo(w * 0.85, h * 0.32); ctx.lineTo(w, h * 0.62); ctx.fill();
    // 湖
    ctx.fillStyle = '#a8d8e8'; ctx.fillRect(0, h * 0.62, w, h * 0.38);
  } else if (type === 'night') {
    grd.addColorStop(0, '#0a1230'); grd.addColorStop(1, '#1b2f6a');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    // 城市
    ctx.fillStyle = '#05070f';
    for (let i = 0; i < 14; i++) { const bw = w * 0.06, bx = i * w * 0.075, bh = h * (0.2 + Math.random() * 0.3); ctx.fillRect(bx, h - bh, bw, bh); }
    // 灯
    ctx.fillStyle = '#ffd27f';
    for (let i = 0; i < 100; i++) { ctx.globalAlpha = 0.4 + Math.random() * 0.6; ctx.fillRect(Math.random() * w, h * (0.5 + Math.random() * 0.5), 3, 3); }
    ctx.globalAlpha = 1;
    // 星星
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 90; i++) { ctx.globalAlpha = 0.5 + Math.random() * 0.5; ctx.fillRect(Math.random() * w, Math.random() * h * 0.5, 2, 2); }
    ctx.globalAlpha = 1;
  } else if (type === 'bridge') {
    grd.addColorStop(0, '#3b4a6b'); grd.addColorStop(1, '#c9a55a');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
    // 桥塔
    ctx.fillStyle = '#22304d'; ctx.fillRect(w * 0.15, h * 0.2, w * 0.04, h * 0.7); ctx.fillRect(w * 0.8, h * 0.2, w * 0.04, h * 0.7);
    // 桥面
    ctx.fillStyle = '#2a3a5a'; ctx.fillRect(0, h * 0.62, w, h * 0.06);
    // 缆索
    ctx.strokeStyle = '#d8c48a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w * 0.17, h * 0.2); ctx.quadraticCurveTo(w * 0.5, h * 0.5, w * 0.82, h * 0.2); ctx.stroke();
    // 水面
    ctx.fillStyle = 'rgba(80,150,170,0.5)'; ctx.fillRect(0, h * 0.7, w, h * 0.3);
  } else {
    // 通用渐变
    grd.addColorStop(0, '#5b6b8a'); grd.addColorStop(1, '#c9b28a');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
  }

  // 加一点柔和光感/标签
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.ellipse(w * 0.7, h * 0.1, w * 0.4, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  return c.toDataURL('image/jpeg', 0.9);
}
