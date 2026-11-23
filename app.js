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
  const count = +$('#gen-count').value || 1;
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
    const topics = items.map(it => it.title);
    const data = await post('/api/generate', { topics, tone: '犀利科普', settings: spec, materials: true, count, extra });
    if (data.cards){
      cards = data.cards;
      save(LS_CARDS, cards);
      renderAll();
      if (data.issues) serverIssues = data.issues;
    }
  } catch(e){
    alert('生成失败: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '用选中热榜生成脚本';
  }
}
$('#btn-generate').onclick = generate;
$('#btn-gen').onclick = generate;

/* ---------- cards ---------- */
function renderAll(){
  const box = $('#cards');
  box.innerHTML = '';
  (cards || []).forEach((c, i) => {
    const node = $('#card-tpl').content.cloneNode(true);
    const el = node.querySelector('.card');
    el.dataset.i = i;
    el.querySelector('.c-hot').value = c.hot || '';
    el.querySelector('.c-all').value = c.all || '';
    const mats = el.querySelectorAll('.mat');
    (c.materials || []).forEach((m, j) => {
      if (mats[j]){
        mats[j].querySelector('.m-desc').value = m.desc || '';
        mats[j].querySelector('.m-title').value = m.title || '';
      }
    });
    el.querySelector('.c-copy').onclick = () => copyText(el.querySelector('.c-all').value);
    el.querySelector('.del').onclick = () => { cards.splice(i,1); save(LS_CARDS, cards); renderAll(); };
    el.querySelector('.c-all').oninput = () => { cards[i].all = el.querySelector('.c-all').value; save(LS_CARDS, cards); };
    el.querySelector('.c-hot').oninput = () => { cards[i].hot = el.querySelector('.c-hot').value; save(LS_CARDS, cards); };
    mats.forEach((m, j) => {
      m.querySelector('.m-desc').oninput = () => { cards[i].materials[j].desc = m.querySelector('.m-desc').value; save(LS_CARDS, cards); };
      m.querySelector('.m-title').oninput = () => { cards[i].materials[j].title = m.querySelector('.m-title').value; save(LS_CARDS, cards); };
      m.querySelector('.m-desc').onclick = () => copyText(m.querySelector('.m-desc').value);
      m.querySelector('.m-title').onclick = () => copyText(m.querySelector('.m-title').value);
    });
    box.appendChild(node);
  });
  $('#summary').textContent = (cards || []).length + ' 条脚本';
}

function copyText(t){
  navigator.clipboard.writeText(t).then(() => {
    // 可以在这里加一个 toast 提示
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

$('#btn-add').onclick = () => {
  cards.push({ hot: '', all: '', materials: [{desc:'',title:''},{desc:'',title:''},{desc:'',title:''}] });
  save(LS_CARDS, cards);
  renderAll();
};

/* ---------- history ---------- */
async function renderHistory(){
  try {
    const r = await fetch('/api/history');
    const j = await r.json();
    history = j.items || [];
    $('#history-list').innerHTML = history.map(h => '<li><span>' + h.title + '</span><span class="time">' + new Date(h.time).toLocaleString() + '</span></li>').join('');
  } catch(e){ console.error(e); }
}
$('#btn-clear-history').onclick = async () => {
  if (!confirm('确定清空历史标题？')) return;
  try {
    await fetch('/api/history/clear', { method: 'POST' });
    renderHistory();
  } catch(e){ console.error(e); }
};

/* ---------- api ---------- */
async function post(url, body){
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || '请求失败');
  return j;
}

/* ---------- version ---------- */
(async () => {
  try {
    const r = await fetch('/api/version');
    const j = await r.json();
    $('#app-version').textContent = 'v' + j.version + ' · ' + (j.commit || '').slice(0, 7);
  } catch(e){ $('#app-version').textContent = 'v?'; }
})();

/* ---------- init ---------- */
fillSpec();
renderAll();
