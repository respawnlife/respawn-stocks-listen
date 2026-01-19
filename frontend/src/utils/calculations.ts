import { Transaction } from '../types';

/**
 * 从交易记录数组计算总数量和平均成本价
 * 成本价计算方式：(买入总金额 - 卖出总金额) / 净持仓数量
 * 用户手动输入总金额，系统不再计算手续费/过户费/印花税
 */
export function calculateHoldingFromTransactions(
  transactions: Transaction[]
): [number, number] {
  if (!transactions || transactions.length === 0) {
    return [0.0, 0.0];
  }

  let totalQuantity = 0.0; // 当前持仓数量（买入 - 卖出）
  let totalCost = 0.0; // 净投入金额（买入总金额 - 卖出总金额）

  for (const trans of transactions) {
    const quantity = Number(trans.quantity) || 0;
    const price = Number(trans.price) || 0;
    
    if (quantity !== 0 && price > 0) {
      const baseAmount = quantity * price; // 基础金额（买入为正，卖出为负）
      totalCost += baseAmount;
      totalQuantity += quantity; // quantity为负时会减少总数量
    }
  }

  // 确保持仓数量不为负数
  totalQuantity = Math.max(0, totalQuantity);
  
  // 成本价 = 净投入金额 / 净持仓数量
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
 * 格式化价格：固定三位小数，不trim掉末尾的0
 */
export function formatPriceFixed(price: number | null | undefined): string {
  if (price === null || price === undefined) {
    return '--';
  }
  return price.toFixed(3);
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
