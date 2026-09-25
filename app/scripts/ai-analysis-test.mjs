import {
  mergeRecommendations,
  normalizeAiAnalysis,
  resolveAiSettings,
} from '../src/ai.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const local = {
  source: 'local',
  suggested: { exposure: 8, contrast: -4 },
  issues: [{ id: 'flat', severity: 'medium', title: '画面偏灰平', detail: '低对比' }],
  recommendations: [{ id: 'local', label: '基础曝光', reason: '测试', adjustments: { exposure: 8 } }],
};

const model = normalizeAiAnalysis({
  summary: '模型建议',
  suggested: { exposure: 12, shadows: 10 },
  recommendations: [{
    id: 'model',
    label: '提亮阴影',
    reason: '暗部细节不足',
    adjustments: { shadows: 18, invalidOperation: 99 },
  }],
}, local);
assert(model.source === 'model', 'model source should be preserved');
assert(model.recommendations[0].adjustments.shadows === 18, 'valid adjustment should survive');
assert(!('invalidOperation' in model.recommendations[0].adjustments), 'invalid adjustment should be removed');

const merged = mergeRecommendations({ exposure: 4, contrast: 0 }, [
  { adjustments: { exposure: 6, contrast: 8 } },
  { adjustments: { exposure: 5, shadows: 12 } },
]);
assert(merged.exposure === 15, `exposure merge mismatch: ${merged.exposure}`);
assert(merged.contrast === 8, `contrast merge mismatch: ${merged.contrast}`);
assert(merged.shadows === 12, `shadow merge mismatch: ${merged.shadows}`);

assert(resolveAiSettings({ provider: 'openai' }).vision === true, 'OpenAI preset should support vision');
assert(resolveAiSettings({ provider: 'deepseek', model: 'deepseek-chat' }).vision === false, 'DeepSeek chat should stay text-only');
assert(resolveAiSettings({ provider: 'custom', model: 'qwen2.5-vl' }).vision === true, 'Qwen VL should enable vision');

console.log('ai analysis tests passed');
