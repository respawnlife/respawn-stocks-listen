import { formatStockCode } from '../utils/calculations';

/**
 * K线数据类型
 */
export interface KlineData {
  date: string; // 日期 YYYY-MM-DD
  open: number; // 开盘价
  high: number; // 最高价
  low: number; // 最低价
  close: number; // 收盘价
  volume: number; // 成交量
}

/**
 * K线周期类型
 */
export type KlinePeriod = 'day' | 'week' | 'month';

/**
 * 使用腾讯财经API获取K线数据
 * API格式：https://web.ifzq.gtimg.cn/app/kline/kline?param=sh600000,day,1,0,1000,640,qfq
 * 参数说明：
 * - sh600000: 股票代码（带前缀）
 * - day: 周期（day/week/month）
 * - 1: 复权类型（0=不复权，1=前复权，2=后复权）
 * - 0: 起始位置
 * - 1000: 获取数量
 * - 640: 未知参数
 * - qfq: 前复权标识
 */
/**
 * 根据周期计算数据量和时间范围
 */
function getPeriodConfig(period: KlinePeriod): { count: number; days: number } {
  switch (period) {
    case 'day':
      return { count: 60, days: 60 }; // 日K：60天
    case 'week':
      return { count: 26, days: 180 }; // 周K：180天（约26周）
    case 'month':
      return { count: 36, days: 1095 }; // 月K：3年（36个月，约1095天）
    default:
      return { count: 60, days: 60 };
  }
}

export async function getKlineData(
  stockCode: string,
  period: KlinePeriod,
  count?: number // 如果不指定，根据周期自动计算
): Promise<KlineData[]> {
  // 根据周期获取配置
  const periodConfig = getPeriodConfig(period);
  const actualCount = count ?? periodConfig.count;
  const daysToShow = periodConfig.days;
  try {
    // 使用东方财富API（更可靠，支持CORS）
    // API格式：https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.600000&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=0&end=20500000
    // secid格式：1.600000 (1=上海，0=深圳) 或 0.002255
    
    // 处理股票代码格式
    let codeWithoutPrefix = stockCode.replace(/^(sh|sz)/, '');
    let isShanghai: boolean;
    
    // 判断是上海还是深圳
    if (stockCode.startsWith('sh')) {
      isShanghai = true;
    } else if (stockCode.startsWith('sz')) {
      isShanghai = false;
    } else {
      // 如果没有前缀，根据代码判断：00/30开头是深圳，其他是上海
      isShanghai = !(codeWithoutPrefix.startsWith('00') || codeWithoutPrefix.startsWith('30'));
    }
    
    const secid = `${isShanghai ? '1' : '0'}.${codeWithoutPrefix}`;
    
    // 周期参数：101=日K, 102=周K, 103=月K
    let klt: string;
    if (period === 'day') {
      klt = '101';
    } else if (period === 'week') {
      klt = '102';
    } else if (period === 'month') {
      klt = '103';
    } else {
      klt = '101'; // 默认日K
    }
    
    // 东方财富API参数：不使用时间戳，使用默认参数
    // beg=0表示从最早开始，end=20500000表示到未来（实际会返回到当前）
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=${klt}&fqt=1&beg=0&end=20500000&lmt=${actualCount}`;
    
    console.log(`[K线数据] 请求URL: ${url}`);
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const json = await response.json();
      console.log(`[K线数据] API返回:`, json);
      console.log(`[K线数据] json.data:`, json.data);
      console.log(`[K线数据] json.data?.klines:`, json.data?.klines);
      
      // 检查不同的数据格式
      let klines: string[] | null = null;
      
      if (json.data?.klines && Array.isArray(json.data.klines)) {
        klines = json.data.klines;
      } else if (json.klines && Array.isArray(json.klines)) {
        klines = json.klines;
      } else if (Array.isArray(json.data)) {
        // 如果data本身就是数组
        klines = json.data;
      } else if (json.rc === 0 && json.data) {
        // 检查其他可能的数据字段
        console.log(`[K线数据] 尝试查找其他数据字段:`, Object.keys(json.data));
        // 可能的数据字段：data, klines, list等
        if (json.data.data && Array.isArray(json.data.data)) {
          klines = json.data.data;
        } else if (json.data.list && Array.isArray(json.data.list)) {
          klines = json.data.list;
        }
      }
      
      if (!klines || klines.length === 0) {
        console.error(`[K线数据] 无法找到有效数据，返回结构:`, JSON.stringify(json, null, 2));
        throw new Error('没有有效数据');
      }
      
      console.log(`[K线数据] 找到 ${klines.length} 条K线数据`);
      
      const klineData: KlineData[] = klines.map((line: string) => {
        // 数据格式：日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率
        const parts = line.split(',');
        if (parts.length < 6) return null;
        
        return {
          date: parts[0], // YYYY-MM-DD格式
          open: parseFloat(parts[1]) || 0,
          close: parseFloat(parts[2]) || 0,
          high: parseFloat(parts[3]) || 0,
          low: parseFloat(parts[4]) || 0,
          volume: parseFloat(parts[5]) || 0,
        };
      }).filter((item: KlineData | null): item is KlineData => item !== null && item.open > 0 && item.close > 0);
      
      if (klineData.length === 0) {
        throw new Error('没有有效数据');
      }
      
      // 确保按时间升序排列（lightweight-charts要求）
      let result = klineData;
      result.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateA - dateB; // 升序
      });
      
      // 根据周期过滤数据：只保留指定天数内的数据
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToShow);
      const cutoffTime = cutoffDate.getTime();
      
      result = result.filter((item) => {
        const itemTime = new Date(item.date).getTime();
        return itemTime >= cutoffTime;
      });
      
      // 如果过滤后数据太多，只取最后actualCount条
      if (result.length > actualCount) {
        result = result.slice(-actualCount);
      }
      
      console.log(`[K线数据] 过滤后保留 ${result.length} 条数据（最近${daysToShow}天）`);
      
      return result;
    } catch (error) {
      console.error(`[K线数据] 东方财富API失败:`, error);
      // 如果失败，尝试备用API
      return getKlineDataAlternative(stockCode, period, actualCount);
    }
  } catch (error) {
    console.error(`获取K线数据失败 (${stockCode}, ${period}):`, error);
    
    // 如果腾讯API失败，尝试使用备用方案（新浪或其他）
    const periodConfig = getPeriodConfig(period);
    const actualCount = count ?? periodConfig.count;
    return getKlineDataAlternative(stockCode, period, actualCount);
  }
}


/**
 * 备用方案：使用腾讯财经K线API（通过script标签绕过CORS）
 */
async function getKlineDataAlternative(
  stockCode: string,
  period: KlinePeriod,
  count?: number
): Promise<KlineData[]> {
  // 根据周期获取配置
  const periodConfig = getPeriodConfig(period);
  const actualCount = count ?? periodConfig.count;
  const daysToShow = periodConfig.days;
  try {
    console.log(`[K线数据] 使用腾讯财经API（备用）获取 ${stockCode} 的 ${period} 数据`);
    
    const formattedCode = formatStockCode(stockCode);
    
    // 腾讯API的周期参数映射
    let periodParam: string;
    if (period === 'day') {
      periodParam = 'day';
    } else if (period === 'week') {
      periodParam = 'week';
    } else if (period === 'month') {
      periodParam = 'month';
    } else {
      periodParam = 'day'; // 默认日K
    }
    
    // 腾讯K线API: https://web.ifzq.gtimg.cn/app/kline/kline?param=sz002255,day,1,0,250,640,qfq
    const url = `https://web.ifzq.gtimg.cn/app/kline/kline?param=${formattedCode},${periodParam},1,0,${actualCount},640,qfq&_=${Date.now()}`;
    
    console.log(`[K线数据] 腾讯财经API请求URL: ${url}`);
    
    // 使用script标签加载（绕过CORS限制），类似实时数据获取的方式
    return new Promise<KlineData[]>((resolve) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
        console.error('[K线数据] 腾讯财经API超时');
        resolve([]);
      }, 10000);
      
      script.src = url;
      script.onload = () => {
        clearTimeout(timeout);
        // 延迟一下，确保数据已经写入全局变量
        setTimeout(() => {
          try {
            // 腾讯K线API会将数据写入全局变量，格式类似：var hq_str_sz002255="day,2024-01-01,10.50,10.80,10.30,10.60,1000000;..."
            const globalVarName = `hq_str_${formattedCode}`;
            const dataStr = (window as any)[globalVarName];
            
            if (!dataStr || typeof dataStr !== 'string') {
              console.warn('[K线数据] 腾讯财经API：无法从全局变量获取数据');
              resolve([]);
              return;
            }
            
            console.log(`[K线数据] 腾讯财经API返回数据（前200字符）:`, dataStr.substring(0, 200));
            
            // 解析数据：可能是 "day,2024-01-01,10.50,10.80,10.30,10.60,1000000;..."
            // 或者 "var hq_str_sz002255=\"day,2024-01-01,10.50,10.80,10.30,10.60,1000000;...\""
            let actualDataStr = dataStr;
            const match = dataStr.match(/var\s+hq_str_\w+="([^"]+)"/);
            if (match && match[1]) {
              actualDataStr = match[1];
            }
            
            const lines = actualDataStr.split(';').filter(line => line.trim());
            const dataLines = lines.slice(1); // 跳过第一行（可能是元数据，如"day"）
            
            const klineData: KlineData[] = [];
            for (const line of dataLines) {
              if (!line.trim()) continue;
              const parts = line.split(',');
              if (parts.length < 6) continue;
              
              const date = parts[0];
              const open = parseFloat(parts[1]);
              const close = parseFloat(parts[2]);
              const high = parseFloat(parts[3]);
              const low = parseFloat(parts[4]);
              const volume = parseFloat(parts[5]) || 0;
              
              if (!isNaN(open) && !isNaN(close) && !isNaN(high) && !isNaN(low)) {
                klineData.push({ date, open, high, low, close, volume });
              }
            }
            
            if (klineData.length === 0) {
              console.warn('[K线数据] 腾讯财经API：解析后没有有效数据');
              resolve([]);
              return;
            }
            
            console.log(`[K线数据] 腾讯财经API解析到 ${klineData.length} 条K线数据`);
            
            // 确保按时间升序排列（lightweight-charts要求）
            let result = klineData;
            result.sort((a, b) => {
              const dateA = new Date(a.date).getTime();
              const dateB = new Date(b.date).getTime();
              return dateA - dateB; // 升序
            });
            
            // 根据周期过滤数据：只保留指定天数内的数据
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToShow);
            const cutoffTime = cutoffDate.getTime();
            
            result = result.filter((item) => {
              const itemTime = new Date(item.date).getTime();
              return itemTime >= cutoffTime;
            });
            
            // 如果过滤后数据太多，只取最后actualCount条
            if (result.length > actualCount) {
              result = result.slice(-actualCount);
            }
            
            console.log(`[K线数据] 腾讯API过滤后保留 ${result.length} 条数据（最近${daysToShow}天）`);
            
            resolve(result);
          } catch (error) {
            console.error('[K线数据] 腾讯财经API解析失败:', error);
            resolve([]);
          } finally {
            if (document.body.contains(script)) {
              document.body.removeChild(script);
            }
          }
        }, 100);
      };
      
      script.onerror = () => {
        clearTimeout(timeout);
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
        console.error('[K线数据] 腾讯财经API加载失败');
        resolve([]);
      };
      
      document.body.appendChild(script);
    });
  } catch (error) {
    console.error(`[K线数据] 腾讯财经API失败:`, error);
    return [];
  }
}
