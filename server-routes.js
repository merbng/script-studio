/* 连接测试路由；主服务在路由分发前调用 */
const { testModel, testHot } = require('./diagnostics');
async function handleConnectionTest(req, res, pathname, readBody, json, llmConfig) {
  if (req.method !== 'POST' || !['/api/test/model', '/api/test/hot'].includes(pathname)) return false;
  try {
    if (pathname === '/api/test/hot') return json(res, 200, await testHot()), true;
    const body = await readBody(req);
    const current = llmConfig();
    const result = await testModel({ base: body.base || current.base, model: body.model || current.model, key: body.key || current.key });
    return json(res, 200, result), true;
  } catch (e) { return json(res, 200, { ok: false, stage: 'validation', error: e.message }), true; }
}
module.exports = { handleConnectionTest };
