// Official public-price snapshot. Estimates are distinct from provider billing.
export const deepseekPriceSource = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/';
export function deepseekPrices(provider, model, at, historical = false) {
  if (provider !== 'deepseek' || model !== 'deepseek-flash') return [];
  const local = new Date(at + 8 * 3600000);
  const day = local.getUTCDay(), minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const peak = day >= 1 && day <= 5 && ((minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080));
  const note = `官网价格核对于 2026-10-24；${historical ? '按此价格追溯估算，非历史账单；' : ''}${peak ? '高峰上限估算（未校验中国法定节假日，节假日实际减半）' : '空闲时段估算'}；${deepseekPriceSource}`;
  return [['cache_hit_tokens', peak ? '0.04' : '0.02'], ['cache_miss_tokens', peak ? '2' : '1'], ['output_tokens', peak ? '8' : '4']].map(([metric,price]) => ({id:`deepseek-public-2026-10-24-${peak?'peak':'offpeak'}-${metric}`,provider,model,metric,currency:'CNY',unit:1000000,price,effective_at:Date.UTC(2026,9,24),note}));
}
