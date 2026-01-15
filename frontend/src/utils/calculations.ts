import { Transaction } from '../types';

/**
 * 从交易记录数组计算总数量和平均成本价
 */
export function calculateHoldingFromTransactions(
  transactions: Transaction[]
): [number, number] {
  if (!transactions || transactions.length === 0) {
    return [0.0, 0.0];
  }

  let totalQuantity = 0.0;
  let totalCost = 0.0;

  for (const trans of transactions) {
    const quantity = Number(trans.quantity) || 0;
    const price = Number(trans.price) || 0;
    if (quantity > 0 && price > 0) {
      totalQuantity += quantity;
      totalCost += quantity * price;
    }
  }

  const avgPrice = totalQuantity > 0 ? totalCost / totalQuantity : 0.0;
  return [totalQuantity, avgPrice];
}

/**
 * 判断是否为美股代码
 */
export function isUsStock(stockCode: string): boolean {
  return /^[A-Z]{1,5}$/.test(stockCode);
}

/**
 * 格式化股票代码（添加市场前缀）
 */
export function formatStockCode(stockCode: string): string {
  if (isUsStock(stockCode)) {
    return stockCode;
  }
  if (stockCode.startsWith('00') || stockCode.startsWith('30')) {
    return `sz${stockCode}`;
  }
  return `sh${stockCode}`;
}

/**
 * 格式化价格：固定两位小数，不trim掉末尾的0
 */
export function formatPriceFixed(price: number | null | undefined): string {
  if (price === null || price === undefined) {
    return '--';
  }
  return price.toFixed(2);
}

/**
 * 格式化价格：最多三位小数，去掉末尾的0
 */
export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) {
    return '--';
  }
  // 保留最多3位小数，去掉末尾的0
  return price.toFixed(3).replace(/\.?0+$/, '');
}
