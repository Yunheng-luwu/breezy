/**
 * 天气服务：高德 Web服务 API（IP定位 → 实时天气 → 按规则生成穿搭建议）
 * 结果缓存 5 分钟，避免频繁调用；失败返回 null，由路由层回退默认数据
 */

const config = require('../config');

const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
let cache = { at: 0, key: '', data: null };

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

// ============ 对外入口 ============

/**
 * 根据来源 IP 获取穿衣建议数据；失败返回 null
 * 返回结构与旧 mock clothingData 保持一致，另附 weatherText/source
 * 工具层（无 req 对象）可直接调用本函数
 */
async function getClothingByIp(ip) {
  if (!config.amap.key) return null;

  const cleanIp = String(ip || '').replace(/^::ffff:/, '');
  const cacheKey = isPrivateIp(cleanIp) ? '_default' : cleanIp;
  if (cache.data && cache.key === cacheKey && Date.now() - cache.at < CACHE_TTL) {
    return cache.data;
  }

  try {
    const { city, adcode } = await locateByIp(cleanIp);
    const w = await fetchWeather(adcode);
    const advice = buildAdvice(w);
    const data = {
      temp: w.temp,
      weather: weatherEmoji(w.weatherText),
      weatherText: w.weatherText,
      city,
      high: w.high,
      low: w.low,
      diff: w.high - w.low,
      wind: `${w.windDir}风${w.windPower}级`,
      humidity: w.humidity,
      principle: advice.principle,
      inner: advice.inner,
      outer: advice.outer,
      shoes: advice.shoes,
      source: 'amap',
    };
    cache = { at: Date.now(), key: cacheKey, data };
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

module.exports = { getClothingByWeather, getClothingByIp };
