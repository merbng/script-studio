/**
 * 热榜合并排序：来源不重要，人设贴合度才重要
 *  1) 同题合并（多榜同题 → 一条，记上榜数）
 *  2) 剔绝对红线
 *  3) 人设分层：核心 > 边缘 > 无关
 *  4) 同层内：干净优先 → 人设贴合强度（层数 + 强度）→ 热度
 *  5) 只保留前 N 条
 */
const sens = require('./sensitive');
const persona = require('./persona');

/** 把多个平台的条目合并去重 */
function mergeByTitle(items){
  const seen = new Map();
  for (const it of items){
    const k = String(it.title || '').replace(/\s+/g, '');
    if (!k) continue;
    if (!seen.has(k)) seen.set(k, { ...it, title: it.title, heat: Number(it.heat) || 0, sources: [it.source] });
    else {
      const p = seen.get(k);
      if (it.source && p.sources.indexOf(it.source) < 0) p.sources.push(it.source);
      p.heat = Math.max(p.heat || 0, Number(it.heat) || 0);
    }
  }
  return Array.from(seen.values());
}

/** 贴合度排序键：层数优先，其次强度 */
function fitOf(p){
  return (p.layers || 0) * 1000 + (p.raw || 0);
}

function rankMerged(items, limit){
  const blocked = [];
  let list = items.filter(it => {
    if (sens.isHardBlocked(it.title)){ blocked.push(it); return false; }
    return true;
  });

  list = list.map(it => {
    const p = persona.score(it.title);
    return { ...it, persona: p, personaLevel: persona.level(p), soft: sens.isSoftSensitive(it.title) ? 1 : 0 };
  });

  const LV = { core: 0, edge: 1, off: 2 };
  list.sort((a, b) => {
    if (a.personaLevel !== b.personaLevel) return LV[a.personaLevel] - LV[b.personaLevel];
    if (a.soft !== b.soft) return a.soft - b.soft;
    const fa = fitOf(a.persona), fb = fitOf(b.persona);
    if (fa !== fb) return fb - fa;
    return (b.heat || 0) - (a.heat || 0);
  });

  const counts = { core: 0, edge: 0, off: 0 };
  list.forEach(i => counts[i.personaLevel]++);

  return {
    list: limit ? list.slice(0, limit) : list,
    counts,
    blocked,
    softCount: list.filter(x => x.soft).length
  };
}

module.exports = { mergeByTitle, rankMerged, fitOf };