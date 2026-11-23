/* 视频号脚本标准化生成器 · 前端 */
const LS_CARDS = 'vs.cards.v1';
const LS_SPEC_CACHE = 'vs.spec.cache.v1';

const DEFAULT_SPEC = {
  fixed: `规格：12 秒，9:16 竖屏，1080×1920，25fps，单段一次生成；第一帧必须是中年男人人脸说话，无片头黑场，0.5 秒内开口；不设前奏、不设转场特效
人物一致性：男主严格参考图片 1（服装、发型、脸型、体型全程一致），AI 数字分身 @金木，中年男性技术宅，30 岁左右，北方人
后期字幕：不要生成任何字幕，字幕后期由剪映统一添加；配乐压到人声 30% 以下
负面词：画面中严禁出现任何文字、字母、数字、字幕条、底部字幕、顶部标题、角标、水印、手机屏幕文字、纸片文字、墙上文字、菜单文字、价签文字、书本文字；绝对不要在画面顶部和底部区域生成任何文字；不要画面扭曲变形，不要肢体畸形，不要手部变形，不要多指，不要面部崩坏，不要人物数量突变，不要脸型或服装发生变化；不要出现第二个人说话的声音，不要出现与口播无关的人声、杂音、嘈杂背景人声；人物语音清晰自然，口型与语音同步，语音不要含糊不清；不要道具凭空出现或消失，不要镜头剧烈晃动，不要过曝或死黑，不要慢动作
出境人物：@金木`,
  rules: { wordMin: 45, wordMax: 60, speed: 4.8, duration: 12, titleMax: 16, tagsMin: 5, recent: 10 }
};

const RULE_TEXTS = [
  '固定块逐字复用，不得改写或压缩',
  '风格调性 / 场景设定 / 镜头光线 三块每条必须重写，不得逐字复用',
  '脚本中不得出现图片 2（酣客酱酒）及任何酒瓶内容',
  '四段时间轴 0-3 / 3-6 / 6-9 / 9-12 秒，每段含表情、动作、情绪、目的、台词',
  '首帧即人脸、0.5 秒内开口、无片头黑场',
  '口播字数在区间内且除以时长不超过每秒字数上限',
  '画面中严禁任何文字、字母、数字、水印',
  '不生成字幕，后期剪映统一添加；配乐压到人声 30% 以下',
  '每条出三套「描述 + 短标题」成对组合，角度分别为反常识 / 共鸣 / 悬念',
  '描述口语化有信息量、结尾引导互动、末尾话题标签 ≥ 5 个（1 大词 + 2-3 中词 + 2-3 精准长尾）',
  '短标题 ≤ 16 字、有钩子带核心关键词、不重复描述首句',
  '短标题不与近 N 条已用标题重复',
  '选题须来自实时热榜，不得杜撰新闻事实或引用无法核实的数字',
  '绝对红线话题（政治军事、群体事件、社会案件、灾难事故）不进选题池；其余话题全部保留，按人设贴合度分层取用',
  '选题必须落在「核心人设话题」：技术宅 + 中年 + 北方 三层标签'
];

const BANNED = ['最好','第一','国家级','绝对','100%','唯一','永久','根治','包治','万能','彻底解决','绝对有效','最强','秒杀'];

let spec = load(LS_SPEC_CACHE, DEFAULT_SPEC);
let cards = load(LS_CARDS, null);
let history = [];
let hotItems = [];
let serverIssues = {};

function load(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function save(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ---------- tabs ---------- */
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $('#tab-' + t.dataset.tab).classList.add('active');
  if (t.dataset.tab === 'out') renderPreview();
  if (t.dataset.tab === 'history') renderHistory();
});

/* ---------- spec ---------- */
function fillSpec(){
  $('#spec-fixed').value = spec.fixed || '';
  $('#rule-word-min').value = spec.rules.wordMin;
  $('#rule-word-max').value = spec.rules.wordMax;
  $('#rule-speed').value = spec.rules.speed;
  $('#rule-duration').value = spec.rules.duration;
  $('#rule-title-max').value = spec.rules.titleMax;
  $('#rule-tags').value = spec.rules.tagsMin;
  $('#rule-recent').value = spec.rules.recent;
  $('#rule-list').innerHTML = RULE_TEXTS.map(r => '<li>' + r + '</li>').join('');
}
$('#btn-save-spec').onclick = async () => {
  spec.fixed = $('#spec-fixed').value;
  spec.rules = {
    wordMin: +$('#rule-word-min').value, wordMax: +$('#rule-word-max').value,
    speed: +$('#rule-speed').value, duration: +$('#rule-duration').value,
    titleMax: +$('#rule-title-max').value, tagsMin: +$('#rule-tags').value,
    recent: +$('#rule-recent').value
  };
  save(LS_SPEC_CACHE, spec);
  try {
    const r = await fetch('/api/spec', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(spec) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '保存失败');
    flash('已保存到服务端');
  } catch(e){ flash('已存本地，服务端保存失败: ' + e.message); }
  renderAll();
};
function flash(msg){ $('#spec-saved').textContent = msg; setTimeout(()=> $('#spec-saved').textContent = '', 2500); }

$('#btn-save-cfg').onclick = async () => {
  const body = { base: $('#cfg-base').value.trim(), key: $('#cfg-key').value.trim(), model: $('#cfg-model').value.trim() };
  try {
    const r = await fetch('/api/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '保存失败');
    flash('模型配置已保存');
  } catch(e){ flash('保存失败: ' + e.message); }
};

/* ---------- hot ---------- */
const LEVEL_LABEL = { core: '核心人设', edge: '边缘相关', off: '与人设无关' };
async function loadHot(){
  $('#hot-status').textContent = '抓取中…';
  try {
    const r = await fetch('/api/hot');
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '抓取失败');
    hotItems = j.items || [];
    renderHot(j);
    const c = j.counts || {};
    $('#hot-status').textContent = '已更新 ' + new Date(j.fetchedAt).toLocaleString() +
      ' · 共 ' + (j.total || 0) + ' 条（已跨平台合并去重）· 核心人设 ' + (c.core || 0) + ' 条 / 边缘 ' + (c.edge || 0) + ' 条 / 无关 ' + (c.off || 0) + ' 条 · 剔除红线 ' + (j.blockedCount || 0) + ' 条';
    renderSourceStatus(j.sourceStatus || []);
  } catch(e){
    $('#hot-status').textContent = '热榜抓取失败: ' + e.message;
  }
}

function renderSourceStatus(list){
  let box = document.getElementById('hot-sources');
  if (!box){
    box = document.createElement('div');
    box.id = 'hot-sources';
    box.className = 'hot-sources';
    const anchor = document.getElementById('hot-status');
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
  }
  box.innerHTML = '';
  list.forEach(s => {
    const b = document.createElement('span');
    b.className = 'src-chip' + (s.count ? '' : ' zero');
    b.textContent = s.source + ' ' + s.count;
    b.title = s.count ? ('已抓到 ' + s.count + ' 条') : '未取到数据（需登录或接口变更）';
    box.appendChild(b);
  });
}

function renderHot(j){
  const box = $('#hot-list');
  box.innerHTML = '';
  const order = ['core','edge','off'];
  const labels = {
    core: '核心人设 · 优先选用',
    edge: '边缘相关 · 能改成人设视角才选',
    off: '与人设无关 · 不用'
  };
  const groups = { core: [], edge: [], off: [] };
  (j.items||[]).forEach(it => {
    const lv = (it.personaLevel && groups[it.personaLevel]) ? it.personaLevel : 'off';
    groups[lv].push(it);
  });
  order.forEach(lv => {
    const arr = groups[lv];
    if (!arr.length) return;
    const h = document.createElement('h3');
    h.textContent = labels[lv] + '（' + arr.length + '）';
    box.appendChild(h);
    arr.forEach(it => {
      const row = document.createElement('label');
      row.className = 'hot-row lv-' + lv + (it.soft ? ' soft' : '');
      const tags = [];
      if (it.persona){
        if (it.persona.tech) tags.push('技术宅×' + it.persona.tech);
        if (it.persona.midlife) tags.push('中年×' + it.persona.midlife);
        if (it.persona.north) tags.push('北方×' + it.persona.north);
      }
      const srcs = it.sources && it.sources.length ? it.sources.join('/') : (it.source || '');
      row.innerHTML = '<input type="checkbox" value="" /> <span class="ht"></span>' +
        '<span class="lvl lvl-' + lv + '">' + LEVEL_LABEL[lv] + '</span>' +
        (tags.length ? '<span class="tags">｜' + tags.join(' ') + '</span>' : '') +
        (it.soft ? '<span class="hs warn">待复核</span>' : '') +
        (it.heat ? '<span class="hh">热度 ' + it.heat + '</span>' : '') +
        (it.sources && it.sources.length > 1 ? '<span class="hs">' + it.sources.length + ' 榜</span>' : '') +
        (srcs ? '<span class="hs src">' + srcs + '</span>' : '');
      row.querySelector('.ht').textContent = it.title;
      if (it.heat) row.querySelector('.hh').textContent = '热度 ' + it.heat;
      row.querySelector('input').dataset.title = it.title;
      row.querySelector('input').dataset.source = srcs;
      box.appendChild(row);
    });
  });
}
$('#btn-refresh-hot').onclick = loadHot;

/* ---------- generate ---------- */
async function generate(){
  const checked = $$('#hot-list input[type=checkbox]').filter(c => c.checked);
  const items = checked.length
    ? checked.map(c => ({ title: c.dataset.title, source: c.dataset.source }))
    : hotItems.filter(i => i.personaLevel === 'core').slice(0, 40);
  const count = +$('#gen-count').value || 5;
  const extra = $('#gen-extra').value.trim();
  const btn = $('#btn-generate');
  btn.disabled = true; btn.textContent = '生成中…';

  const GEN_TIMEOUT = 300000; // 单条最多 5 分钟
  async function fetchWithTimeout(url, opts){
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), GEN_TIMEOUT);
    try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
    finally { clearTimeout(t); }
  }

  try {
    $('#hot-status').textContent = '正在唤醒服务（冷启动）…';
    try { await fetchWithTimeout('/api/health', {}); } catch(e){}

    const out = [];
    for (let i = 0; i < count; i++){
      $('#hot-status').textContent = '正在生成第 ' + (i+1) + ' / ' + count + ' 条（含自动校验修复，单条约 40–90 秒）…';
      try {
        const r = await fetchWithTimeout('/api/generate', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ count: 1, extra, hotItems: items })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || '生成失败');
        if (j.scripts && j.scripts.length) out.push.apply(out, j.scripts);
      } catch(e){
        $('#hot-status').textContent = '第 ' + (i+1) + ' 条生成失败: ' + e.message + '（继续下一条）';
      }
    }
    if (!out.length) throw new Error('没有成功生成任何脚本');
    applyScripts(out);
    await loadHistory();
    $('#hot-status').textContent = '已生成 ' + out.length + ' 条脚本，已自动校验';
    $$('.tab').forEach(x => x.classList.remove('active'));
    $$('.panel').forEach(x => x.classList.remove('active'));
    $('.tab[data-tab=gen]').classList.add('active');
    $('#tab-gen').classList.add('active');
  } catch(e){
    $('#hot-status').textContent = '生成失败: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = '用选中热榜生成脚本';
  }
}

$('#btn-gen').onclick = async () => { if (!hotItems.length) await loadHot(); generate(); };

function applyScripts(list){
  $('#cards').innerHTML = '';
  serverIssues = {};
  (list || []).forEach(s => {
    serverIssues[s.id] = (s.issues || []).map(i => ({ t: i.level, m: i.msg }));
    const c = {
      id: s.id,
      title: s.title || '', hot: s.hot || '', tone: s.tone || '', scene: s.scene || '',
      timeline: Array.isArray(s.timeline) ? s.timeline.join('\n') : (s.timeline || ''),
      light: s.light || '', vo: s.vo || '',
      mats: [0,1,2].map(i => ({ desc: (s.mats && s.mats[i] && s.mats[i].desc) || '', title: (s.mats && s.mats[i] && s.mats[i].title) || '' }))
    };
    c.all = composeText(c);
    addCard(c);
  });
  collect(); renderAll();
}

/* ---------- cards ---------- */
function emptyCard(){
  return { id: 'c' + Date.now() + Math.random().toString(36).slice(2,6),
    title:'', hot:'', tone:'', scene:'', timeline:'', light:'', vo:'', all:'',
    mats:[{desc:'',title:''},{desc:'',title:''},{desc:'',title:''}] };
}
function addCard(data){
  const c = data || emptyCard();
  const root = $('#card-tpl').content.cloneNode(true).querySelector('.card');
  root.dataset.id = c.id;
  root.querySelector('.c-hot').value = c.hot || '';
  root.querySelector('.c-all').value = c.all || composeText(c);
  root.querySelectorAll('.mat').forEach((m, i) => {
    m.querySelector('.m-desc').value = (c.mats[i]||{}).desc || '';
    m.querySelector('.m-title').value = (c.mats[i]||{}).title || '';
  });
  root.querySelector('.del').onclick = () => { root.remove(); delete serverIssues[c.id]; collect(); renderAll(); };
  root.querySelector('.c-copy').onclick = () => { copyText(root.querySelector('.c-all').value, root.querySelector('.c-copy')); };
  root.querySelectorAll('.m-desc, .m-title').forEach(el => {
    el.addEventListener('focus', () => { copyText(el.value, el); });
  });
  root.addEventListener('input', () => { collect(); renderAll(); });
  $('#cards').appendChild(root);
  return root;
}
function collect(){
  cards = $$('#cards .card').map(root => {
    const all = root.querySelector('.c-all').value;
    const parsed = parseText(all);
    return Object.assign({
      id: root.dataset.id,
      hot: root.querySelector('.c-hot').value,
      all: all,
      mats: Array.from(root.querySelectorAll('.mat')).map(m => ({ desc: m.querySelector('.m-desc').value, title: m.querySelector('.m-title').value }))
    }, parsed);
  });
  save(LS_CARDS, cards);
}
function loadCards(){
  $('#cards').innerHTML = '';
  if (!cards || !cards.length) { addCard(); addCard(); }
  else cards.forEach(c => addCard(Object.assign({}, c, { all: (c.all && c.all.indexOf('固定块') >= 0) ? c.all : composeText(c) })));
  collect();
}

/* ---------- 合并框：合成 / 解析 / 复制 ---------- */
const FIELD_KEYS = { '标题':'title', '风格调性':'tone', '场景设定':'scene', '镜头光线':'light', '口播文案':'vo' };
function composeText(c){
  const L = [];
  L.push('标题：' + (c.title || ''));
  L.push('');
  L.push('风格调性：' + (c.tone || ''));
  L.push('');
  L.push('场景设定：' + (c.scene || ''));
  L.push('');
  L.push('时间轴分镜（四段）：');
  splitLines(c.timeline).forEach(l => L.push(l));
  L.push('');
  L.push('镜头光线：' + (c.light || ''));
  L.push('');
  L.push('口播文案：' + (c.vo || ''));
  L.push('');
  L.push('固定块（逐字复用）：');
  String((spec && spec.fixed) || '').split('\n').forEach(l => L.push(l));
  return L.join('\n');
}
function parseText(t){
  const res = { title:'', tone:'', scene:'', timeline:'', light:'', vo:'' };
  let cur = '';
  String(t || '').split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    let key = '';
    for (const k in FIELD_KEYS) if (line.indexOf(k) === 0) { key = FIELD_KEYS[k]; break; }
    if (key){
      const i = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：');
      res[key] = i >= 0 ? line.slice(i + 1).trim() : '';
      cur = key;
      return;
    }
    if (line.indexOf('时间轴分镜') === 0){
      const i = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：');
      res.timeline = i >= 0 ? line.slice(i + 1).trim() : '';
      cur = 'timeline';
      return;
    }
    if (line.indexOf('固定块') === 0) { cur = ''; return; }
    if (cur === 'timeline'){ res.timeline += (res.timeline ? '\n' : '') + line; return; }
    if (cur) res[cur] += line;
  });
  return res;
}
async function copyText(text, el){
  if (!text) return;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; }
  catch(e){
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok = true;
    } catch(e2){}
  }
  if (!el) return;
  if (ok){
    el.classList.add('copied');
    if (el.tagName === 'BUTTON'){
      const old = el.textContent;
      el.textContent = '已复制';
      setTimeout(() => { el.textContent = old; }, 1400);
    } else {
      const tag = el.parentElement && el.parentElement.querySelector('.tag');
      if (tag){
        const old = tag.textContent;
        tag.textContent = '已复制';
        setTimeout(() => { tag.textContent = old; }, 1400);
      }
    }
    setTimeout(() => el.classList.remove('copied'), 1400);
  }
}

/* ---------- 本地校验 ---------- */
function countWords(s){
  const t = String(s||'');
  const cjk = (t.match(/[\u4e00-\u9fff\u3040-\u30ff]/g)||[]).length;
  const latin = (t.replace(/[\u4e00-\u9fff\u3040-\u30ff]/g,' ').match(/[A-Za-z0-9]+/g)||[]).length;
  return cjk + latin;
}
function splitLines(v){ return String(v||'').split('\n').map(x=>x.trim()).filter(Boolean); }
function timelineSegments(v){ return splitLines(v).filter(l => /\d+\s*-\s*\d+\s*秒/.test(l)); }
function quotes(v){ const m = String(v||'').match(/[「」“”"'‘]/g); return m ? m.length : 0; }
function tagsOf(d){ return String(d||'').match(/#[^\s#]+/g) || []; }

function validate(card, allCards){
  const r = spec.rules, out = [];
  const push = (t, m) => out.push({t, m});
  if (!card.title.trim()) push('err', '缺脚本标题');
  if (!card.tone.trim()) push('err', '缺风格调性');
  if (!card.scene.trim()) push('err', '缺场景设定');
  if (!card.light.trim()) push('err', '缺镜头光线');

  const segs = timelineSegments(card.timeline);
  if (segs.length !== 4) push('err', '时间轴需 4 段（0-3/3-6/6-9/9-12 秒），当前 ' + segs.length + ' 段');
  else if (segs.some(s => quotes(s) < 2)) push('err', '时间轴每段需含台词（用「」包住）');

  const vo = card.vo.trim(), n = countWords(vo);
  if (!vo) push('err', '缺口播文案');
  else {
    if (n < r.wordMin || n > r.wordMax) push('err', '口播 ' + n + ' 字，需在 ' + r.wordMin + '–' + r.wordMax + ' 字');
    const sp = n / r.duration;
    if (sp > r.speed) push('err', '语速 ' + sp.toFixed(1) + ' 字/秒，超出上限 ' + r.speed);
    else if (sp > r.speed - 0.4) push('warn', '语速 ' + sp.toFixed(1) + ' 字/秒，接近上限');
  }

  if (/酒|酱酒|酣客/.test(card.vo + card.scene + card.timeline)) push('err', '出现酒相关内容，脚本中禁止');

  const norm = s => String(s||'').replace(/\s+/g,'');
  if (card.tone.trim() && allCards.some(c => c.id !== card.id && norm(c.tone) === norm(card.tone))) push('err', '风格调性与其他条目逐字重复');
  if (card.scene.trim() && allCards.some(c => c.id !== card.id && norm(c.scene) === norm(card.scene))) push('warn', '场景设定与其他条目相同');
  if (card.light.trim() && allCards.some(c => c.id !== card.id && norm(c.light) === norm(card.light))) push('warn', '镜头光线与其他条目相同');

  const titles = [];
  card.mats.forEach((m, i) => {
    const L = ['A','B','C'][i];
    if (!m.desc.trim()) { push('err', L + ' 缺视频描述'); return; }
    if (!m.title.trim()) { push('err', L + ' 缺短标题'); return; }
    const tags = tagsOf(m.desc);
    if (tags.length < r.tagsMin) push('err', L + ' 描述话题标签 ' + tags.length + ' 个，需 ≥ ' + r.tagsMin);
    const tw = countWords(m.title);
    if (tw > r.titleMax) push('err', L + ' 短标题 ' + tw + ' 字，超出 ' + r.titleMax + ' 字');
    if (titles.indexOf(m.title.trim()) >= 0) push('err', L + ' 短标题与本条其他组重复');
    if (history.indexOf(m.title.trim()) >= 0) push('err', L + ' 短标题与近 ' + r.recent + ' 条已用标题重复');
    if (BANNED.some(b => m.desc.indexOf(b) >= 0 || m.title.indexOf(b) >= 0)) push('err', L + ' 含绝对化/违规词');
    titles.push(m.title.trim());
  });
  const firsts = card.mats.map(m => String(m.desc).trim().split(/[。！？\n]/)[0]);
  if (firsts.every(Boolean) && new Set(firsts).size < firsts.length) push('warn', '三组描述首句有重复');
  return out;
}

/* ---------- render ---------- */
function renderChecks(){
  const all = $$('#cards .card').map(root => {
    const p = parseText(root.querySelector('.c-all').value);
    return { id: root.dataset.id, tone: p.tone, scene: p.scene, light: p.light };
  });
  $$('#cards .card').forEach(root => {
    const card = Object.assign({ id: root.dataset.id }, parseText(root.querySelector('.c-all').value), {
      mats: Array.from(root.querySelectorAll('.mat')).map(m => ({ desc: m.querySelector('.m-desc').value, title: m.querySelector('.m-title').value }))
    });
    const local = validate(card, all);
    const srv = (serverIssues[card.id] || []).filter(i => i.t === 'err');
    const seen = new Set();
    const res = local.concat(srv).filter(i => { const k = i.t + '|' + i.m; if (seen.has(k)) return false; seen.add(k); return true; });
    const box = root.querySelector('.checks');
    box.innerHTML = res.length
      ? res.map(x => '<span class="' + x.t + '">' + (x.t === 'err' ? '✗ ' : '! ') + x.m + '</span>').join('')
      : '<span class="ok">✓ 全部通过</span>';
  });
}
function renderAll(){
  renderChecks();
  $('#summary').textContent = '共 ' + $$('#cards .card').length + ' 条，错误 ' + $$('.checks .err').length + '，提醒 ' + $$('.checks .warn').length;
  if ($('#tab-out').classList.contains('active')) renderPreview();
}

/* ---------- output ---------- */
function buildScriptText(card){
  const L = [];
  L.push('## 脚本 ' + (card.title || '未命名'));
  if (card.hot) L.push('');
  if (card.hot) L.push('**选题来源**：' + card.hot);
  L.push('');
  L.push('**风格调性**：' + (card.tone || '（待填）'));
  L.push('');
  L.push('**场景设定**：' + (card.scene || '（待填）'));
  L.push('');
  L.push('**时间轴分镜**（首帧即人脸、0.5 秒内开口）：');
  splitLines(card.timeline).forEach(l => L.push('- ' + l));
  L.push('');
  const n = countWords(card.vo);
  L.push('**口播（' + n + ' 字，约 ' + (n / spec.rules.duration).toFixed(1) + ' 字/秒，' + spec.rules.duration + ' 秒内说完）**：' + (card.vo || ''));
  L.push('');
  L.push('**镜头光线**：' + (card.light || '（待填）'));
  L.push('');
  L.push('**发布物料**');
  card.mats.forEach((m, i) => {
    L.push('- ' + ['A｜反常识','B｜共鸣','C｜悬念'][i] + '｜描述：' + (m.desc||''));
    L.push('  短标题：' + (m.title||''));
  });
  return L.join('\n');
}
function buildFullText(){
  const out = [];
  out.push('# 视频号脚本 ' + new Date().toISOString().slice(0,10));
  out.push('');
  out.push('> 每条脚本正文末尾已附固定块（逐字复用），此处不再重复。');
  out.push('');
  cards.forEach(c => { out.push(buildScriptText(c)); out.push('---'); });
  return out.join('\n');
}
function renderPreview(){ $('#out-preview').textContent = buildFullText(); }

$('#btn-add').onclick = () => { addCard(); collect(); renderAll(); };
$('#btn-copy-all').onclick = async () => {
  const text = buildFullText();
  try { await navigator.clipboard.writeText(text); }
  catch(e){ const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  await recordHistory();
  $('#summary').textContent = '已复制全部到剪贴板';
};
$('#btn-export-md').onclick = async () => { download('video-scripts-' + stamp() + '.md', buildFullText(), 'text/markdown'); await recordHistory(); };
$('#btn-export-json').onclick = async () => { download('video-scripts-' + stamp() + '.json', JSON.stringify({ spec, cards }, null, 2), 'application/json'); await recordHistory(); };
function stamp(){ const d = new Date(); const p = n => String(n).padStart(2,'0'); return d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }
async function recordHistory(){
  const titles = [];
  cards.forEach(c => c.mats.forEach(m => { const t = (m.title||'').trim(); if (t && titles.indexOf(t) < 0) titles.push(t); }));
  try {
    const r = await fetch('/api/history', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items: titles }) });
    const j = await r.json();
    if (j.items) history = j.items;
  } catch(e){
    titles.forEach(t => { if (history.indexOf(t) < 0) history.push(t); });
  }
  renderHistory();
}
function download(name, text, mime){
  const b = new Blob([text], { type: mime + ';charset=utf-8' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  $('#summary').textContent = '已导出 ' + name;
}
async function loadHistory(){
  try {
    const r = await fetch('/api/history');
    const j = await r.json();
    history = j.items || [];
  } catch(e){ history = load('vs.history.v1', []); }
  renderHistory();
}
function renderHistory(){
  $('#history-list').innerHTML = history.length ? history.map(h => '<li>' + h + '</li>').join('') : '<li>暂无</li>';
}
$('#btn-clear-history').onclick = async () => {
  try { await fetch('/api/history', { method:'DELETE' }); } catch(e){}
  history = []; renderHistory();
};

/* ---------- init ---------- */
fillSpec();
loadCards();
renderAll();
(async function init(){
  try {
    const r = await fetch('/api/spec');
    const j = await r.json();
    if (j && j.fixed){ spec = { fixed: j.fixed, rules: Object.assign({}, DEFAULT_SPEC.rules, j.rules || {}) }; save(LS_SPEC_CACHE, spec); fillSpec(); }
  } catch(e){}
  try {
    const r = await fetch('/api/config');
    const j = await r.json();
    if (j.base) $('#cfg-base').value = j.base;
    if (j.model) $('#cfg-model').value = j.model;
    if (!j.hasKey){ const el = $('#cfg-key'); if (el) el.placeholder = '未配置，点「保存模型配置」填入'; }
  } catch(e){}
  await loadHistory();
  try {
    const r = await fetch('/api/version');
    const j = await r.json();
    const el = $('#app-version');
    if (el && j && j.version) el.textContent = 'v' + j.version + (j.commit ? ' · ' + j.commit : '');
  } catch(e){}
})();
