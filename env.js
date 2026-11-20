const fs = require('fs');
const path = require('path');

function loadEnvFile(){
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return '';
  return fs.readFileSync(f, 'utf8');
}

function setEnvVars(obj){
  const f = path.join(__dirname, '.env');
  let lines = loadEnvFile().split(/\r?\n/);
  const set = (k, v) => {
    const idx = lines.findIndex(l => new RegExp('^\\s*' + k + '\\s*=').test(l));
    const line = k + '=' + v;
    if (idx >= 0) lines[idx] = line; else lines.push(line);
  };
  if (obj.base !== undefined) set('LLM_BASE_URL', obj.base);
  if (obj.key) set('LLM_API_KEY', obj.key);
  if (obj.model !== undefined) set('LLM_MODEL', obj.model);
  fs.writeFileSync(f, lines.filter(l => l.trim() !== '').join('\n') + '\n', 'utf8');
}

module.exports = { loadEnvFile, setEnvVars };
