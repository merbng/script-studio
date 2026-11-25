const http = require('http');
const https = require('https');
const hotlist = require('./hot');

function safeBase(value) {
  try { const u = new URL(value); return u.origin + u.pathname; } catch (_) { return ''; }
}
function classifyError(error) {
  const code = error && error.code;
  if (code === 'ETIMEDOUT' || /timeout/i.test(error.message || '')) return '连接超时';
  if (/certificate|tls|ssl/i.test((error && error.message) || '')) return 'TLS/证书错误';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS 解析失败';
  if (code === 'ECONNREFUSED') return '连接被拒绝';
  if (code === 'ECONNRESET') return '连接被重置';
  return '网络或协议错误';
}
function requestJSON(target, options = {}, timeout = 30000, label = 'request') {
  const started = Date.now();
  const marks = {};
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(target); } catch (_) { return reject(new Error('地址格式无效')); }
    const req = (u.protocol === 'https:' ? https : http).request(u, {
      method: options.method || 'GET', headers: options.headers || {}
    }, res => {
      marks.headers = Date.now() - started;
      console.log(`[connect-test] ${label} first-response status=${res.statusCode} elapsed=${marks.headers}ms`);
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const elapsedMs = Date.now() - started;
        console.log(`[connect-test] ${label} complete elapsed=${elapsedMs}ms bytes=${Buffer.concat(chunks).length}`);
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), elapsedMs, marks });
      });
    });
    req.on('socket', socket => {
      console.log(`[connect-test] ${label} connecting host=${u.hostname}`);
      socket.once('connect', () => { marks.connect = Date.now() - started; console.log(`[connect-test] ${label} connected elapsed=${marks.connect}ms`); });
      socket.once('secureConnect', () => { marks.tls = Date.now() - started; console.log(`[connect-test] ${label} tls-ready elapsed=${marks.tls}ms`); });
    });
    req.setTimeout(timeout, () => { const e = new Error(`请求超过 ${timeout}ms 未响应`); e.code = 'ETIMEDOUT'; req.destroy(e); });
    req.on('error', error => { error.elapsedMs = Date.now() - started; error.marks = marks; error.category = classifyError(error); console.error(`[connect-test] ${label} error category=${error.category} code=${error.code || ''} elapsed=${error.elapsedMs}ms`); reject(error); });
    if (options.body) req.write(options.body);
    req.end();
  });
}
async function testModel(config) {
  const base = String(config.base || '').replace(/\/+$/, '');
  const model = String(config.model || '').trim();
  const key = String(config.key || '').trim();
  if (!base || !model) throw new Error('请填写模型地址和模型名');
  if (!key) throw new Error('未配置模型密钥');
  const target = base + '/chat/completions';
  const started = Date.now();
  console.log(`[connect-test] model start url=${safeBase(target)} model=${model}`);
  try {
    const r = await requestJSON(target, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ model, temperature: 0, max_tokens: 8, messages: [{ role: 'user', content: '仅回复：连接成功' }] }) }, 45000, 'model');
    if (r.status < 200 || r.status >= 300) {
      let detail = ''; try { const j = JSON.parse(r.body); detail = (j.error && (j.error.message || j.error.code)) || j.message || ''; } catch (_) {}
      return { ok: false, stage: 'response', status: r.status, elapsedMs: r.elapsedMs, error: `模型接口返回 HTTP ${r.status}${detail ? '：' + String(detail).slice(0, 180) : ''}` };
    }
    let j; try { j = JSON.parse(r.body); } catch (_) { return { ok: false, stage: 'parse', status: r.status, elapsedMs: r.elapsedMs, error: '响应不是有效 JSON' }; }
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!content) return { ok: false, stage: 'parse', status: r.status, elapsedMs: r.elapsedMs, error: '接口已响应，但未找到模型回复内容' };
    return { ok: true, status: r.status, elapsedMs: Date.now() - started, model, message: '模型连接与生成测试通过' };
  } catch (e) { return { ok: false, stage: 'network', category: e.category || classifyError(e), elapsedMs: e.elapsedMs || Date.now() - started, error: `${e.category || classifyError(e)}：${e.message}` }; }
}
async function testHot() {
  const started = Date.now();
  console.log('[connect-test] hot start sources=' + hotlist.ADAPTERS.length);
  const results = await Promise.all(hotlist.ADAPTERS.map(async adapter => {
    const at = Date.now();
    try { const items = await adapter.fn(); const result = { source: adapter.name, ok: items.length > 0, count: items.length, elapsedMs: Date.now() - at }; if (!items.length) result.error = '未取到条目（接口变更、访问限制或网络超时）'; console.log(`[connect-test] hot source=${adapter.name} count=${items.length} elapsed=${result.elapsedMs}ms`); return result; }
    catch (e) { console.error(`[connect-test] hot source=${adapter.name} error=${e.message}`); return { source: adapter.name, ok: false, count: 0, elapsedMs: Date.now() - at, error: e.message }; }
  }));
  const total = results.reduce((n, r) => n + r.count, 0);
  return { ok: total > 0, total, successSources: results.filter(r => r.ok).length, elapsedMs: Date.now() - started, sources: results };
}
module.exports = { testModel, testHot, requestJSON, classifyError };
