/**
 * AI 修图/分析客户端
 *
 * 默认 DeepSeek，兼容任意 OpenAI /chat/completions 接口。
 * 支持在设置中切换 provider、endpoint、model。
 */

const DEFAULT_PROMPT = '请分析这张照片的曝光、色彩、构图和人物姿势，用中文给出简短、专业、可执行的后期建议，100字以内。';

const PROVIDER_PRESETS = {
  deepseek: { endpoint: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  custom: { endpoint: '', model: '' },
};

export function resolveAiSettings(settings = {}) {
  const preset = PROVIDER_PRESETS[settings.provider] || PROVIDER_PRESETS.deepseek;
  return {
    provider: settings.provider || 'deepseek',
    endpoint: settings.endpoint || preset.endpoint,
    model: settings.model || preset.model,
  };
}

export const AI_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI / 兼容' },
  { value: 'custom', label: '自定义模型' },
];

/**
 * @param {{apiKey:string, settings?:object}} cfg
 * @param {string|null} [prompt]
 * @param {string} [imageBase64] 可选：data URL 或 base64；支持视觉的模型会收到图片
 */
export async function analyzePhoto(cfg, prompt = DEFAULT_PROMPT, imageBase64 = '') {
  const { apiKey = '', settings = {} } = cfg;
  const { endpoint, model } = resolveAiSettings(settings);
  if (!apiKey) throw new Error('请先在设置中配置 API Key');
  if (!endpoint) throw new Error('请先配置模型接口地址');

  const content = imageBase64
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } },
      ]
    : prompt;

  const body = {
    model: model || 'deepseek-chat',
    messages: [{ role: 'user', content }],
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 请求失败 (${res.status}) ${text.slice(0, 120)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'AI 分析暂不可用';
}
