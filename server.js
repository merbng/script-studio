/**
 * 视频号脚本标准化生成器 · 后端
 * 零依赖：Node 内置 http/https/fs/path/url
 * 能力：实时热榜（10 平台合并 → 人设贴合度排序） → 大模型按人设选题 → 服务端校验 → 自动自修复 → 导出
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { setEnvVars } = require('./env');
const { validateScript } = require('./rules');
const sens = require('./sensitive');
const persona = require('./persona');
const topics = require('./topics');
const hotlist = require('./hot');
const hrank = require('./hot-rank');

const ROOT = __dirname;
const PORT = +(process.env.PORT || 8787);
const DATA = path.join(ROOT, 'data');
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

function loadEnv(){
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  });
}
loadEnv();

function readJSON(name, fallback){
  const f = path.join(DATA, name);
  try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e){}
  return fallback;
}
function writeJSON(name, obj){
  const f = path.join(DATA, name);
  fs.writeFileSync(f, JSON.stringify(obj, null, 2), 'utf8');
  return obj;
}

function fetchText(target, opts = {}, timeout = 12000){
  return new Promise((resolve, reject) => {
    const u = new URL(target);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: opts.method || 'GET', headers: opts.headers || {} }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/* ---------- 热榜源 ---------- */
/* 各平台适配器见 hot.js：微博 / 抖音 / B站 / 快手 / 知乎 / 头条 / 百度 / 腾讯 / 澎湃 / 小红书 */
async function fetchHot(){
  const results = await hotlist.fetchAll();
  const sourceStatus = results.map(r => ({ source: r.source, count: r.items.length, ok: r.ok }));
  let items = results.flatMap(r => r.items);

  if (process.env.HOT_EXTRA_URL){
    try {
      const r = await fetchText(process.env.HOT_EXTRA_URL);
      const j = JSON.parse(r.body);
      const extra = Array.isArray(j) ? j : (j.items || j.data || []);
      items = items.concat(extra.map(x => ({ title: String(x.title || x.word || x.name || '').trim(), heat: Number(x.heat || x.hot || 0), source: x.source || '自定义源' })).filter(x => x.title));
    } catch(e){}
  }

  /* 1) 跨平台同题合并（榜单分类不重要，合在一起排） */
  const merged = hrank.mergeByTitle(items);

  /* 2) 剔绝对红线 + 按人设贴合度统一排序 */
  const ranked = hrank.rankMerged(merged, 0);
  const list = ranked.list;

  /* 3) 分组输出：核心 / 边缘 / 无关，按贴合度排好 */
  const groups = [
    { key: 'core', label: '核心人设（优先选用）', count: 0 },
    { key: 'edge', label: '边缘相关（能改成人设视角才选）', count: 0 },
    { key: 'off',  label: '与人设无关（不用）', count: 0 }
  ];
  const gk = { core: groups[0], edge: groups[1], off: groups[2] };
  list.forEach(it => gk[it.personaLevel].count++);

  return {
    fetchedAt: new Date().toISOString(),
    total: list.length,
    counts: ranked.counts,
    softCount: ranked.softCount,
    blockedCount: ranked.blocked.length,
    blockedSample: ranked.blocked.slice(0, 10).map(x => x.title),
    sourceStatus,
    groups,
    items: list.slice(0, 150)
  };
}

/* ---------- 大模型 ---------- */
function llmConfig(){
  return {
    base: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    key: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini'
  };
}

const SYSTEM_PROMPT = `你是一名中文短视频（微信视频号）内容策划，服务"中年男性技术宅 @金木"的个人账号。
任务：根据给定的实时热榜候选话题，产出可直接拍摄的口播短视频脚本。

人设（硬性，一切产出都要贴住它）：
- @金木：中年男性技术宅，30 岁左右，北方人，说话像生活里吃过亏的老哥，实在、不端着、偶尔一句损话。
- 人设三层：技术宅（数码硬件、装机与系统、AI 与效率工具、开发者日常、数字生活、隐私数据）＋ 中年（房贷车贷、带娃、父母养老、职场尴尬、人情往来）＋ 北方（供暖暖气、干燥静电、澡堂洗浴、囤菜过冬、羽绒服棉裤、水垢结冰）。
- 每 5 条里，技术/数码/AI 类至少 2 条；家务生活类不超过 2 条；职场与消费避坑类不超过 2 条。
- 语气不许说教、不许鸡汤、不许成功学、不许纯情绪吐槽。
- 不要在脚本、描述、短标题中出现国名、政党、领导人、军事、游行、群体事件、社会案件、灾难事故、疫情等敏感词，也不要出现品牌互踩。

选题红线（硬性）：
1. 严禁涉及政治、时政、国际关系与领土争议、军事战争、民族宗教、领导人及其职务活动、选举投票、游行示威与群体事件、社会案件与灾难事故、疫情与食品安全事故、涉外人物与外媒相关内容。
2. 只做「生活化科普口播」：家务、健康、消费、职场、数码、出行、育儿、饮食技巧等普通人能用上的知识点。
3. 不得杜撰新闻事实，不得引用无法核实的具体数字、数据、机构结论；不得把热榜事件本身当作事实陈述，只能借其话题引出一个生活常识切入点。
4. 若候选话题中含敏感元素，直接跳过该条，不得出现在输出中。

产出硬性要求：
1. 输出严格 JSON，不要多余文字，不要 markdown 代码块。
2. 每条脚本含：title, tone, scene, timeline(4段), vo, light, hotSource, mats[3]
3. timeline 恰好 4 段，对应 0-3 秒 / 3-6 秒 / 6-9 秒 / 9-12 秒，每段格式：
   "0-3 秒｜Hook｜<表情/语气>｜<动作>｜<目的>｜「<台词>」"
   台词必须用「」包住；四段台词连起来与 vo 完全一致。
4. vo 为 45–60 个中文字符（含标点），按约 4.6 字/秒念，12 秒内说完。口语化、有钩子、不书面。
5. tone / scene / light 三块每条都写成不同版本，禁止逐字复用、禁止空泛套话。
6. 场景设定不得出现任何屏幕文字、招牌、海报文字；不得出现酒类内容。
7. mats 恰好 3 组 {desc, title}：A 反常识（打破常见认知）、B 共鸣（戳中日常痛点）、C 悬念提问（留一个让人想点开的问题）。
   desc：口语化、有信息量、结尾一句引导互动，末尾用空格分隔话题标签 5–7 个，
        至少 1 个大词（如 #生活常识 #职场 #养生），2-3 个中词，2-3 个精准长尾（如 #隔夜菜能吃吗）。
        禁绝对化用语（最、第一、100%、包治、根治等），禁外链与二维码，禁硬广。
   title：不超过 16 个汉字，带钩子且含核心关键词，不重复 desc 首句。
8. 场景与道具不得出现可辨识文字、屏幕文字、酒类内容。

输出 JSON 形状：{"scripts":[{"title":"","tone":"","scene":"","timeline":["","","",""],"vo":"","light":"","hotSource":"","mats":[{"desc":"","title":""},{"desc":"","title":""},{"desc":"","title":""}]}]}`;

function buildUserPrompt(rankedItems, count, extra, usedTitles){
  const used = (usedTitles || []).length ? '\n已用过的短标题（禁止重复）：\n' + usedTitles.join('、') + '\n' : '';
  return `今天（${new Date().toISOString().slice(0, 10)}）的实时热榜候选话题（已跨平台合并、按人设贴合度排好序）：

${topics.guide(rankedItems, count)}
${used}
请从【核心人设话题】里挑选 ${count} 个切入点（边缘话题只有能改造成技术宅/中年/北方视角才可用），生成 ${count} 条完整脚本。
${extra ? '额外要求：' + extra + '\n' : ''}
选题之间不要重复，同一话题不要用两次。每条脚本的 hotSource 写明它用的原始话题文字。`;
}

function buildRepairPrompt(card, issues){
  return `下面这条视频号脚本没通过规则校验，请修正后重新输出整条脚本（JSON，字段与原条一致）。

不合格项：
${issues.map(i => '- ' + i).join('\n')}

原脚本：
${JSON.stringify(card, null, 2)}

只输出修正后的完整 JSON 对象，字段：title, tone, scene, timeline(4段数组), vo, light, hotSource, mats(3组)。不要任何解释文字。`;
}

async function chat(messages, temperature = 0.85){
  const { base, key, model } = llmConfig();
  if (!key) throw new Error('未配置 LLM_API_KEY，请在「模板设置」页填写并保存');
  const body = JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages });
  const r = await fetchText(base + '/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body
  }, 180000);
  if (r.status !== 200) throw new Error('模型接口返回 ' + r.status + ': ' + r.body.slice(0, 300));
  const j = JSON.parse(r.body);
  const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!content) throw new Error('模型未返回内容');
  return content;
}

function parseScripts(content){
  const obj = JSON.parse(content);
  if (obj && obj.scripts) return obj.scripts;
  if (Array.isArray(obj)) return obj;
  if (obj && obj.title) return [obj];
  throw new Error('模型返回结构不符');
}

function normalizeCard(s, id){
  return {
    id: id || ('c' + Date.now() + Math.random().toString(36).slice(2, 6)),
    title: s.title || '',
    hot: s.hotSource || '',
    tone: s.tone || '',
    scene: s.scene || '',
    timeline: Array.isArray(s.timeline) ? s.timeline.join('\n') : (s.timeline || ''),
    light: s.light || '',
    vo: s.vo || '',
    mats: [0,1,2].map(i => ({
      desc: (s.mats && s.mats[i] && s.mats[i].desc) || '',
      title: (s.mats && s.mats[i] && s.mats[i].title) || ''
    }))
  };
}

async function generateAndValidate(rankedItems, count, extra){
  const rules = currentRules();
  const history = currentHistory();
  const usedTitles = history.slice(-rules.recent);

  const content = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(rankedItems, count, extra, usedTitles) }
  ]);
  const cards = parseScripts(content).slice(0, count).map((s, i) => normalizeCard(s, 'c' + i));

  const MAX_REPAIR = 2;
  for (let round = 0; round < MAX_REPAIR; round++){
    let needRepair = false;
    cards.forEach(card => {
      const issues = validateScript(card, { rules, peers: cards, history: usedTitles });
      card.issues = issues;
      if (issues.some(x => x.level === 'err')) needRepair = true;
    });
    if (!needRepair) break;

    for (let i = 0; i < cards.length; i++){
      const errs = (cards[i].issues || []).filter(x => x.level === 'err');
      if (!errs.length) continue;
      try {
        const fix = await chat([
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildRepairPrompt(cards[i], errs.map(e => e.msg)) }
        ], 0.6);
        const fixed = normalizeCard(parseScripts(fix)[0], cards[i].id);
        const merged = { ...cards[i], ...fixed };
        const re = validateScript(merged, { rules, peers: cards, history: usedTitles });
        if (re.filter(x => x.level === 'err').length < errs.length) cards[i] = merged;
      } catch(e){}
    }
  }

  const final = cards.map(card => {
    const issues = validateScript(card, { rules, peers: cards, history: usedTitles });
    const blob = card.title + card.tone + card.scene + card.light + card.vo + card.timeline + card.mats.map(m => m.desc + m.title).join('');
    const all = sens.containsHardBlock(blob)
      ? issues.concat([{ level: 'err', msg: '内容可能涉及敏感话题，请人工复核' }])
      : issues;
    return { ...card, issues: all, ok: !all.some(x => x.level === 'err') };
  });

  return { scripts: final, count: final.length };
}

/* ---------- 模板 / 规则 / 历史 ---------- */
function currentSpec(){ return readJSON('spec.json', null); }
function currentRules(){
  const s = currentSpec();
  return (s && s.rules) || { wordMin: 45, wordMax: 60, speed: 4.8, duration: 12, titleMax: 16, tagsMin: 5, recent: 10 };
}
function currentHistory(){ return readJSON('history.json', []); }
function recordTitles(titles){
  const h = currentHistory();
  titles.filter(Boolean).forEach(t => { if (h.indexOf(t) < 0) h.push(t); });
  writeJSON('history.json', h.slice(-200));
  return h;
}

/* ---------- 静态文件 ---------- */
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.png':'image/png', '.md':'text/markdown; charset=utf-8' };
function serveStatic(req, res, pathname){
  const p = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    res.end(buf);
  });
}
function json(res, code, obj){
  const b = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
  res.end(b);
}
function readBody(req){
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 2e6) { req.destroy(); reject(new Error('too large')); } });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch(e){ reject(e); } });
  });
}

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  const p = u.pathname;
  try {
    if (p === '/api/health'){
      const c = llmConfig();
      return json(res, 200, { ok:true, llm: !!c.key, model: c.model, base: c.base });
    }
    if (p === '/api/config' && req.method === 'GET'){
      const c = llmConfig();
      return json(res, 200, { base: c.base, model: c.model, hasKey: !!c.key });
    }
    if (p === '/api/config' && req.method === 'POST'){
      const body = await readBody(req);
      setEnvVars({ base: body.base, model: body.model, key: body.key });
      /* 立即生效：进程内覆盖（Render 上环境变量优先，故此处同步覆盖 process.env） */
      if (body.base) process.env.LLM_BASE_URL = body.base;
      if (body.key) process.env.LLM_API_KEY = body.key;
      if (body.model) process.env.LLM_MODEL = body.model;
      return json(res, 200, { ok:true, base: llmConfig().base, model: llmConfig().model, hasKey: !!llmConfig().key });
    }
    if (p === '/api/spec' && req.method === 'GET'){
      return json(res, 200, currentSpec() || { fixed: '', rules: currentRules() });
    }
    if (p === '/api/spec' && req.method === 'POST'){
      const body = await readBody(req);
      return json(res, 200, writeJSON('spec.json', body));
    }
    if (p === '/api/history' && req.method === 'GET'){
      return json(res, 200, { items: currentHistory() });
    }
    if (p === '/api/history' && req.method === 'POST'){
      const body = await readBody(req);
      const items = currentHistory();
      (body.items || []).forEach(t => { if (t && items.indexOf(t) < 0) items.push(t); });
      writeJSON('history.json', items.slice(-200));
      return json(res, 200, { items });
    }
    if (p === '/api/history' && req.method === 'DELETE'){
      writeJSON('history.json', []);
      return json(res, 200, { items: [] });
    }
    if (p === '/api/hot' && req.method === 'GET'){
      try { return json(res, 200, await fetchHot()); }
      catch(e){ return json(res, 500, { error: '热榜抓取失败: ' + e.message }); }
    }
    /* 选题池预览：热榜核心 + 人设话题库补足后的候选 */
    if (p === '/api/topics' && req.method === 'GET'){
      const hot = await fetchHot();
      const b = topics.buildCandidates(hot.items, +(req.url.split('count=')[1] || 5));
      return json(res, 200, b);
    }
    /* 人设诊断：看当前热榜与人设的匹配情况 */
    if (p === '/api/persona' && req.method === 'GET'){
      const hot = await fetchHot();
      const items = hot.items.map(i => {
        const p = persona.score(i.title);
        return { title: i.title, source: i.source, sources: i.sources || [], heat: i.heat, level: persona.level(p), tech: p.tech, midlife: p.midlife, north: p.north };
      });
      return json(res, 200, { counts: hot.counts, items });
    }
    if (p === '/api/generate' && req.method === 'POST'){
      const body = await readBody(req);
      const count = Math.min(+(body.count || 5), 10);
      let items = body.hotItems || [];
      /* 前端勾选的条目：只剔红线，其余保留 */
      items = items.filter(it => it && it.title && !sens.isHardBlocked(it.title));
      if (!items.length) items = (await fetchHot()).items;
      /* 人设分层排序 */
      items = persona.rank(items.map(it => ({ ...it })));
      try {
        const out = await generateAndValidate(items, count, body.extra);
        const titles = [];
        out.scripts.forEach(c => c.mats.forEach(m => { if (m.title) titles.push(m.title.trim()); }));
        recordTitles(titles);
        return json(res, 200, out);
      } catch(e){ return json(res, 500, { error: e.message }); }
    }
    if (p === '/api/validate' && req.method === 'POST'){
      const body = await readBody(req);
      const cards = (body.cards || []).map(c => normalizeCard(c, c.id));
      const rules = body.rules || currentRules();
      const history = body.history || currentHistory().slice(-rules.recent);
      const out = cards.map(c => {
        const issues = validateScript(c, { rules, peers: cards, history });
        return { id: c.id, issues, ok: !issues.some(x => x.level === 'err') };
      });
      return json(res, 200, { results: out });
    }
    return serveStatic(req, res, p);
  } catch(e){ return json(res, 500, { error: e.message }); }
});

server.listen(PORT, () => {
  console.log('脚本生成器已启动: http://localhost:' + PORT);
  if (!llmConfig().key) console.log('提示: 未配置 LLM_API_KEY，热榜可用，脚本生成需要配置。');
});
