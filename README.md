# 视频号脚本标准化生成器（Script Studio）

一个可上线的网页应用：实时热榜 → 人设贴合分层 → 大模型选题与成稿 → 自动规则校验与自修复 → 一键导出。

## 跑起来

```bash
cd script-studio
node server.js          # 或双击 start.cmd
```

打开 http://localhost:8787

零依赖，只要装了 Node（>=18）就能跑。

## 首次使用要做的两件事

1. **配置模型**（模板设置页 → 模型与热榜配置）
   - `LLM_BASE_URL`：任何 OpenAI 兼容接口，默认 `https://api.openai.com/v1`
   - `LLM_API_KEY`：你的密钥（存在本机 `.env`，不进浏览器存储）
   - `LLM_MODEL`：例如 `gpt-4o-mini`、`qwen-plus`、`deepseek-chat`
   保存后写在同目录 `.env`（照 `.env.example` 复制一份改名即可）

2. **确认固定块**（模板设置页）
   默认已按你的模板写好：12 秒 / 9:16 / 1080×1920 / 25fps / 单段一次生成 / 首帧即人脸 / 0.5 秒内开口 / @金木人设 / 完整负面词块。
   模板保存在服务端 `data/spec.json`，多设备一致。

## 页面说明

| 页 | 作用 |
|---|---|
| 实时热榜 | 抓取微博/百度/知乎/头条实时榜单，每条按人设贴合度分层标色 |
| 脚本 | 生成、编辑、实时校验、复制/导出 |
| 模板设置 | 固定块、校验阈值、模型配置 |
| 导出 | 预览完整 Markdown |
| 标题历史 | 已用短标题库，自动去重 |

## 选题逻辑（三层）

1. **绝对红线剔除** —— 政治军事、群体事件、社会案件、灾难事故等直接不进池（`sensitive.js` 的 HARD 列表）。
2. **敏感边缘保留** —— 涉外/时政/金融类保留但降权，界面标「待复核」人工判断。
3. **人设贴合分层** —— 按「技术宅 / 中年 / 北方」三层标签打分：
   - `核心人设`：优先选
   - `边缘相关`：能改成人设视角才选
   - `与人设无关`：原则上不用

   话题不删，只分层。热榜里人设话题不够时，用 `persona-pool.js` 的人设话题库补足，并按配比取：
   技术/数码/AI ≥ 2 条、北方生活 ≤ 2 条、职场与消费避坑 ≤ 2 条、普通家务 ≤ 1 条。

## 校验规则

服务端 `rules.js` 与前端 `app.js` 同规则：

- 固定块逐字复用；风格/场景/光线每条必须重写
- 四段时间轴 0-3/3-6/6-9/9-12 秒，每段含表情、动作、情绪、目的、台词
- 口播字数在区间内，且除以时长不超过每秒字数上限
- 每条出三套「描述 + 短标题」成对组合（反常识 / 共鸣 / 悬念）
- 描述末尾话题标签 ≥ 5 个；短标题 ≤ 16 字、不与近 N 条已用标题重复
- 无绝对化用语、无酒类内容、无画面文字

生成后由服务端自动校验，不合格的条目会让模型自修复（最多 2 轮），仍不合格会标红提示人工改。

## 上线到服务器

```bash
# 需要一个能常驻 Node 的环境（云主机 / VPS / 内网服务器）
cd script-studio
npm i -g pm2 && pm2 start server.js --name script-studio
pm2 save && pm2 startup
```

反代（Nginx）示例：

```nginx
server {
  listen 80;
  server_name your.domain.com;
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

注意：
- `.env` 与 `data/` 目录不要进公开仓库；`.gitignore` 已包含
- 密钥只留在服务端 `.env`，前端永远拿不到
- 若要对公网开放，建议在前面加一层 Basic Auth 或 IP 白名单

## 文件结构

```
script-studio/
  server.js        HTTP 服务 + API + 模型调用 + 生成/校验/自修复
  rules.js         校验规则（服务端权威版）
  sensitive.js     红线/软敏感词表
  persona.js       人设三层标签与贴合度打分
  persona-pool.js  人设话题库（热榜不够时补足）
  topics.js        选题池组装与配比
  env.js           .env 读写
  index.html       页面
  app.js           前端逻辑
  style.css        样式
  persona.css      人设分层徽标样式
  data/            服务端持久化（spec.json / history.json）
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 状态与模型配置 |
| GET/POST | `/api/config` | 读取/保存模型配置 |
| GET/POST | `/api/spec` | 读取/保存模板与阈值 |
| GET | `/api/hot` | 实时热榜（含人设分层） |
| GET | `/api/topics` | 选题池预览 |
| POST | `/api/generate` | 生成脚本（服务端校验+自修复） |
| POST | `/api/validate` | 仅校验，不调模型 |
| GET/POST/DELETE | `/api/history` | 已用短标题库 |
