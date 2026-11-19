/**
 * 人设贴合度引擎（选题主引擎）
 * 人设：@金木 —— 中年男性技术宅，30 岁左右，北方人。
 * 三层标签：技术宅 / 中年 / 北方。
 * 规则：话题不删，全部保留；靠贴合度分层排序，生成时优先用人设内的话题。
 */

/* 三层人设标签关键词 */
const TECH = [
  '电脑','笔记本','台式机','装机','配置','显卡','内存','硬盘','固态','cpu','处理器','主板','散热','电源','机箱',
  '显示器','键盘','鼠标','路由','网线','宽带','网络','网速','延迟','带宽','服务器','云','代码','编程','程序员',
  '开发','前端','后端','算法','数据库','开源','github','git','linux','windows','mac','安卓','ios','手机','iphone','华为',
  '小米','苹果','apple','芯片','半导体','ai','人工智能','大模型','chatgpt','claude','deepseek','提示词','prompt',
  '插件','脚本','自动化','爬虫','api','接口','效率工具','软件','应用','app','版本','更新','漏洞','安全','隐私',
  '数据','物联网','智能家居','充电','电池','续航','耳机','音箱','投影','相机','传感器',
  '系统','进程','内存条','刷新率','帧率','分辨率','cdn','docker','虚拟机','远程桌面','鸿蒙','算力',
  '模型','训练','推理','参数','开源模型','国产芯片','代工','晶圆','光刻','存储','内存价格','涨价'
];

const MIDLIFE = [
  '房贷','车贷','贷款','理财','养老金','社保','医保','退休','父母','爸妈','老人','孩子','娃','带娃','作业',
  '培训班','学费','幼儿园','小学','初中','高中','家长会','班主任','老婆','媳妇','老公','妻子','丈夫','结婚',
  '婚礼','人情','随份子','份子钱','催婚','相亲','中年','加班','裁员','离职','跳槽','面试','简历','绩效','kpi','领导',
  '同事','职场','打工','通勤','班车','地铁','加班费','五险一金','户口','房子','物业','业主群','养老','家庭','消费'
];

const NORTH = [
  '供暖','暖气','供热','集中供暖','北方','东北','哈尔滨','长春','沈阳','石家庄','济南','天津','北京','内蒙古','西北',
  '澡堂','洗浴','搓澡','桑拿','浴室','澡盆','淋浴','暖气片','地暖','电暖气','电热毯','热水袋','暖宝宝','羽绒服','棉裤',
  '秋裤','棉袄','棉鞋','毛裤','冻梨','冻柿子','白菜','囤菜','冬储','腌菜','咸菜','风干','晾干','烘干','静电','干燥',
  '加湿器','嘴唇干','冻疮','窗户结冰','玻璃起雾','雾霾','风沙','干冷','下雪','化雪','融雪','除雪','扫雪',
  '暖气不热','水垢','自来水','供暖季','停暖','灌暖气','炉子','煤炉','蜂窝煤','温暖印象','雪山'
];

/* 明确与人设无关的题材（保留话题，但降权） */
const OFF_PERSONA = [
  '景区','门票','导游','旅游照','景点','民宿','拼团','旅游','露营','演唱会','追星','明星','八卦','娱乐圈','综艺',
  '球队','足球','篮球','世界杯','奥运会','彩票','星座','占星','算命','减肥','瘦脸','医美','整容','美妆','口红',
  '恋爱','分手','相亲角','婆媳','催生','二胎','三胎','异性','数学老师','教练'
];

/* 词频计分 */
function score(text){
  const t = String(text || '').toLowerCase();
  const c = list => list.filter(w => t.indexOf(String(w).toLowerCase()) >= 0);
  const tech = c(TECH), mid = c(MIDLIFE), north = c(NORTH), off = c(OFF_PERSONA);
  const layers = (tech.length ? 1 : 0) + (mid.length ? 1 : 0) + (north.length ? 1 : 0);
  const raw = tech.length * 3 + mid.length * 2 + north.length * 2 - off.length * 3;
  return {
    tech: tech.length, midlife: mid.length, north: north.length, off: off.length,
    layers, raw,
    score: Math.max(0, Math.min(100, Math.round(Math.max(0, raw) * 12)))
  };
}

/** 贴合等级 */
function level(s){
  if (s.layers === 0) return 'off';            // 三层都没沾 → 与人设无关
  if (s.off > 0 && s.layers <= 1) return 'off'; // 命中无关题材且只有一层 → 判无关
  if (s.raw >= 3) return 'core';                // 技术宅/中年/北方任一标签足够强 → 核心
  if (s.layers >= 2) return 'core';             // 跨两层 → 核心
  return 'edge';                                // 只沾一层但很弱 → 边缘
}

/**
 * 给一组热榜条目排序 + 分层
 */
function rank(items){
  const order = { core: 0, edge: 1, off: 2 };
  return items.map(it => {
    const p = score(it.title);
    return { ...it, persona: p, personaLevel: level(p) };
  }).sort((a, b) => {
    if (a.personaLevel !== b.personaLevel) return order[a.personaLevel] - order[b.personaLevel];
    if (b.persona.raw !== a.persona.raw) return b.persona.raw - a.persona.raw;
    return (b.heat || 0) - (a.heat || 0);
  });
}

/** 生成给模型的人设选题指引 */
function personaGuide(items){
  const core = items.filter(i => i.personaLevel === 'core');
  const edge = items.filter(i => i.personaLevel === 'edge');
  const off  = items.filter(i => i.personaLevel === 'off');
  const L = [];
  L.push('按人设贴合度分层的候选话题：');
  if (core.length){
    L.push('【核心人设话题（优先选用）】');
    core.forEach(i => L.push('- ' + i.title + '（技术宅×' + i.persona.tech + ' / 中年×' + i.persona.midlife + ' / 北方×' + i.persona.north + '）'));
  }
  if (edge.length){
    L.push('【边缘人设话题（与人设弱相关，除非能挂到人设视角，否则不选）】');
    edge.forEach(i => L.push('- ' + i.title));
  }
  if (off.length){
    L.push('【与人设无关的话题（原则上不选）】');
    off.forEach(i => L.push('- ' + i.title));
  }
  L.push('');
  L.push('选题必须落在【核心人设话题】里；边缘话题只有当你能把它改造成技术宅/中年/北方视角时才可用；无关话题一律不用。');
  L.push('每条都要能看出是 @金木 说的话：技术宅视角、中年人的实际处境、北方生活细节，至少占一层。');
  return L.join('\n');
}

module.exports = { TECH, MIDLIFE, NORTH, OFF_PERSONA, score, level, rank, personaGuide };