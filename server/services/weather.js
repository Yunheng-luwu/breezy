/**
 * 天气服务：高德 Web服务 API（IP定位 → 实时天气 → 按规则生成穿搭建议）
 * 结果缓存 5 分钟，避免频繁调用；失败返回 null，由路由层回退默认数据
 */

const config = require('../config');

const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
// 按 key（IP / adcode）分别缓存，互不覆盖
const cacheMap = new Map();

const AMAP_IP_URL = 'https://restapi.amap.com/v3/ip';
const AMAP_WEATHER_URL = 'https://restapi.amap.com/v3/weather/weatherInfo';

// ============ 请求工具 ============

async function amapGet(url, params) {
  const qs = new URLSearchParams({ key: config.amap.key, ...params });
  const res = await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`高德接口 HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== '1') throw new Error(`高德接口错误: ${json.info}(${json.infocode})`);
  return json;
}

// ============ IP 定位 ============

// 内网/回环 IP 无法定位，交给高德按请求出口 IP 定位（不传 ip 参数）
function isPrivateIp(ip) {
  if (!ip) return true;
  const v4 = ip.replace(/^::ffff:/, '');
  return v4 === '127.0.0.1' || ip === '::1'
    || v4.startsWith('10.') || v4.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(v4);
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (fwd ? fwd.split(',')[0].trim() : '') || req.ip || req.socket?.remoteAddress || '';
  return ip.replace(/^::ffff:/, '');
}

async function locateByIp(ip) {
  const params = isPrivateIp(ip) ? {} : { ip };
  const json = await amapGet(AMAP_IP_URL, params);
  // 部分 IP 只能定位到省份，adcode 可能返回空数组
  const adcode = Array.isArray(json.adcode) ? '' : json.adcode;
  if (!adcode) throw new Error('IP 定位失败: 无 adcode');
  const city = (Array.isArray(json.city) ? '' : json.city)
    || (Array.isArray(json.province) ? '' : json.province)
    || '未知城市';
  return { city: city.replace(/市$/, ''), adcode };
}

// ============ 用户手动选城市 ============

/**
 * 城市/区县/街道搜索
 * 双数据源合并：
 *   ① 高德行政区划接口：保证直辖市、地级市准确命中（北京/上海等）
 *   ② 高德输入提示接口：覆盖区县、乡镇街道，结果按热度排序，显示完整归属路径
 * 返回 [{ name, adcode }]，name 形如「长沙」「长沙市芙蓉区」「长沙市芙蓉区定王台」
 */
// 直辖市省级编码 → 市辖区编码（天气查询不接受省级编码）
const MUNICIPALITIES = {
  '110000': { name: '北京', adcode: '110100' },
  '310000': { name: '上海', adcode: '310100' },
  '120000': { name: '天津', adcode: '120100' },
  '500000': { name: '重庆', adcode: '500100' },
};

// 去掉名称里的省级前缀，如「湖南省长沙市芙蓉区」→「长沙市芙蓉区」；直辖市（北京市…）保留
function stripProvince(path) {
  return String(path || '').replace(/^.*?(?:省|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区)/, '');
}
// 去掉结尾的「市」，「西安市」→「西安」（区/县名保留）
function stripCitySuffix(name) {
  return String(name || '').replace(/市$/, '');
}

async function searchCity(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return [];

  // ① 行政区划：取名字命中的市/区（省级编码的直辖市映射到市辖区）
  let adminItems = [];
  try {
    const dj = await amapGet('https://restapi.amap.com/v3/config/district', {
      keywords: kw, subdistrict: '0', extensions: 'base',
    });
    for (const d of (dj.districts || [])) {
      if (!d.adcode || !/^\d{6}$/.test(d.adcode)) continue;
      if (d.level === 'province') {
        const m = MUNICIPALITIES[d.adcode];
        if (m) adminItems.push({ name: m.name, adcode: m.adcode });
        continue; // 普通省不进城市候选
      }
      if (d.level === 'city') {
        adminItems.push({ name: stripCitySuffix(d.name), adcode: d.adcode });
      } else if (d.level === 'district') {
        const full = [d.province, d.city, d.name].filter(s => s && !Array.isArray(s)).join('');
        adminItems.push({ name: stripProvince(full), adcode: d.adcode });
      }
    }
  } catch (e) {
    // 行政区划失败不影响 inputtips 结果
  }

  // ② 输入提示：行政类结果（190102直辖市 / 190104地级市 / 190105区县 / 1907xx乡镇街道）
  let tipItems = [];
  try {
    const tj = await amapGet('https://restapi.amap.com/v3/assistant/inputtips', {
      keywords: kw, datatype: 'all',
    });
    for (const t of (tj.tips || [])) {
      if (!t.adcode || !/^\d{6}$/.test(t.adcode) || !t.name || Array.isArray(t.name)) continue;
      const tc = String(t.typecode || '');
      const path = Array.isArray(t.district) ? '' : t.district;
      let name;
      let town = false;
      // 直辖市的区级编码（110101 等）归一到市辖区编码，避免与「北京 110100」重复
      let adcode = t.adcode;
      const munPrefix = { '11': '110100', '31': '310100', '12': '120100', '50': '500100' };
      if (tc === '190102' && munPrefix[adcode.slice(0, 2)]) {
        adcode = munPrefix[adcode.slice(0, 2)];
      }
      if (tc === '190102') {
        // 直辖市
        name = stripCitySuffix(t.name);
      } else if (tc === '190104') {
        name = stripCitySuffix(t.name);
        // 地级市：inputtips 常给市辖区码（如 140403 潞州区），归一到城市码 140400
        adcode = adcode.slice(0, 4) + '00';
      } else if (tc === '190105') {
        // 区县：展示完整「市+区」
        name = stripProvince(path) || t.name;
      } else if (tc.startsWith('1907')) {
        // 乡镇/街道：展示完整「市+区+街道名」，如 长沙市芙蓉区定王台
        name = stripProvince(path) + t.name;
        town = true;
      } else {
        continue; // 排除景点、道路、车站等 POI
      }
      tipItems.push({ name, adcode, town });
    }
  } catch (e) {
    // inputtips 失败则仅用行政区划结果
  }

  // ③ 合并：以 inputtips 热度序为主序列；行政区结果只补其缺失的城市（如北京）；
  //    城市/区县级按 adcode 去重，乡镇街道按 adcode+名称去重
  const cityAdcodes = new Set();
  const seenKeys = new Set();
  const out = [];
  const pushItem = (item, isTown) => {
    const key = isTown ? String(item.adcode) + '|' + item.name : String(item.adcode);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    if (!isTown) cityAdcodes.add(String(item.adcode));
    out.push(item);
    return true;
  };
  // inputtips 结果（高德热度顺序）
  for (const it of tipItems) pushItem(it, it.town);
  // 行政区补缺（inputtips 没有该城市编码时才追加）
  for (const it of adminItems) {
    if (!cityAdcodes.has(String(it.adcode))) pushItem(it, false);
  }

  // 与输入完全同名的结果提到最前（如搜「西安」西安市优先于辽源西安区）
  const target = stripCitySuffix(kw);
  const exact = out.findIndex(it => it.name === target);
  if (exact > 0) { const [hit] = out.splice(exact, 1); out.unshift(hit); }

  return out.slice(0, 12).map(it => ({ name: it.name, adcode: it.adcode }));
}

/**
 * 浏览器经纬度反查城市（高德逆地理编码），返回 { city, adcode }
 */
async function locateByLngLat(lng, lat) {
  const json = await amapGet('https://restapi.amap.com/v3/geocode/regeo', {
    location: `${lng},${lat}`,
  });
  const ac = json.regeocode?.addressComponent;
  if (!ac) throw new Error('逆地理编码无结果');
  const adcode = Array.isArray(ac.adcode) ? '' : ac.adcode;
  if (!adcode || !/^\d{6}$/.test(adcode)) throw new Error('逆地理编码无 adcode');
  const rawCity = (Array.isArray(ac.city) ? '' : ac.city)
    || (Array.isArray(ac.district) ? '' : ac.district)
    || (Array.isArray(ac.province) ? '' : ac.province)
    || '未知城市';
  return { city: rawCity.replace(/市$/, ''), adcode };
}

// ============ 天气查询 ============

async function fetchWeather(adcode) {
  // base=实况（当前温度/风/湿度），all=预报（今日高低温/天气现象）
  const [live, forecast] = await Promise.all([
    amapGet(AMAP_WEATHER_URL, { city: adcode, extensions: 'base' }),
    amapGet(AMAP_WEATHER_URL, { city: adcode, extensions: 'all' }),
  ]);
  const l = live.lives?.[0];
  const today = forecast.forecasts?.[0]?.casts?.[0];
  if (!l || !today) throw new Error('天气数据不完整');

  const num = (v) => {
    const m = String(v).match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  };

  return {
    temp: num(l.temperature),
    weatherText: l.weather,
    windDir: l.winddirection,
    windPower: l.windpower, // 可能带 "≤" 等符号，原样展示
    windLevel: num(l.windpower),
    humidity: num(l.humidity),
    high: num(today.daytemp),
    low: num(today.nighttemp),
    dayWeather: today.dayweather,
    nightWeather: today.nightweather,
  };
}

// ============ 穿搭建议规则 ============

function weatherEmoji(text) {
  if (/雷/.test(text)) return '⛈️';
  if (/雪/.test(text)) return '🌨️';
  if (/雨/.test(text)) return '🌧️';
  if (/雾|霾/.test(text)) return '🌫️';
  if (/阴/.test(text)) return '☁️';
  if (/多云/.test(text)) return '⛅';
  if (/晴/.test(text)) return '☀️';
  return '🌤️';
}

function buildAdvice(w) {
  const t = w.temp;
  let inner, outer, shoes;
  if (t >= 30) {
    inner = '短袖或背心，选棉麻透气材质';
    outer = '防晒衫或薄衬衫，物理防晒';
    shoes = '凉鞋或透气运动鞋';
  } else if (t >= 25) {
    inner = '短袖T恤，轻薄透气';
    outer = '薄衬衫或防晒衣，空调房备用';
    shoes = '透气单鞋或运动鞋';
  } else if (t >= 20) {
    inner = '薄长袖或T恤加衬衫叠穿';
    outer = '薄外套或针织开衫，早晚备用';
    shoes = '单鞋或运动鞋';
  } else if (t >= 15) {
    inner = '薄长袖纯棉打底，透气吸汗';
    outer = '风衣或夹克，方便穿脱';
    shoes = '运动鞋或短靴，不露脚踝';
  } else if (t >= 10) {
    inner = '长袖打底加薄毛衣，护住背部';
    outer = '薄羽绒或风衣，防风为主';
    shoes = '短靴或运动鞋，注意脚部保暖';
  } else if (t >= 5) {
    inner = '保暖内衣加毛衣，护住颈背';
    outer = '羽绒服或呢大衣，防风保暖';
    shoes = '加绒靴子，寒从脚生';
  } else {
    inner = '加绒保暖内衣加厚毛衣，护住颈背';
    outer = '长款羽绒服，围巾护颈';
    shoes = '加绒防滑靴，配厚袜子';
  }

  // 风雨雪修正
  const rainy = /雨|雷/.test(w.dayWeather);
  const snowy = /雪/.test(w.dayWeather);
  const windy = w.windLevel >= 5;
  if (rainy) shoes = '防水鞋或雨靴，雨天不露脚踝';
  if (snowy) shoes = '防滑加绒靴，注意脚下湿滑';
  if (windy && t < 25) outer += '，戴围巾护住颈部';

  // 核心原则（一句话）
  const diff = w.high - w.low;
  let principle;
  if (snowy) principle = '今日有雪，防寒防滑，重点护住颈背脚踝';
  else if (rainy) principle = '今日有雨湿重，注意防潮保暖，忌淋雨受寒';
  else if (windy) principle = '今日大风，重点护住颈肩脚踝，防风避邪';
  else if (diff >= 10) principle = `今日温差${diff}°C，洋葱式穿衣方便增减`;
  else if (t >= 28) principle = '今日偏热，透气防晒为主，空调房备薄衫';
  else if (t <= 8) principle = '今日寒冷，重点护住颈背脚踝，寒从脚生';
  else principle = '今日气温舒适，早晚添衣，护住颈背';

  return { principle, inner, outer, shoes };
}

// ============ 场景提醒（首页三条：天气 + 个人状况，文案带真实数值） ============
// d：getClothingByAdcode 返回的数据（含 temp/high/low/diff/humidity/dayWeather/windLevel）
// userCtx：登录用户 { score 肝郁指数, symptoms 近30天症状, prefs 健康偏好开关 }，未登录为 null
function getSceneReminders(d, userCtx) {
  const rainy = /雨|雷/.test(d.dayWeather || '');
  const snowy = /雪/.test(d.dayWeather || '');
  const windy = (d.windLevel || 0) >= 5;
  const sunny = /晴/.test(d.dayWeather || '') && !rainy && !snowy;
  const diff = d.diff != null ? d.diff : (d.high - d.low);
  const picked = [];
  const add = (icon, text, weight) => picked.push({ icon, text, weight });

  // 天气条目：带真实温度/湿度/风力，具体可执行
  if (snowy) add('🌨️', `今天有雪（${d.low}~${d.high}°C），出门防滑，护住颈背脚踝`, 9);
  else if (rainy) add('🌧️', `今天${d.dayWeather}，包里备把伞，鞋子别露脚踝`, 9);
  if (windy && d.temp < 25) add('🌬️', `今天风有${d.windLevel}级，围巾护住后颈再出门`, 8);
  if (d.temp <= 8) add('🧣', `现在只有${d.temp}°C，外套拉链拉到顶，寒从脚生`, 8);
  if (diff >= 10) add('🌡️', `早晚温差${diff}°C，早出晚归多带一件外套`, 7);
  if (d.temp >= 28) add('❄️', `午后最高${d.high}°C，空调房备件披肩护肩颈`, 7);
  if (d.humidity >= 80 && d.temp >= 20) add('💧', `湿度${d.humidity}%偏湿，今天少碰生冷甜腻`, 6);
  if (d.humidity > 0 && d.humidity <= 40) add('💧', `空气偏干（湿度${d.humidity}%），多喝温水，炖个雪梨润润`, 6);
  if (sunny && d.temp >= 25) add('☀️', `中午紫外线强，出门做好防晒，傍晚晒背15分钟`, 5);
  if (sunny && d.temp >= 15 && d.temp < 25) add('☀️', `今天${d.temp}°C晴好，午休出门走10分钟晒晒背`, 4);

  // 个人状况条目（登录用户）：体感偏好 > 近30天症状 > 肝郁指数，置顶最前面
  let personal = null;
  if (userCtx) {
    const s = (userCtx.symptoms || []).join(' ');
    if (userCtx.prefs && userCtx.prefs.coldSensitive && d.temp <= 15) {
      personal = ['🧣', `你怕冷，今天只有${d.temp}°C，比别人早一步加衣，护住颈背脚踝`];
    } else if (userCtx.prefs && userCtx.prefs.heatSensitive && d.temp >= 26) {
      personal = ['🧊', `你怕热，今天最高${d.high}°C，选透气衣物，避开午后暴晒`];
    } else if (/失眠|睡|梦/.test(s)) personal = ['🌙', '你最近睡得不太好，今晚提前半小时放下手机'];
    else if (/肩|颈|酸/.test(s)) personal = ['🧘', '久坐易肩颈僵，每小时起来转转肩、拉伸1分钟'];
    else if (/胸闷|胁|叹|怒|烦|压|郁|生气/.test(s)) personal = ['🌿', '情绪紧绷时按揉太冲穴3分钟，缓缓疏气'];
    else if (/疲|乏|累|倦/.test(s)) personal = ['🦶', '累的时候睡前温水泡脚15分钟，解乏助眠'];
    else if (/胃|食欲|腹|消化|胀/.test(s)) personal = ['🍵', '胃口不佳就喝碗小米粥，温软不负担'];
    else if ((userCtx.score || 0) >= 70) personal = ['🌼', `今日肝郁指数${userCtx.score}偏高，午后散步20分钟散散心`];
    else if (userCtx.symptoms && userCtx.symptoms.length) personal = ['🍀', `这两天留意「${userCtx.symptoms[0]}」，规律作息是最好的调理`];
  }

  const out = [];
  if (personal) out.push({ icon: personal[0], text: personal[1] });
  for (const r of picked.sort((a, b) => b.weight - a.weight)) {
    if (out.length >= 3) break;
    out.push({ icon: r.icon, text: r.text });
  }
  // 通用兜底：天气+个人条目凑不满 3 条时补齐
  const fallback = [
    { icon: '💪', text: '出汗别急着脱衣，等汗收了再减' },
    { icon: '🦶', text: '睡前温水泡脚15分钟，微微发热就好' },
    { icon: '🍵', text: '晨起一杯温水，唤醒脾胃' },
  ];
  for (const f of fallback) {
    if (out.length >= 3) break;
    out.push(f);
  }
  return out.slice(0, 3);
}

// ============ 对外入口 ============

/**
 * 按城市编码取天气并组装穿衣数据，带 5 分钟缓存
 * @param adcode 高德 6 位城市编码
 * @param city 城市名（手动选城时由调用方传入）
 * @param located 是否真实定位（false=默认城市兜底，前端可提示用户手动切换）
 */
async function getClothingByAdcode(adcode, city, located = true) {
  if (!config.amap.key) return null;
  const cacheKey = `adcode:${adcode}`;
  const hit = cacheMap.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;

  const w = await fetchWeather(adcode);
  const advice = buildAdvice(w);
  const data = {
    temp: w.temp,
    weather: weatherEmoji(w.weatherText),
    weatherText: w.weatherText,
    city: city || '未知城市',
    high: w.high,
    low: w.low,
    diff: w.high - w.low,
    wind: `${w.windDir}风${w.windPower}级`,
    windLevel: w.windLevel,
    humidity: w.humidity,
    dayWeather: w.dayWeather,
    principle: advice.principle,
    inner: advice.inner,
    outer: advice.outer,
    shoes: advice.shoes,
    // reminders 不进缓存（个人化提醒按用户动态生成），由路由层调用 getSceneReminders 注入
    source: 'amap',
    located,
  };
  cacheMap.set(cacheKey, { at: Date.now(), data });
  return data;
}

/**
 * 根据来源 IP 获取穿衣建议数据；失败返回 null
 * IP 定位失败时回退默认城市（真实天气，located=false）；天气也失败才返回 null
 */
async function getClothingByIp(ip) {
  if (!config.amap.key) return null;

  const cleanIp = String(ip || '').replace(/^::ffff:/, '');
  const cacheKey = isPrivateIp(cleanIp) ? '_default' : cleanIp;
  const hit = cacheMap.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;

  try {
    let city, adcode, located = true;
    try {
      ({ city, adcode } = await locateByIp(cleanIp));
    } catch (locErr) {
      adcode = config.amap.defaultAdcode;
      city = config.amap.defaultCity;
      located = false;
      console.warn('[weather] IP 定位失败，回退默认城市:', city, '-', locErr.message);
    }
    const data = await getClothingByAdcode(adcode, city, located);
    if (data) cacheMap.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error('[weather] 获取天气失败:', err.message);
    return null;
  }
}

/**
 * 从 Express 请求中解析来源 IP 后获取穿衣建议；失败返回 null
 */
async function getClothingByWeather(req) {
  return getClothingByIp(getClientIp(req));
}

module.exports = {
  getClothingByWeather,
  getClothingByIp,
  getClothingByAdcode,
  getSceneReminders,
  searchCity,
  locateByLngLat,
};
