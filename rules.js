/**
 * 脚本校验规则（服务端权威版，与前端 app.js 的校验保持一致）
 * 规则可配置：wordMin/wordMax/speed/duration/titleMax/tagsMin/recent
 */
const BANNED = [
  '最好','第一','国家级','绝对','100%','唯一','永久','根治','包治','万能',
  '彻底解决','绝对有效','最强','秒杀','全网最','必看','第一品牌'
];
const BANNED_SCENE = /酒|酱酒|酣客|白酒|啤酒|红酒/;

function countWords(s){
  const t = String(s || '');
  const cjk = (t.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  const latin = (t.replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + latin;
}
function splitLines(v){ return String(v || '').split('\n').map(x => x.trim()).filter(Boolean); }
function timelineSegments(v){ return splitLines(v).filter(l => /\d+\s*-\s*\d+\s*秒/.test(l)); }
function quotes(v){ const m = String(v || '').match(/[「」“”"'‘]/g); return m ? m.length : 0; }
function tagsOf(d){ return String(d || '').match(/#[^\s#]+/g) || []; }
function firstSentence(d){ return String(d || '').trim().split(/[。！？\n]/)[0] || ''; }

/**
 * @param card {title,tone,scene,timeline,light,vo,mats:[{desc,title}]}
 * @param ctx  {rules, peers:[card], history:[string]}
 * @returns [{level:'err'|'warn', msg}]
 */
function validateScript(card, ctx){
  const r = ctx.rules, peers = ctx.peers || [], history = ctx.history || [], out = [];
  const push = (level, msg) => out.push({ level, msg });

  if (!card.title || !card.title.trim()) push('err', '缺脚本标题');
  if (!card.tone || !card.tone.trim()) push('err', '缺风格调性');
  if (!card.scene || !card.scene.trim()) push('err', '缺场景设定');
  if (!card.light || !card.light.trim()) push('err', '缺镜头光线');

  const segs = timelineSegments(card.timeline);
  if (segs.length !== 4) push('err', '时间轴需 4 段（0-3/3-6/6-9/9-12 秒），当前 ' + segs.length + ' 段');
  else if (segs.some(s => quotes(s) < 2)) push('err', '时间轴每段需含台词（用「」包住）');

  const vo = (card.vo || '').trim(), n = countWords(vo);
  if (!vo) push('err', '缺口播文案');
  else {
    if (n < r.wordMin || n > r.wordMax) push('err', '口播 ' + n + ' 字，需在 ' + r.wordMin + '–' + r.wordMax + ' 字');
    const sp = n / r.duration;
    if (sp > r.speed) push('err', '语速 ' + sp.toFixed(1) + ' 字/秒，超出上限 ' + r.speed);
    else if (sp > r.speed - 0.4) push('warn', '语速 ' + sp.toFixed(1) + ' 字/秒，接近上限');
  }

  const sceneAll = (card.vo || '') + (card.scene || '') + (card.timeline || '');
  if (BANNED_SCENE.test(sceneAll)) push('err', '出现酒相关内容，脚本中禁止');

  const norm = s => String(s || '').replace(/\s+/g, '');
  if (card.tone && peers.some(c => c.id !== card.id && norm(c.tone) === norm(card.tone)))
    push('err', '风格调性与其他条目逐字重复');
  if (card.scene && peers.some(c => c.id !== card.id && norm(c.scene) === norm(card.scene)))
    push('warn', '场景设定与其他条目相同');
  if (card.light && peers.some(c => c.id !== card.id && norm(c.light) === norm(card.light)))
    push('warn', '镜头光线与其他条目相同');

  const titles = [];
  (card.mats || []).forEach((m, i) => {
    const L = ['A','B','C'][i] || (i + 1);
    if (!m || !m.desc || !m.desc.trim()){ push('err', L + ' 缺视频描述'); return; }
    if (!m.title || !m.title.trim()){ push('err', L + ' 缺短标题'); return; }
    const tags = tagsOf(m.desc);
    if (tags.length < r.tagsMin) push('err', L + ' 描述话题标签 ' + tags.length + ' 个，需 ≥ ' + r.tagsMin);
    if (!/\s#/.test(m.desc) && tags.length) push('warn', L + ' 描述末尾话题标签前建议留空格分隔');
    const tw = countWords(m.title);
    if (tw > r.titleMax) push('err', L + ' 短标题 ' + tw + ' 字，超出 ' + r.titleMax + ' 字');
    if (titles.indexOf(m.title.trim()) >= 0) push('err', L + ' 短标题与本条其他组重复');
    if (history.indexOf(m.title.trim()) >= 0) push('err', L + ' 短标题与近 ' + r.recent + ' 条已用标题重复');
    if (BANNED.some(b => m.desc.indexOf(b) >= 0 || m.title.indexOf(b) >= 0)) push('err', L + ' 含绝对化/违规词');
    titles.push(m.title.trim());
  });

  const firsts = (card.mats || []).map(m => firstSentence(m && m.desc));
  if (firsts.length && firsts.every(Boolean) && new Set(firsts).size < firsts.length)
    push('warn', '三组描述首句有重复');
  if ((card.mats || []).length === 3){
    const descs = (card.mats || []).map(m => norm(m && m.desc));
    if (new Set(descs).size < descs.length) push('warn', '三组描述内容过于接近');
  }
  return out;
}

module.exports = { validateScript, countWords, splitLines, timelineSegments, tagsOf, BANNED };