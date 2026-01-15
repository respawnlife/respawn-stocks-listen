import { StockRealtimeData } from '../types';
import { formatStockCode } from '../utils/calculations';

/**
 * 使用腾讯财经API批量获取股票实时价格（使用script标签，完全前端，无需代理）
 * API格式：http://qt.gtimg.cn/q=sh600000,sz000001
 * 返回格式：v_sh600000="1~浦发银行~600000~8.45~8.44~..."; v_sz000001="...";
 */
export async function getMultipleRealtimePricesFromTencent(
  stockCodes: string[]
): Promise<Map<string, StockRealtimeData>> {
  const results = new Map<string, StockRealtimeData>();
  
  if (stockCodes.length === 0) {
    return results;
  }

  try {
    // 格式化所有股票代码
    const formattedCodes = stockCodes.map(code => formatStockCode(code));
    const codeMap = new Map<string, string>(); // formattedCode -> originalCode
    formattedCodes.forEach((formatted, index) => {
      codeMap.set(formatted, stockCodes[index]);
    });

    // 构建URL：用逗号连接多个代码
    const url = `http://qt.gtimg.cn/q=${formattedCodes.join(',')}`;
    
    // 使用script标签直接加载（绕过CORS限制）
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const callbackName = `tencent_batch_callback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 创建全局回调函数
      (window as any)[callbackName] = () => {
        // 清理
        delete (window as any)[callbackName];
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
        
        // 解析所有返回的数据
        try {
          for (const formattedCode of formattedCodes) {
            const originalCode = codeMap.get(formattedCode)!;
            const globalVarName = `v_${formattedCode}`;
            const dataStr = (window as any)[globalVarName];
            
            if (!dataStr || typeof dataStr !== 'string') {
              continue;
            }

            // 解析数据：v_sh600000="1~浦发银行~600000~8.45~8.44~..."
            // 数据格式：状态~名称~代码~当前价~昨收~今开~最高~最低~成交量~成交额~买盘~卖盘~更新时间~涨跌额~涨跌幅~...
            // 根据实际数据：v_sh688795="1~摩尔线程-U~688795~632.60~648.00~640.05~..."
            const parts = dataStr.split('~');
            if (parts.length < 5) {
              continue;
            }

            const name = parts[1] || originalCode;
            const currentPrice = parseFloat(parts[3]) || 0;
            const yesterdayClose = parseFloat(parts[4]) || 0;

            if (currentPrice <= 0) {
              continue;
            }

            // 查找更新时间
            // 更新时间通常在数据中间位置，格式：20260115142459 (14位数字)
            // 或者可能是其他格式，需要遍历查找
            let updateTime = '';
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              // 更新时间格式：20260115142459 (14位数字，YYYYMMDDHHmmss)
              if (/^\d{14}$/.test(part)) {
                const hour = part.substring(8, 10);
                const minute = part.substring(10, 12);
                const second = part.substring(12, 14);
                updateTime = `${hour}:${minute}:${second}.000`;
                break;
              }
            }

            // 如果没有找到更新时间，使用当前时间
            if (!updateTime) {
              const now = new Date();
              const hours = now.getHours().toString().padStart(2, '0');
              const minutes = now.getMinutes().toString().padStart(2, '0');
              const seconds = now.getSeconds().toString().padStart(2, '0');
              const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
              updateTime = `${hours}:${minutes}:${seconds}.${milliseconds}`;
            }

            results.set(originalCode, {
              price: currentPrice,
              name: name,
              yesterday_close: yesterdayClose || currentPrice,
              update_time: updateTime,
            });
          }
        } catch (error) {
          console.error(`解析腾讯API批量数据失败:`, error);
        }
        
        resolve(results);
      };

      script.src = url;
      script.onerror = () => {
        delete (window as any)[callbackName];
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
        resolve(results); // 即使失败也返回已有结果
      };
      
      // 监听script加载完成
      script.onload = () => {
        // 延迟一下，确保数据已经写入全局变量
        setTimeout(() => {
          if ((window as any)[callbackName]) {
            (window as any)[callbackName]();
          } else {
            resolve(results);
          }
        }, 100);
      };
      
      document.body.appendChild(script);
      
      // 设置超时
      setTimeout(() => {
        if (document.body.contains(script)) {
          delete (window as any)[callbackName];
          document.body.removeChild(script);
          resolve(results); // 超时也返回已有结果
        }
      }, 10000);
    });
  } catch (error) {
    console.error(`批量获取股票数据失败（腾讯）:`, error);
    return results;
  }
}

/**
 * 使用腾讯财经API获取单个股票实时价格（使用script标签，完全前端，无需代理）
 * API格式：http://qt.gtimg.cn/q=sh600000
 * 返回格式：v_sh600000="1~浦发银行~600000~8.45~8.44~8.43~123456~12345~123~8.44~8.45~100~200~2024-01-15~15:00:00~3";
 */
export async function getRealtimePriceFromTencent(
  stockCode: string
): Promise<StockRealtimeData | null> {
  try {
    const code = formatStockCode(stockCode);
    const url = `http://qt.gtimg.cn/q=${code}`;
    
    // 使用script标签直接加载（绕过CORS限制）
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const callbackName = `tencent_callback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 创建全局回调函数
      (window as any)[callbackName] = () => {
        // 清理
        delete (window as any)[callbackName];
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
        
        // 从全局变量中获取数据
        // 腾讯API会将数据写入全局变量，格式：v_sh600000="..."
        try {
          const globalVarName = `v_${code}`;
          const dataStr = (window as any)[globalVarName];
          
          if (!dataStr || typeof dataStr !== 'string') {
            resolve(null);
            return;
          }

          // 解析数据：v_sh600000="1~浦发银行~600000~8.45~8.44~..."
          const match = dataStr.match(/^([^~]+)~([^~]+)~([^~]+)~([^~]+)~([^~]+)/);
          if (!match) {
            resolve(null);
            return;
          }

          const name = match[2] || stockCode;
          const currentPrice = parseFloat(match[4]) || 0;
          const yesterdayClose = parseFloat(match[5]) || 0;

          if (currentPrice <= 0) {
            resolve(null);
            return;
          }

          // 格式化更新时间
          const now = new Date();
          const hours = now.getHours().toString().padStart(2, '0');
          const minutes = now.getMinutes().toString().padStart(2, '0');
          const seconds = now.getSeconds().toString().padStart(2, '0');
          const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
          const updateTime = `${hours}:${minutes}:${seconds}.${milliseconds}`;

          resolve({
            price: currentPrice,
            name: name,
            yesterday_close: yesterdayClose || currentPrice,
            update_time: updateTime,
          });
        } catch (error) {
          console.error(`解析腾讯API数据失败:`, error);
          resolve(null);
        }
      };

      script.src = url;
      script.onerror = () => {
        delete (window as any)[callbackName];
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
        reject(new Error('腾讯API请求失败'));
      };
      
      // 监听script加载完成
      script.onload = () => {
        // 延迟一下，确保数据已经写入全局变量
        setTimeout(() => {
          if ((window as any)[callbackName]) {
            (window as any)[callbackName]();
          }
        }, 100);
      };
      
      document.body.appendChild(script);
      
      // 设置超时
      setTimeout(() => {
        if (document.body.contains(script)) {
          delete (window as any)[callbackName];
          document.body.removeChild(script);
          reject(new Error('腾讯API请求超时'));
        }
      }, 10000);
    });
  } catch (error) {
    console.error(`获取股票 ${stockCode} 数据失败（腾讯）:`, error);
    return null;
  }
}
