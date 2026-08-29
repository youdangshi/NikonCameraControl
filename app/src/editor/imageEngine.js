/**
 * 画布修图引擎
 *
 * 在浏览器/手机端用 <canvas> 完成「调色 + 人像精修」，不依赖远程模型：
 *   - 基础调色：曝光/对比/高光/阴影/白/黑/色温/色调/饱和/自然饱和/清晰/锐化/暗角/颗粒/褪色
 *   - 人像精修：磨皮/美白/红润/肤色提亮/瑕疵/牙齿/唇色 +（演示近似）大眼/瘦脸
 *   - stylePreset 可直接套用 STYLE_PRESETS 里的预设
 *
 * 出于性能考虑：预览按 maxDim=1100 处理，导出按 maxDim=2600。
 */

import { DEFAULT_ADJ, DEFAULT_PORTRAIT } from './presets.js';

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
export function renderEdited(img, { adj = {}, portrait = {} } = {}, maxDim = 1100) {
  const A = { ...DEFAULT_ADJ, ...adj };
  const P = { ...DEFAULT_PORTRAIT, ...portrait };
  const { w, h } = targetSize(img, maxDim);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  basicAdjust(imageData, A);
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
  if (num(A.sharpen) !== 0 || num(A.clarity) !== 0) {
    applyUnsharp(data, num(A.sharpen), num(A.clarity));
  }
}

/**
 * unsharp mask：锐化 = 原图 - 模糊；清晰度 = 增加局部对比（同样用 unsharp，但加权不同）。
 */
function applyUnsharp(data, sharpen, clarity) {
  // 只对已 putImageData 前做，read back 一次
  // 这里直接对传入 data 做轻卷积（3x3 拉普拉斯）
  const w = data.width, h = data.height;
  const src = new Uint8ClampedArray(data.data);
  const strong = clamp(sharpen / 100, -1, 1);
  const clear = clamp(clarity / 100, -1, 1);
  const amount = strong * 0.7 + clear * 0.9;
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
