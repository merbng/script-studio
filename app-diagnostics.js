/* 配置恢复与连接诊断 */
(() => {
  const DEFAULT_MODEL = { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
  const $ = s => document.querySelector(s);
  let testing = false;
  function message(text, ok) {
    const el = $('#cfg-test-result');
    el.textContent = text;
    el.className = 'cfg-test-result ' + (ok === true ? 'ok' : ok === false ? 'error' : '');
  }
  function modelBody() {
    return { base: $('#cfg-base').value.trim(), model: $('#cfg-model').value.trim(), key: $('#cfg-key').value.trim() };
  }
  async function runTest(type) {
    if (testing) return;
    testing = true;
    const buttons = [$('#btn-test-model'), $('#btn-test-hot')];
    buttons.forEach(b => b.disabled = true);
    const active = type === 'model' ? $('#btn-test-model') : $('#btn-test-hot');
    const old = active.textContent;
    active.textContent = '测试中…';
    const started = performance.now();
    console.info(`[连接测试] ${type} 开始`, new Date().toISOString());
    if (type === 'model') console.info('[连接测试] 模型参数', { base: modelBody().base, model: modelBody().model, key: modelBody().key ? '******（不发送日志）' : '未填写' });
    message(type === 'model' ? '正在请求模型，最长等待 45 秒…' : '正在检查全部热榜来源，可能需要约 1 分钟…');
    try {
      console.info(`[连接测试] ${type} 发送请求`);
      const r = await fetch('/api/test/' + type, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(type === 'model' ? modelBody() : {}) });
      console.info(`[连接测试] ${type} 收到响应`, { status: r.status, elapsedMs: Math.round(performance.now() - started) });
      const j = await r.json();
      console.info(`[连接测试] ${type} 完成`, j);
      if (type === 'hot') {
        const failed = (j.sources || []).filter(s => !s.ok);
        message(`${j.ok ? '测试通过' : '测试未通过'}：${j.successSources || 0}/10 个来源成功，共 ${j.total || 0} 条，耗时 ${((j.elapsedMs || 0) / 1000).toFixed(1)} 秒。` + (failed.length ? ' 失败来源：' + failed.map(s => s.source).join('、') : ''), j.ok);
      } else message(`${j.message || (j.ok ? '连接成功' : '连接失败')}，耗时 ${((j.elapsedMs || 0) / 1000).toFixed(1)} 秒${j.status ? '，HTTP ' + j.status : ''}${j.error ? '。' + j.error : ''}`, j.ok);
    } catch (e) {
      console.error(`[连接测试] ${type} 异常`, { elapsedMs: Math.round(performance.now() - started), message: e.message });
      message('测试请求失败：' + e.message, false);
    } finally {
      testing = false;
      active.textContent = old;
      buttons.forEach(b => b.disabled = false);
    }
  }
  $('#btn-test-model').onclick = () => runTest('model');
  $('#btn-test-hot').onclick = () => runTest('hot');
  $('#btn-reset-model').onclick = () => {
    $('#cfg-base').value = DEFAULT_MODEL.base;
    $('#cfg-model').value = DEFAULT_MODEL.model;
    $('#cfg-key').value = '';
    message('已恢复默认模型地址和模型名；密钥已清空。点击“保存模型配置”后生效。');
  };
  $('#btn-reset-hot').onclick = () => {
    document.querySelectorAll('#hot-list input[type=checkbox]').forEach(c => { c.checked = false; c.dispatchEvent(new Event('change')); });
    $('#gen-count').value = 1;
    $('#gen-extra').value = '';
    message('已恢复默认热榜选择、生成条数和额外要求。');
  };
  (async () => {
    try { const r = await fetch('/api/config'); const j = await r.json(); $('#cfg-base').value = j.base || DEFAULT_MODEL.base; $('#cfg-model').value = j.model || DEFAULT_MODEL.model; } catch (_) {}
  })();
})();
