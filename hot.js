/**
 * 多平台热榜采集
 * 每个平台一个适配器，统一输出 { title, heat, source }
 * 失败返回空数组，不影响其他平台
 */
const https = require('https');
const http = require('http');
const zlib = require('zlib');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function request(url, opts = {}, timeout = 15000){
  return new Promise(resolve => {
    let u;
    try { u = new URL(url); } catch(e){ return resolve({ status: 0, body: '', headers: {} }); }
    const lib = u.protocol === 'https:' ? https : http;
    const headers = Object.assign({
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate'
    }, opts.headers || {});
    const req = lib.request(u, { method: opts.method || 'GET', headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        const enc = res.headers['content-encoding'];
        if (enc === 'gzip') { try { buf = zlib.gunzipSync(buf); } catch(e){} }
        else if (enc === 'deflate') { try { buf = zlib.inflateSync(buf); } catch(e){} }
        resolve({ status: res.statusCode, body: buf.toString('utf8'), headers: res.headers });
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve({ status: 0, body: '', headers: {} }); });
    req.on('error', () => resolve({ status: 0, body: '', headers: {} }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function cookiesFrom(headers){
  return [].concat(headers['set-cookie'] || []).map(c => String(c).split(';')[0]).join('; ');
}

async function seedCookies(url, referer){
  const r = await request(url, { headers: { Accept: 'text/html', Referer: referer || url } });
  return cookiesFrom(r.headers);
}

function clean(list, source){
  return (list || [])
    .map(x => ({ title: String(x.title || '').trim(), heat: Number(x.heat) || 0, source }))
    .filter(x => x.title && x.title.length >= 2 && x.title.length <= 40);
}

/* ---------- 各平台适配器 ---------- */

/* 今日头条 */
async function toutiao(){
  const r = await request('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', { headers: { Referer: 'https://www.toutiao.com/' } });
  if (r.status !== 200) return [];
  let j; try { j = JSON.parse(r.body); } catch(e){ return []; }
  const list = (j && j.data) || [];
  return clean(list.filter(x => x && x.Title).map(x => ({ title: x.Title, heat: x.HotValue })), '今日头条');
}

/* 百度热搜 */
async function baidu(){
  const r = await request('https://top.baidu.com/board?tab=realtime', { headers: { Accept: 'text/html', Referer: 'https://top.baidu.com/' } });
  if (r.status !== 200) return [];
  const out = [];
  const re = /"query":"([^"]{2,60})"[\s\S]{0,600}?"hotScore":"?(\d+)"?/g;
  let m;
  while ((m = re.exec(r.body))) out.push({ title: m[1], heat: +m[2] });
  if (!out.length){
    const re2 = /"word":"([^"]{2,60})"[\s\S]{0,300}?"hotScore":"?(\d+)"?/g;
    while ((m = re2.exec(r.body))) out.push({ title: m[1], heat: +m[2] });
  }
  return clean(out, '百度热搜');
}

/* 微博热搜：先取种子 cookie 再打接口 */
async function weibo(){
  const ck = await seedCookies('https://weibo.com/', 'https://weibo.com/');
  const urls = ['https://weibo.com/ajax/side/hotSearch', 'https://weibo.com/ajax/statuses/hot_band'];
  for (const u of urls){
    const r = await request(u, { headers: { Cookie: ck, Referer: 'https://weibo.com/' } });
    if (r.status !== 200) continue;
    let j; try { j = JSON.parse(r.body); } catch(e){ continue; }
    const list = (j && j.data && (j.data.realtime || j.data.band_list)) || [];
    const items = clean(list.filter(x => x && (x.word || x.note)).map(x => ({ title: x.word || x.note, heat: x.num || x.raw_hot || x.category })), '微博热搜');
    if (items.length) return items;
  }
  const alt = await tophub('微博热搜');
  return alt;
}

/* 知乎热榜 */
async function zhihu(){
  const urls = [
    'https://api.zhihu.com/topstory/hot-lists/total?limit=50',
    'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50'
  ];
  for (const u of urls){
    const r = await request(u, { headers: { Referer: 'https://www.zhihu.com/hot', Accept: 'application/json, text/plain, */*' } });
    if (r.status !== 200) continue;
    let j; try { j = JSON.parse(r.body); } catch(e){ continue; }
    const list = (j && j.data) || [];
    const items = clean(list.filter(x => x && x.target && x.target.title).map(x => ({
      title: x.target.title,
      heat: (String(x.detail_text || '').match(/\d+/) || [0])[0] * 1
    })), '知乎热榜');
    if (items.length) return items;
  }
  const alt = await tophub('知乎热榜');
  return alt;
}

/* 抖音热榜 */
async function douyin(){
  const urls = [
    'https://aweme.snssdk.com/aweme/v1/hot/search/list/',
    'https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/'
  ];
  for (const u of urls){
    const r = await request(u, { headers: { Referer: 'https://www.douyin.com/' } });
    if (r.status !== 200) continue;
    let j; try { j = JSON.parse(r.body); } catch(e){ continue; }
    const list = (j && j.data && j.data.word_list) || j.word_list || [];
    const items = clean(list.filter(x => x && x.word).map(x => ({ title: x.word, heat: x.hot_value })), '抖音热榜');
    if (items.length) return items;
  }
  const alt = await tophub('抖音热榜');
  return alt;
}

/* 哔哩哔哩热门 */
async function bilibili(){
  const ck = await seedCookies('https://www.bilibili.com/', 'https://www.bilibili.com/');
  const urls = [
    'https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1',
    'https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all'
  ];
  for (const u of urls){
    const r = await request(u, { headers: { Cookie: ck, Referer: 'https://www.bilibili.com/' } });
    if (r.status !== 200) continue;
    let j; try { j = JSON.parse(r.body); } catch(e){ continue; }
    const list = (j && j.data && (j.data.list || j.data)) || [];
    if (!Array.isArray(list)) continue;
    const items = clean(list.filter(x => x && x.title).map(x => ({
      title: x.title,
      heat: x.stat && (x.stat.view || x.stat.danmaku) || 0
    })), '哔哩哔哩');
    if (items.length) return items;
  }
  return [];
}

/* 快手热榜：首页服务端渲染，直接解析 */
async function kuaishou(){
  const r = await request('https://www.kuaishou.com/?isHome=1', { headers: { Accept: 'text/html', Referer: 'https://www.kuaishou.com/' } });
  if (r.status !== 200) return [];
  const out = [];
  const re = /class="rank-name"[^>]*>\s*([^<]{2,40}?)\s*<\/a>(?:[\s\S]{0,400}?class="hot-value"[^>]*>\s*([\d.]+)\s*万?热度)?/g;
  let m;
  while ((m = re.exec(r.body))) out.push({ title: m[1], heat: m[2] ? Math.round(parseFloat(m[2]) * 10000) : 0 });
  if (!out.length){
    const re2 = /class="rank-name"[^>]*>\s*([^<]{2,40}?)\s*<\/a>/g;
    while ((m = re2.exec(r.body))) out.push({ title: m[1], heat: 0 });
  }
  return clean(out, '快手热榜');
}

/* 腾讯新闻热榜 */
async function tencent(){
  const urls = [
    'https://i.news.qq.com/gw/event/pc_hot_ranking_list?ids_hash=&offset=0&page_size=30&appver=15.5_qqnews_7.0.0',
    'https://r.inews.qq.com/gw/event/pc_hot_ranking_list?offset=0&page_size=30'
  ];
  for (const u of urls){
    const r = await request(u, { headers: { Referer: 'https://news.qq.com/' } });
    if (r.status !== 200) continue;
    let j; try { j = JSON.parse(r.body); } catch(e){ continue; }
    const groups = (j && j.idlist) || [];
    const list = [];
    groups.forEach(g => (g.newslist || []).forEach(n => list.push({ title: n.title, heat: n.hotValue || n.importance || 0 })));
    const items = clean(list.filter(x => x.title && !/腾讯新闻用户最关注的热点/.test(x.title)), '腾讯新闻');
    if (items.length) return items;
  }
  return [];
}

/* 澎湃新闻热榜 */
async function thepaper(){
  const r = await request('https://api.thepaper.cn/contentapi/wwwIndex/rightSidebar', { headers: { Referer: 'https://www.thepaper.cn/' } });
  if (r.status !== 200) return [];
  let j; try { j = JSON.parse(r.body); } catch(e){ return []; }
  const list = (j && j.data && (j.data.hotNews || [])) || [];
  return clean(list.filter(x => x && x.name).map(x => ({ title: x.name, heat: x.praiseTimes || x.interactionNum || 0 })), '澎湃新闻');
}


/* ---------- 聚合站兜底：tophub.today ---------- */
/* 小红书等平台的官方接口需要登录态，改用聚合站抓同一份榜单 */
const TOPHUB = {
  '小红书': 'https://tophub.today/n/L4MdA5ldxD',
  '微博热搜': 'https://tophub.today/n/KqndgxeLl9',
  '知乎热榜': 'https://tophub.today/n/mproPpoq6O',
  '抖音热榜': 'https://tophub.today/n/DpQvNABoNE',
  '哔哩哔哩': 'https://tophub.today/n/74KvxwokxM',
  '今日头条': 'https://tophub.today/n/x9ozB4KoXb'
};
function heatNum(s){
  const m = String(s || '').match(/([\d.]+)\s*([wW万千]?)/);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'w' || u === '万') v *= 10000;
  else if (u === '千') v *= 1000;
  return Math.round(v);
}
async function tophub(source){
  const url = TOPHUB[source];
  if (!url) return [];
  const r = await request(url, { headers: { Accept: 'text/html,*/*', Referer: 'https://tophub.today/', 'Accept-Language': 'zh-CN,zh;q=0.9' } });
  if (r.status !== 200) return [];
  const items = [];
  const re = /itemid="(\d+)"[^>]*>([^<]{2,60})<\/a>\s*<\/td>\s*<td class="ws">([^<]*)<\/td>/g;
  let m;
  while ((m = re.exec(r.body))) items.push({ title: m[2].trim(), heat: heatNum(m[3]) });
  return clean(items, source);
}

/* 小红书热搜：需要登录 cookie（.env 里配 XHS_COOKIE） */
/* 小红书热搜：官方接口需登录态，改从聚合站抓同一份榜单 */
async function xiaohongshu(){
  const items = await tophub('小红书');
  return items;
}

const ADAPTERS = [
  { name: '微博热搜', fn: weibo },
  { name: '抖音热榜', fn: douyin },
  { name: '哔哩哔哩', fn: bilibili },
  { name: '快手热榜', fn: kuaishou },
  { name: '知乎热榜', fn: zhihu },
  { name: '今日头条', fn: toutiao },
  { name: '百度热搜', fn: baidu },
  { name: '腾讯新闻', fn: tencent },
  { name: '澎湃新闻', fn: thepaper },
  { name: '小红书', fn: xiaohongshu }
];

async function fetchAll(){
  const results = await Promise.all(ADAPTERS.map(async a => {
    try {
      const items = await a.fn();
      return { source: a.name, items, ok: true };
    } catch(e){
      return { source: a.name, items: [], ok: false, error: e.message };
    }
  }));
  return results;
}

module.exports = { fetchAll, ADAPTERS, request };
