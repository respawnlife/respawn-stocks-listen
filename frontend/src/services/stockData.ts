import { StockRealtimeData } from '../types';
import { getRealtimePriceFromTencent, getMultipleRealtimePricesFromTencent } from './stockDataAlternative';

/**
 * 获取股票实时价格（使用腾讯API，完全前端，无需代理）
 */
export async function getRealtimePrice(
  stockCode: string
): Promise<StockRealtimeData | null> {
  // 使用批量查询接口（即使只有一个股票）
  try {
    const results = await getMultipleRealtimePricesFromTencent([stockCode]);
    return results.get(stockCode) || null;
  } catch (error) {
    console.warn(`腾讯API获取 ${stockCode} 失败:`, error);
    return null;
  }
}

/**
 * 获取多个股票的实时价格（批量查询）
 */
export async function getMultipleRealtimePrices(
  stockCodes: string[]
): Promise<Map<string, StockRealtimeData>> {
  if (stockCodes.length === 0) {
    return new Map();
  }

  try {
    // 使用批量查询接口
    const results = await getMultipleRealtimePricesFromTencent(stockCodes);
    return results;
  } catch (error) {
    console.error(`批量获取股票数据失败:`, error);
    return new Map();
  }
}
