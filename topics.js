/**
 * 选题池：把「实时热榜」和「人设话题库」合成一个可用的候选池
 * 规则：
 *  1. 核心人设话题优先（热榜 > 话题库）
 *  2. 热榜核心话题不足条数时，用人设话题库补足
 *  3. 配比：技术/数码/AI ≥ 2；北方生活 ≤ 2；职场与消费避坑 ≤ 2；家务 ≤ 1
 *  4. 绝对红线话题永不进池
 */
const sens = require('./sensitive');
const persona = require('./persona');
const pool = require('./persona-pool');

/**
 * 话题归类：
 *   tech  技术宅/数码/AI
 *   work  中年职场与消费避坑
 *   north 北方生活（供暖、澡堂、干冷、囤菜等）
 *   home  普通家务生活
 */
function category(title){
  const p = persona.score(title);
  if (p.north > 0) return 'north';
  if (p.tech > 0) return 'tech';
  if (p.midlife > 0) return 'work';
  return 'home';
}

function buildCandidates(hotItems, count){
  const blocked = hotItems.filter(i => sens.isHardBlocked(i.title));
  const hotCore = hotItems.filter(i => i.personaLevel === 'core' && !sens.isHardBlocked(i.title));

  const used = new Set(hotCore.map(i => i.title));
  const libCore = pool.CORE
    .filter(t => !used.has(t) && !sens.isHardBlocked(t))
    .map(t => {
      const p = persona.score(t);
      return { title: t, source: '人设话题库', heat: 0, persona: p, personaLevel: persona.level(p), from: 'library' };
    })
    .sort((a, b) => b.persona.raw - a.persona.raw);

  const candidates = hotCore.map(i => ({ ...i, from: 'hot' }))
    .concat(libCore.map(i => ({ ...i, from: 'library' })));

  const quota = {
    tech: Math.max(2, Math.ceil(count * 0.4)),
    north: 2,
    work: 2,
    home: 1
  };

  const byCat = { tech: [], north: [], work: [], home: [] };
  candidates.forEach(c => byCat[category(c.title)].push(c));

  /* 按配额取，顺序：tech → north → work → home */
  const picked = [];
  const take = (arr, n) => arr.slice(0, Math.max(0, n)).forEach(c => { if (!picked.includes(c)) picked.push(c); });
  take(byCat.tech, quota.tech);
  take(byCat.north, quota.north);
  take(byCat.work, quota.work);
  take(byCat.home, quota.home);

  /* 不够就放宽补齐 */
  if (picked.length < count){
    ['tech', 'north', 'work', 'home'].forEach(cat => {
      byCat[cat].forEach(c => { if (picked.length < count && !picked.includes(c)) picked.push(c); });
    });
  }

  const stats = { tech: 0, north: 0, work: 0, home: 0 };
  picked.forEach(c => stats[category(c.title)]++);

  return {
    candidates: picked,
    hotCoreCount: hotCore.length,
    blockedCount: blocked.length,
    stats,
    quota
  };
}

function guide(hotItems, count){
  const b = buildCandidates(hotItems, count);
  const L = [];
  L.push('可用选题池（已按人设贴合度与配比排好，直接从这里挑，不要自己另起话题）：');
  b.candidates.forEach((c, i) => {
    const tag = c.from === 'hot' ? '实时热榜' : '人设话题库';
    L.push(`${i + 1}. [${tag}·${c.source}] ${c.title}  （技术宅×${c.persona.tech} / 中年×${c.persona.midlife} / 北方×${c.persona.north}）`);
  });
  L.push('');
  L.push(`配比要求（选 ${count} 条时）：技术/数码/AI 类不少于 ${b.quota.tech} 条；北方生活不超过 ${b.quota.north} 条；职场与消费避坑不超过 ${b.quota.work} 条；普通家务不超过 ${b.quota.home} 条。`);
  L.push('每条都要能看出是 @金木 说的话：技术宅视角、中年人的实际处境、北方生活细节，至少占一层。');
  L.push('hotSource 字段写你用的那条原始话题文字。');
  return L.join('\n');
}

module.exports = { buildCandidates, guide, category };