/**
 * AI photo analysis client.
 *
 * Design follows the common photo-app pipeline:
 *   local histogram / exposure analysis -> optional vision model -> validated
 *   structured recipe -> user-applied, undoable adjustments.
 */

export const AI_PROVIDER_PRESETS = Object.freeze({
  openai: Object.freeze({
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatEndpoint: 'https://api.openai.com/v1/chat/completions',
    modelsEndpoint: 'https://api.openai.com/v1/models',
    auth: 'bearer',
    defaultModel: 'gpt-4o-mini',
    recommendedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
  }),
  deepseek: Object.freeze({
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    chatEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    modelsEndpoint: 'https://api.deepseek.com/v1/models',
    auth: 'bearer',
    defaultModel: 'deepseek-chat',
    recommendedModels: ['deepseek-chat', 'deepseek-reasoner'],
  }),
  siliconflow: Object.freeze({
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    chatEndpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    modelsEndpoint: 'https://api.siliconflow.cn/v1/models',
    auth: 'bearer',
    defaultModel: 'Qwen/Qwen2.5-VL-72B-Instruct',
    recommendedModels: ['Qwen/Qwen2.5-VL-72B-Instruct', 'Qwen/Qwen2.5-VL-32B-Instruct', 'deepseek-ai/DeepSeek-V3'],
  }),
  dashscope: Object.freeze({
    id: 'dashscope',
    label: '阿里云百炼 DashScope',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    modelsEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    auth: 'bearer',
    defaultModel: 'qwen-vl-max-latest',
    recommendedModels: ['qwen-vl-max-latest', 'qwen-vl-plus-latest', 'qwen-plus', 'qwen-max'],
  }),
  ark: Object.freeze({
    id: 'ark',
    label: '火山方舟 Ark',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    chatEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    modelsEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/models',
    auth: 'bearer',
    defaultModel: '',
    recommendedModels: [],
  }),
  moonshot: Object.freeze({
    id: 'moonshot',
    label: '月之暗面 Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    chatEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
    modelsEndpoint: 'https://api.moonshot.cn/v1/models',
    auth: 'bearer',
    defaultModel: 'moonshot-v1-8k-vision-preview',
    recommendedModels: ['moonshot-v1-8k-vision-preview', 'moonshot-v1-32k-vision-preview', 'kimi-latest'],
  }),
  zhipu: Object.freeze({
    id: 'zhipu',
    label: '智谱 BigModel',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    chatEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    modelsEndpoint: 'https://open.bigmodel.cn/api/paas/v4/models',
    auth: 'bearer',
    defaultModel: 'glm-4v-flash',
    recommendedModels: ['glm-4v-flash', 'glm-4v-plus', 'glm-4-plus'],
  }),
  openrouter: Object.freeze({
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    modelsEndpoint: 'https://openrouter.ai/api/v1/models',
    auth: 'bearer',
    defaultModel: 'openai/gpt-4o-mini',
    recommendedModels: ['openai/gpt-4o-mini', 'google/gemini-2.0-flash-001', 'qwen/qwen-2.5-vl-72b-instruct'],
    extraHeaders: { 'HTTP-Referer': 'https://github.com/youdangshi/NikonCameraControl', 'X-Title': 'Nini Camera Control' },
  }),
  groq: Object.freeze({
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
    modelsEndpoint: 'https://api.groq.com/openai/v1/models',
    auth: 'bearer',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    recommendedModels: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'],
  }),
  xai: Object.freeze({
    id: 'xai',
    label: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    chatEndpoint: 'https://api.x.ai/v1/chat/completions',
    modelsEndpoint: 'https://api.x.ai/v1/models',
    auth: 'bearer',
    defaultModel: 'grok-2-vision-latest',
    recommendedModels: ['grok-2-vision-latest', 'grok-2-latest'],
  }),
  mistral: Object.freeze({
    id: 'mistral',
    label: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    chatEndpoint: 'https://api.mistral.ai/v1/chat/completions',
    modelsEndpoint: 'https://api.mistral.ai/v1/models',
    auth: 'bearer',
    defaultModel: 'pixtral-large-latest',
    recommendedModels: ['pixtral-large-latest', 'pixtral-12b-2409', 'mistral-large-latest'],
  }),
  ollama: Object.freeze({
    id: 'ollama',
    label: 'Ollama 本地',
    baseUrl: 'http://127.0.0.1:11434/v1',
    chatEndpoint: 'http://127.0.0.1:11434/v1/chat/completions',
    modelsEndpoint: 'http://127.0.0.1:11434/v1/models',
    auth: 'none',
    defaultModel: 'qwen2.5vl:7b',
    recommendedModels: ['qwen2.5vl:7b', 'llama3.2-vision:11b', 'minicpm-v4.6:1b'],
  }),
  custom: Object.freeze({
    id: 'custom',
    label: '自定义 OpenAI 兼容接口',
    baseUrl: '',
    chatEndpoint: '',
    modelsEndpoint: '',
    auth: 'bearer',
    defaultModel: '',
    recommendedModels: [],
  }),
});

export const AI_PROVIDERS = Object.values(AI_PROVIDER_PRESETS).map(provider => ({
  value: provider.id,
  label: provider.label,
}));

export const AI_MODES = Object.freeze([
  { id: 'auto', label: '自动判断' },
  { id: 'portrait', label: '人像' },
  { id: 'landscape', label: '风光' },
  { id: 'night', label: '夜景' },
  { id: 'star', label: '星空' },
  { id: 'architecture', label: '建筑' },
  { id: 'food', label: '美食' },
  { id: 'street', label: '街拍' },
  { id: 'film', label: '胶片' },
]);

const MODE_LABELS = Object.fromEntries(AI_MODES.map(item => [item.id, item.label]));

const ALLOWED_ADJUSTMENTS = new Set([
  'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks',
  'temperature', 'tint', 'saturation', 'vibrance', 'clarity', 'texture',
  'dehaze', 'sharpen', 'denoise', 'vignette', 'grain', 'fade',
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value) {
  return Math.round(Number(value) || 0);
}

export function resolveAiSettings(settings = {}) {
  const preset = AI_PROVIDER_PRESETS[settings.provider] || AI_PROVIDER_PRESETS.deepseek;
  const model = settings.model || preset.defaultModel;
  const capabilities = inferModelCapabilities(model);
  return {
    provider: settings.provider || preset.id,
    baseUrl: settings.baseUrl || preset.baseUrl,
    endpoint: settings.endpoint || preset.chatEndpoint,
    modelsEndpoint: settings.modelsEndpoint || preset.modelsEndpoint,
    auth: preset.auth,
    extraHeaders: preset.extraHeaders || {},
    model,
    vision: capabilities.vision,
  };
}

export function inferModelCapabilities(modelId) {
  const id = String(modelId || '');
  const lower = id.toLowerCase();
  const vision = /(vision|vl|gpt-4o|gpt-4\.1|gpt-5|gemini|claude|pixtral|grok-2-vision|llama-4|llava|minicpm-v|moondream)/i.test(id);
  const imageOutput = /(dall-e|gpt-image|flux|stable-diffusion|midjourney|image-generation)/i.test(lower);
  const embedding = /(embedding|embed|rerank|moderation|whisper|tts|audio|realtime)/i.test(lower);
  return {
    id,
    vision,
    imageOutput,
    embedding,
    selectable: !imageOutput && !embedding,
  };
}

export function parseProviderModelList(payload, providerId = 'custom') {
  const raw = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];
  const models = raw
    .map(item => typeof item === 'string' ? item : (item?.id || item?.name || item?.model))
    .filter(Boolean)
    .map(id => ({ id: String(id), ...inferModelCapabilities(id) }))
    .filter(model => model.selectable);
  const unique = Array.from(new Map(models.map(model => [model.id, model])).values());
  unique.sort((a, b) => {
    if (a.vision !== b.vision) return a.vision ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  return unique;
}

export async function fetchProviderModels({ provider = 'deepseek', apiKey = '', settings = {} } = {}) {
  const preset = AI_PROVIDER_PRESETS[provider] || AI_PROVIDER_PRESETS.custom;
  const resolved = resolveAiSettings({ ...settings, provider, apiKey });
  const endpoint = resolved.modelsEndpoint || preset.modelsEndpoint;
  if (!endpoint) throw new Error('该供应商未配置模型列表地址，请手动填写模型名称。');
  if (preset.auth !== 'none' && !apiKey) throw new Error('请先输入 API Key，再获取可用模型。');

  const headers = { Accept: 'application/json', ...(preset.extraHeaders || {}) };
  if (preset.auth !== 'none' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(endpoint, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`获取模型列表失败 (${res.status}) ${text.slice(0, 160)}`);
  }
  const payload = await res.json();
  const models = parseProviderModelList(payload, provider);
  if (!models.length) {
    const fallback = (preset.recommendedModels || []).map(id => ({ id, ...inferModelCapabilities(id) })).filter(item => item.selectable);
    if (fallback.length) return { models: fallback, endpoint, fallback: true };
    throw new Error('API 返回了成功状态，但没有找到可用的对话模型。');
  }
  return { models, endpoint, fallback: false };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取照片，请确认图片格式受支持。'));
    image.src = dataUrl;
  });
}

export async function prepareImageForVision(dataUrl, maxDim = 1280) {
  if (!dataUrl) return '';
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

/**
 * Local diagnostic pass. This mirrors the useful part of Lightroom/Darktable
 * automatic analysis: histogram percentiles, clipping, contrast and color bias.
 */
export async function analyzeImageLocally(dataUrl) {
  const image = await loadImage(dataUrl);
  const maxDim = 320;
  const scale = Math.min(1, maxDim / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;

  const lumHistogram = new Array(256).fill(0);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLum = 0;
  let sumLumSq = 0;
  let sumSat = 0;
  let clippedLow = 0;
  let clippedHigh = 0;
  let edgeEnergy = 0;
  let edgeSamples = 0;
  const count = width * height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;

      sumR += r;
      sumG += g;
      sumB += b;
      sumLum += lum;
      sumLumSq += lum * lum;
      sumSat += saturation;
      lumHistogram[Math.round(lum)] += 1;
      if (lum <= 5) clippedLow += 1;
      if (lum >= 250) clippedHigh += 1;

      if (x + 1 < width) {
        const right = index + 4;
        const rightLum = pixels[right] * 0.299 + pixels[right + 1] * 0.587 + pixels[right + 2] * 0.114;
        edgeEnergy += Math.abs(lum - rightLum);
        edgeSamples += 1;
      }
    }
  }

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const mean = sumLum / count;
  const variance = Math.max(0, sumLumSq / count - mean * mean);
  const stdDev = Math.sqrt(variance);
  const averageSaturation = (sumSat / count) * 100;
  const sharpness = edgeSamples ? edgeEnergy / edgeSamples : 0;
  const lowRatio = clippedLow / count;
  const highRatio = clippedHigh / count;

  const cumulative = [];
  let running = 0;
  for (let index = 0; index < 256; index += 1) {
    running += lumHistogram[index];
    cumulative[index] = running / count;
  }
  const percentile = (target) => cumulative.findIndex(value => value >= target);
  const p05 = Math.max(0, percentile(0.05));
  const p50 = Math.max(0, percentile(0.5));
  const p95 = Math.max(0, percentile(0.95));
  const dynamicRange = p95 - p05;

  const suggested = {
    exposure: round(clamp((118 - mean) / 4.2, -22, 22)),
    contrast: round(clamp((52 - stdDev) / 2.2, -16, 22)),
    highlights: round(clamp(-highRatio * 420, -35, 0)),
    shadows: round(clamp(lowRatio * 380, 0, 32)),
    whites: round(clamp((210 - p95) / 4, -12, 16)),
    blacks: round(clamp((p05 - 18) / 3, -14, 14)),
    temperature: round(clamp((meanB - meanR) * 0.55, -24, 24)),
    saturation: round(clamp((30 - averageSaturation) * 0.7, -18, 18)),
    clarity: round(clamp((28 - sharpness) * 0.45, -8, 22)),
    denoise: sharpness < 7 ? 18 : sharpness < 12 ? 10 : 4,
  };

  const issues = [];
  if (mean < 92) issues.push({ id: 'underexposed', severity: 'high', title: '整体偏暗', detail: `平均亮度 ${Math.round(mean)}，暗部占比较高。` });
  if (mean > 168) issues.push({ id: 'overexposed', severity: 'high', title: '整体偏亮', detail: `平均亮度 ${Math.round(mean)}，建议压低高光并恢复层次。` });
  if (highRatio > 0.035) issues.push({ id: 'highlight-clipping', severity: 'high', title: '高光溢出', detail: `约 ${(highRatio * 100).toFixed(1)}% 像素接近纯白。` });
  if (lowRatio > 0.05) issues.push({ id: 'shadow-clipping', severity: 'medium', title: '暗部细节不足', detail: `约 ${(lowRatio * 100).toFixed(1)}% 像素接近纯黑。` });
  if (stdDev < 42) issues.push({ id: 'flat-contrast', severity: 'medium', title: '画面偏灰平', detail: `亮度标准差 ${Math.round(stdDev)}，可以增加中间调对比。` });
  if (Math.abs(meanR - meanB) > 18) issues.push({ id: 'color-cast', severity: 'medium', title: '白平衡有偏色', detail: `红绿蓝均值 ${Math.round(meanR)}/${Math.round(meanG)}/${Math.round(meanB)}。` });
  if (averageSaturation < 18) issues.push({ id: 'low-saturation', severity: 'low', title: '色彩偏淡', detail: `平均饱和度约 ${averageSaturation.toFixed(1)}%。` });
  if (sharpness < 7) issues.push({ id: 'soft-detail', severity: 'medium', title: '细节偏软', detail: `边缘能量 ${sharpness.toFixed(1)}，可能有轻微失焦或降噪过度。` });

  const p50Target = p50 < 92 ? 112 : p50 > 172 ? 146 : p50;
  const recommendations = [{
    id: 'local-balance',
    label: '基础曝光与层次',
    reason: '依据照片直方图自动平衡中灰、黑场和白场。',
    adjustments: suggested,
  }];
  if (Math.abs(suggested.temperature) >= 4) {
    recommendations.push({
      id: 'local-wb',
      label: '白平衡校正',
      reason: '根据 RGB 通道均值修正画面色偏。',
      adjustments: { temperature: suggested.temperature },
    });
  }

  return {
    source: 'local',
    width: image.naturalWidth || width,
    height: image.naturalHeight || height,
    aspect: (image.naturalWidth || width) / Math.max(1, image.naturalHeight || height),
    metrics: {
      mean: round(mean),
      median: p50Target,
      p05,
      p50,
      p95,
      dynamicRange,
      stdDev: round(stdDev),
      clippedLowRatio: Number(lowRatio.toFixed(4)),
      clippedHighRatio: Number(highRatio.toFixed(4)),
      averageSaturation: Number(averageSaturation.toFixed(1)),
      sharpness: Number(sharpness.toFixed(1)),
      rgbMean: [round(meanR), round(meanG), round(meanB)],
    },
    issues,
    recommendations,
    suggested,
    summary: issues.length
      ? `已发现 ${issues.length} 个可改善项，优先处理${issues[0].title}。`
      : '曝光、动态范围和色彩基础较均衡，可按题材继续做风格化。',
  };
}

function normalizeRecommendation(item, index) {
  const adjustments = {};
  for (const [key, value] of Object.entries(item?.adjustments || {})) {
    if (!ALLOWED_ADJUSTMENTS.has(key)) continue;
    const limit = key === 'vignette' || key === 'grain' || key === 'fade' || key === 'denoise' ? [0, 100] : [-100, 100];
    adjustments[key] = round(clamp(value, limit[0], limit[1]));
  }
  return {
    id: String(item?.id || `recommendation-${index + 1}`),
    label: String(item?.label || `建议 ${index + 1}`).slice(0, 40),
    reason: String(item?.reason || '').slice(0, 180),
    adjustments,
  };
}

export function normalizeAiAnalysis(value, local = null) {
  if (!value || typeof value !== 'object') return local;
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.map(normalizeRecommendation).filter(item => Object.keys(item.adjustments).length)
    : [];
  return {
    ...local,
    ...value,
    source: value.source || 'model',
    local,
    issues: Array.isArray(value.issues) ? value.issues.slice(0, 12) : (local?.issues || []),
    recommendations: recommendations.length ? recommendations : (local?.recommendations || []),
    suggested: { ...(local?.suggested || {}), ...(value.suggested || {}), ...recommendations.flatMap(item => item.adjustments) },
    summary: String(value.summary || local?.summary || '').slice(0, 300),
  };
}

function buildAnalysisPrompt({ mode, local, hasVision }) {
  const modeLabel = MODE_LABELS[mode] || MODE_LABELS.auto;
  return `你是一名专业摄影后期师。请以“${modeLabel}”视角分析照片，并只返回一个 JSON 对象，不要 Markdown。

本地图像统计：
${JSON.stringify(local?.metrics || {}, null, 0)}
本地发现：${JSON.stringify(local?.issues || [], null, 0)}
${hasVision ? '请同时观察附图中的主体、光线、构图、肤色、景深和题材。' : '当前模型未启用视觉输入，请基于统计和摄影常识给出保守建议。'}

JSON 必须符合：
{
  "scene": {"type":"人像/风光/夜景/星空/建筑/美食/街拍/其他","subject":"","mood":"","lighting":""},
  "scores": {"exposure":0-100,"color":0-100,"composition":0-100,"focus":0-100,"skinTone":0-100},
  "issues": [{"id":"","severity":"low|medium|high","title":"","detail":""}],
  "recommendations": [{
    "id":"",
    "label":"简短中文步骤名",
    "reason":"为什么",
    "adjustments":{"exposure":-100..100,"contrast":-100..100,"highlights":-100..100,"shadows":-100..100,"whites":-100..100,"blacks":-100..100,"temperature":-100..100,"tint":-100..100,"saturation":-100..100,"vibrance":-100..100,"clarity":-100..100,"texture":-100..100,"dehaze":-100..100,"sharpen":-100..100,"denoise":0..100,"vignette":0..100,"grain":0..100,"fade":0..100}
  }],
  "portrait": {"skinTone":"","direction":""},
  "composition": {"strength":"","improvement":""},
  "summary":"80字以内结论"
}

要求：建议必须可执行、克制，避免把照片修成塑料感；人像优先肤色和自然轮廓，风光控制高光与局部对比，夜景和星空控制降噪、色偏与暗部细节。`;
}

function parseJsonResponse(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
}

/**
 * Analyze a photo. If no API key is configured, the local diagnostic result is
 * still returned rather than throwing, allowing the editor to remain useful.
 */
export async function analyzePhoto(cfg, prompt = '', imageBase64 = '', options = {}) {
  const { apiKey = '', settings = {} } = cfg;
  const resolved = resolveAiSettings(settings);
  const mode = options.mode || 'auto';
  const local = imageBase64 ? await analyzeImageLocally(imageBase64) : null;
  if ((!apiKey && resolved.auth !== 'none') || !resolved.endpoint) {
    return {
      raw: '',
      analysis: local,
      local,
      mode,
      usedVision: false,
      provider: resolved.provider,
      model: resolved.model,
      warning: !resolved.endpoint ? '模型未配置接口地址，已使用本地诊断。' : '未配置 API Key，已使用本地诊断。',
    };
  }

  const hasVision = resolved.vision && Boolean(imageBase64);
  const analysisPrompt = prompt || buildAnalysisPrompt({ mode, local, hasVision });
  const visionImage = hasVision ? await prepareImageForVision(imageBase64) : '';
  const content = visionImage
    ? [
        { type: 'text', text: analysisPrompt },
        { type: 'image_url', image_url: { url: visionImage } },
      ]
    : analysisPrompt;

  const body = {
    model: resolved.model || 'deepseek-chat',
    messages: [{ role: 'user', content }],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  };

  const headers = {
    'Content-Type': 'application/json',
    ...(resolved.extraHeaders || {}),
  };
  if (resolved.auth !== 'none' && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(resolved.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 请求失败 (${res.status}) ${text.slice(0, 160)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const parsed = parseJsonResponse(raw);
  return {
    raw,
    analysis: normalizeAiAnalysis(parsed, local),
    local,
    mode,
    usedVision: hasVision,
    provider: resolved.provider,
    model: resolved.model,
    warning: parsed ? '' : '模型未返回标准 JSON，已保留本地诊断。',
  };
}

export function mergeRecommendations(base = {}, recommendations = []) {
  const next = { ...base };
  for (const recommendation of recommendations) {
    for (const [key, value] of Object.entries(recommendation?.adjustments || {})) {
      if (!ALLOWED_ADJUSTMENTS.has(key)) continue;
      const current = Number(next[key]) || 0;
      next[key] = round(clamp(current + Number(value || 0), -100, 100));
    }
  }
  return next;
}
