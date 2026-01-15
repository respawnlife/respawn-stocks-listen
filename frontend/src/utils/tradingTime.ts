import { HoldingsConfig } from '../types';
import { isUsStock } from './calculations';

/**
 * 判断当前时间是否在交易时间内
 */
export function isTradingTime(
  stockCode: string,
  marketHoursConfig: HoldingsConfig['market_hours']
): boolean {
  // 判断股票所属市场
  const marketName = isUsStock(stockCode) ? '美股' : 'A股';

  // 获取市场配置
  const marketConfig = marketHoursConfig[marketName];
  if (!marketConfig?.enabled) {
    // 如果市场未启用，默认允许交易（向后兼容）
    return true;
  }

  // 检查是否为工作日
  const now = new Date();
  const weekday = now.getDay() === 0 ? 7 : now.getDay(); // 转换为1-7，周一到周日
  const allowedWeekdays = marketConfig.weekdays || [1, 2, 3, 4, 5];
  if (!allowedWeekdays.includes(weekday)) {
    return false;
  }

  // 获取当前时间（时:分）
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  // 检查上午交易时间
  const morning = marketConfig.morning;
  if (morning) {
    const morningStart = morning.start;
    const morningEnd = morning.end;
    // 处理跨日交易（如美股：22:30 - 05:00）
    if (morningStart > morningEnd) {
      // 跨日交易：从晚上到第二天早上
      if (currentTime >= morningStart || currentTime <= morningEnd) {
        return true;
      }
    } else {
      // 正常交易：同一天内
      if (currentTime >= morningStart && currentTime <= morningEnd) {
        return true;
      }
    }
  }

  // 检查下午交易时间
  const afternoon = marketConfig.afternoon;
  if (afternoon) {
    const afternoonStart = afternoon.start;
    const afternoonEnd = afternoon.end;
    // 下午交易时间通常不会跨日
    if (currentTime >= afternoonStart && currentTime <= afternoonEnd) {
      return true;
    }
  }

  return false;
}

/**
 * 判断是否应该停止更新（超过15:01）
 */
export function shouldStopUpdating(): boolean {
  const now = new Date();
  if (now.getHours() > 15) {
    return true;
  }
  if (now.getHours() === 15 && now.getMinutes() >= 1) {
    return true;
  }
  return false;
}
