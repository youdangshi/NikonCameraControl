/**
 * 修图风格预设 + 人像精修步骤 + 按题材的修图指南
 *
 * 这套数据直接把"修图要怎么做"整理进软件：
 *   - STYLE_PRESETS    一键可套用的风格预设（对应不同照片题材）
 *   - PORTRAIT_STEPS   人像精修的规范步骤（磨皮→修瑕疵→提亮→唇色…）
 *   - GENRE_GUIDE      按摄影题材整理的修图原则（人像/风光/夜景/星空/桥梁…）
 *
 * 参数取值范围统一为 -100 ~ 100（vignette / fade 为 0 ~ 100）。
 */

// ─── 通用风格预设 ─────────────────────────────
export const STYLE_PRESETS = [
  {
    id: 'portrait_soft',
    name: '人像·奶油',
    category: '人像',
    desc: '低对比 + 提亮肤色 + 轻微磨皮，适合肤色偏冷、要通透感的女生像。',
    params: { exposure: 6, contrast: -14, highlights: -10, shadows: 18, temperature: 4, tint: 6, saturation: -4, vibrance: 8, clarity: -10, sharpen: 6, vignette: 12, fade: 8 },
  },
  {
    id: 'portrait_ao',
    name: '人像·胶片',
    category: '人像',
    desc: '暖调 + 颗粒 + 褪色，还原胶片人像的温润质感。',
    params: { exposure: 4, contrast: -6, highlights: -8, shadows: 10, temperature: 12, tint: -4, saturation: -8, vibrance: 4, clarity: -6, sharpen: 8, vignette: 16, grain: 22, fade: 16 },
  },
  {
    id: 'portrait_clean',
    name: '人像·清透',
    category: '人像',
    desc: '压高光 + 提阴影 + 微调色温，还原真实肤色的净透表达。',
    params: { exposure: 2, contrast: -4, highlights: -16, shadows: 22, temperature: 2, tint: 2, saturation: -6, vibrance: 10, clarity: -8, sharpen: 10, vignette: 8, fade: 6 },
  },
  {
    id: 'landscape_vivid',
    name: '风光·鲜亮',
    category: '风光',
    desc: '高饱和度 + 清晰度 + 暗角，让天空和植被更鲜明有层次。',
    params: { exposure: 4, contrast: 12, highlights: -14, shadows: 16, temperature: -4, tint: 4, saturation: 16, vibrance: 18, clarity: 20, sharpen: 14, vignette: 18 },
  },
  {
    id: 'landscape_golden',
    name: '风光·金色时刻',
    category: '风光',
    desc: '暖色温 + 低对比 + 柔光，重现清晨与黄昏的黄金光。',
    params: { exposure: 6, contrast: -4, highlights: -12, shadows: 14, temperature: 22, tint: -2, saturation: 6, vibrance: 12, clarity: 8, sharpen: 10, vignette: 14, fade: 6 },
  },
  {
    id: 'night_city',
    name: '夜景·城市霓虹',
    category: '夜景',
    desc: '高对比 + 冷调 + 拉高阴影保留细节，霓虹灯更通透。',
    params: { exposure: 6, contrast: 16, highlights: -10, shadows: 30, temperature: -16, tint: 12, saturation: 14, vibrance: 10, clarity: 18, sharpen: 16, vignette: 20 },
  },
  {
    id: 'night_stars',
    name: '星空·银河',
    category: '星空',
    desc: '降噪 + 提亮暗部 + 蓝色调，突出星点与银河。',
    params: { exposure: 8, contrast: 8, highlights: -20, shadows: 32, temperature: -12, tint: 8, saturation: 6, vibrance: 8, clarity: 14, sharpen: 12, vignette: 24, grain: 18 },
  },
  {
    id: 'bridge_arch',
    name: '建筑·桥梁',
    category: '建筑桥梁',
    desc: '拉直透视 + 强清晰度 + 冷钢色，突出线条与结构。',
    params: { exposure: -2, contrast: 22, highlights: -8, shadows: 18, temperature: -10, tint: 6, saturation: -6, vibrance: 8, clarity: 26, sharpen: 30, vignette: 16 },
  },
  {
    id: 'food_fresh',
    name: '美食·鲜诱',
    category: '美食',
    desc: '提亮 + 饱和 + 暖色，让食物更有食欲感。',
    params: { exposure: 8, contrast: 6, highlights: -8, shadows: 12, temperature: 8, tint: 6, saturation: 18, vibrance: 16, clarity: 12, sharpen: 14, vignette: 16 },
  },
  {
    id: 'film_classic',
    name: '胶片·复古',
    category: '胶片',
    desc: '褪色 + 颗粒 + 暖青对比，万能复古胶片感。',
    params: { exposure: 2, contrast: -10, highlights: -12, shadows: 16, temperature: 10, tint: -8, saturation: -12, vibrance: 4, clarity: -4, sharpen: 6, vignette: 18, grain: 30, fade: 22 },
  },
  {
    id: 'japanese_fresh',
    name: '日系·空气',
    category: '日系',
    desc: '拉伸提亮 + 低对比 + 青蓝微调，干净通透的日系氛围。',
    params: { exposure: 10, contrast: -18, highlights: -16, shadows: 26, temperature: -8, tint: 8, saturation: -10, vibrance: 6, clarity: -8, sharpen: 8, vignette: 8, fade: 20 },
  },
  {
    id: 'bw_drama',
    name: '黑白·戏剧',
    category: '黑白',
    desc: '高对比 + 强颗粒 + 暗角，压出情绪与光影。',
    params: { exposure: 0, contrast: 30, highlights: -14, shadows: 22, temperature: 0, tint: 0, saturation: -100, vibrance: -100, clarity: 24, sharpen: 22, vignette: 26, grain: 34, fade: 4 },
  },
  {
    id: 'cinema_teal',
    name: '电影·青橙',
    category: '电影',
    desc: '压缩高光 + 青橙分离，经典电影调色。',
    params: { exposure: 4, contrast: 18, highlights: -24, shadows: 18, temperature: -6, tint: 10, saturation: -6, vibrance: 8, clarity: 16, sharpen: 14, vignette: 22, fade: 14 },
  },
  {
    id: 'street_snapshot',
    name: '街拍·纪实',
    category: '街拍',
    desc: '自然色 + 轻对比 + 颗粒，保留真实现场的质感。',
    params: { exposure: 4, contrast: 4, highlights: -10, shadows: 14, temperature: 2, tint: 2, saturation: -2, vibrance: 8, clarity: 12, sharpen: 12, vignette: 10, grain: 18, fade: 8 },
  },
];

// ─── 人像精修步骤（软件内「知识库」） ─────────────
export const PORTRAIT_STEPS = [
  { key: 'base', name: '基础校正', desc: '先校白平衡与曝光：压掉过曝高光、提回暗部阴影，让肤色中性不发灰。', params: { exposure: 2, contrast: -4, highlights: -14, shadows: 18, temperature: 2, tint: 2 } },
  { key: 'smooth', name: '肤质平滑', desc: '对肤色区域做模糊叠加（磨皮），保留眼睛、发丝等细节，避免塑料脸。', params: { smooth: 40 } },
  { key: 'blemish', name: '瑕疵提亮', desc: '压暗痘印、提亮黑眼圈（近似：柔化中高光并轻微提亮肤色）。', params: { blemish: 30, skinBrighten: 8 } },
  { key: 'whiten', name: '美白提亮', desc: '提亮肤色与高光，让肤色通透但不失真实。', params: { whiten: 22, skinBrighten: 10 } },
  { key: 'rosy', name: '红润血气', desc: '给肤色加一点暖红（唇、脸颊），恢复好气色。', params: { rosy: 14 } },
  { key: 'shape', name: '五官立体', desc: '轻增强清晰度与阴影，让鼻梁/轮廓更立体（不改变真实脸形）。', params: { clarity: 8, sharpen: 8, shadows: -6 } },
  { key: 'teeth', name: '牙齿美白', desc: '提亮嘴部极高光并微降饱和度，让牙齿更干净。', params: { teethWhite: 18 } },
  { key: 'lip', name: '唇色气色', desc: '给唇部加自然暖红，提升画面焦点。', params: { lipColor: 16 } },
  { key: 'final', name: '整体质感', desc: '轻微暗角 + 锐化 + 颗粒，统一风格。', params: { vignette: 10, sharpen: 10, grain: 8 } },
];

// ─── 按题材的修图指南 ─────────────────────────────
export const GENRE_GUIDE = [
  {
    genre: '人像',
    icon: '👤',
    order: ['基础校正', '磨皮', '美白', '红润', '唇色', '质感'],
    points: [
      '先校白平衡：肤色中性、不偏绿偏黄。',
      '磨皮保留眼睛/发丝，避免过度塑料感。',
      '提亮眼神光、美白牙齿，让脸成为焦点。',
      '整体加轻微暗角 + 锐化，突出主体。',
    ],
  },
  {
    genre: '风光',
    icon: '🏞',
    order: ['白平衡', '压高光', '提阴影', '清晰度', '饱和'],
    points: [
      '压掉天空高光、找回暗部细节，保留宽容度。',
      '适度提高清晰度与饱和度，天空更蓝、草木更绿。',
      '用渐变或暗角引导视线到主体。',
      '避免整体过艳，保留自然通透。',
    ],
  },
  {
    genre: '夜景',
    icon: '🌃',
    order: ['降噪', '提阴影', '压高光', '冷色温', '清晰'],
    points: [
      '优先降噪，尤其暗部区域的彩色噪点。',
      '拉高阴影保留城市细节，压住灯牌高光。',
      '冷色温 + 微青调突出霓虹与夜空。',
      '谨慎锐化，避免噪点被放大。',
    ],
  },
  {
    genre: '星空/银河',
    icon: '✨',
    order: ['降噪', '提亮暗部', '蓝调', '去光污染'],
    points: [
      '基础降噪后提亮暗部与银河细节。',
      '偏蓝/紫调强化夜空，去黄光污染。',
      '轻增加清晰度突出星点，避免星轨变形。',
      '控制颗粒度，保留真实星际噪点质感。',
    ],
  },
  {
    genre: '建筑/桥梁',
    icon: '🌉',
    order: ['透视校正', '清晰度', '线条', '对比'],
    points: [
      '拉直透视，让柱子/桥塔垂直。',
      '提高清晰度与锐化强调结构与材质。',
      '冷钢色或青灰调更有工业/现代感。',
      '压高光保留窗内与灯光细节。',
    ],
  },
  {
    genre: '美食',
    icon: '🍜',
    order: ['白平衡', '提亮', '饱和', '暖色'],
    points: [
      '白平衡以白色器皿为准，防止食物发灰。',
      '提亮 + 微暖色温，让食物更有食欲。',
      '提高饱和度与清新感，避免过度油亮。',
      '浅景深 + 微暗角突出主体。',
    ],
  },
  {
    genre: '街拍/纪实',
    icon: '📸',
    order: ['自然色', '轻对比', '颗粒', '保留细节'],
    points: [
      '保持真实色彩，不过度滤镜化。',
      '轻对比 + 颗粒还原街头质感。',
      '保留暗部层次，让故事感更强。',
      '适当锐化提亮主体眼睛。',
    ],
  },
  {
    genre: '胶片/复古',
    icon: '🎞',
    order: ['褪色', '颗粒', '暖色', '低对比'],
    points: [
      '褪色阶（黑位抬升）+ 颗粒还原胶片。',
      '暖色温 + 轻青橙对比更有复古氛围。',
      '低对比 + 柔和过渡，不追求锐利。',
      '暗角加深，模拟镜头边角。',
    ],
  },
];

// ─── 预设对应的「建议用途」映射 ─────────────────────
export const PRESET_TO_GENRE = {
  portrait_soft: '人像',
  portrait_ao: '人像',
  portrait_clean: '人像',
  landscape_vivid: '风光',
  landscape_golden: '风光',
  night_city: '夜景',
  night_stars: '星空',
  bridge_arch: '建筑桥梁',
  food_fresh: '美食',
  film_classic: '胶片',
  japanese_fresh: '日系',
  bw_drama: '黑白',
  cinema_teal: '电影',
  street_snapshot: '街拍',
};

// ─── 默认调节参数（全部归零） ─────────────────────
export const DEFAULT_ADJ = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temperature: 0, tint: 0, saturation: 0, vibrance: 0, clarity: 0,
  sharpen: 0, vignette: 0, grain: 0, fade: 0,
};

export const DEFAULT_PORTRAIT = {
  smooth: 0, whiten: 0, rosy: 0, skinBrighten: 0, blemish: 0,
  teethWhite: 0, lipColor: 0, faceSlim: 0, eyeLarge: 0, clarityFace: 0,
};
