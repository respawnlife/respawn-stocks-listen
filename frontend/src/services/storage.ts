import { HoldingsConfig, StockState } from '../types';
import defaultConfigData from '../config/defaultConfig.json';
import {
  loadAllHoldingsTransactions,
  loadHistoricalHoldings,
  saveHoldingsTransactions,
  saveHistoricalHoldings,
  deleteHoldingsTransactions,
  saveConfig,
  loadConfig,
  saveHistoryData as saveHistoryDataToIndexedDB,
  loadHistoryData as loadHistoryDataFromIndexedDB,
  loadAllWatchlistItems,
  saveWatchlistItem,
  deleteWatchlistItem,
} from './indexedDB';

/**
 * 获取默认配置（从前端项目内的配置文件读取）
 */
function getDefaultConfig(): HoldingsConfig {
  return defaultConfigData as HoldingsConfig;
}

/**
 * 初始化配置：从 IndexedDB 加载配置，如果没有则使用默认配置
 */
export async function initializeConfig(): Promise<HoldingsConfig> {
  // 从 IndexedDB 加载配置
  let configData = await loadConfig();
  let config: HoldingsConfig;

  if (configData) {
    // 从 IndexedDB 加载的配置
    config = {
      privacy_mode: configData.privacy_mode ?? false,
      funds: configData.funds || {
        available_funds: 0.0,
        total_original_funds: 0.0,
      },
      market_hours: configData.market_hours || {},
      holdings: configData.holdings || {},
      watchlist: configData.watchlist || {},
      historical_holdings: [],
    };
  } else {
    // 没有配置，使用默认配置
    console.log('IndexedDB 中没有配置，使用默认配置初始化');
    config = getDefaultConfig();
    // 保存默认配置到 IndexedDB
    await saveConfig(config);
  }

  // 从 IndexedDB 加载自选表数据
  const watchlistItems = await loadAllWatchlistItems();
  
  // 从 IndexedDB 加载交易数据
  const holdingsTransactions = await loadAllHoldingsTransactions();
  const historicalHoldings = await loadHistoricalHoldings();

  // 重建 holdings 和 watchlist
  config.holdings = {};
  config.watchlist = {};
  
  // 处理所有自选股
  for (const [code, watchlistItem] of Object.entries(watchlistItems)) {
    const transactions = holdingsTransactions[code] || [];
    const validTransactions = Array.isArray(transactions) ? transactions : [];
    
    if (validTransactions.length > 0) {
      // 有交易记录，是持仓
      config.holdings[code] = {
        transactions: validTransactions,
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
      };
    } else {
      // 没有交易记录，是自选
      config.watchlist[code] = {
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
      };
    }
  }

  // 合并历史持仓（兼容旧数据）
  config.historical_holdings = historicalHoldings;

  return config;
}

/**
 * 加载持仓配置（从 IndexedDB 读取）
 */
export async function loadHoldingsConfig(): Promise<HoldingsConfig> {
  // 从 IndexedDB 加载配置
  const configData = await loadConfig();
  let config: HoldingsConfig;

  if (configData) {
    config = {
      privacy_mode: configData.privacy_mode ?? false,
      funds: configData.funds || {
        available_funds: 0.0,
        total_original_funds: 0.0,
      },
      market_hours: configData.market_hours || {},
      holdings: configData.holdings || {},
      watchlist: configData.watchlist || {},
      historical_holdings: [],
    };
  } else {
    // 如果读取失败，返回默认配置
    config = getDefaultConfig();
  }

  // 从 IndexedDB 加载自选表数据
  const watchlistItems = await loadAllWatchlistItems();
  
  // 从 IndexedDB 加载交易数据
  const holdingsTransactions = await loadAllHoldingsTransactions();
  const historicalHoldings = await loadHistoricalHoldings();

  // 重建 holdings 和 watchlist
  config.holdings = {};
  config.watchlist = {};
  
  // 处理所有自选股
  for (const [code, watchlistItem] of Object.entries(watchlistItems)) {
    const transactions = holdingsTransactions[code] || [];
    const validTransactions = Array.isArray(transactions) ? transactions : [];
    
    if (validTransactions.length > 0) {
      // 有交易记录，是持仓
      config.holdings[code] = {
        transactions: validTransactions,
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
      };
    } else {
      // 没有交易记录，是自选
      config.watchlist[code] = {
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
      };
    }
  }

  // 合并历史持仓（兼容旧数据）
  config.historical_holdings = historicalHoldings;

  return config;
}

/**
 * 保存持仓配置（所有数据保存到 IndexedDB）
 */
export async function saveHoldingsConfig(config: HoldingsConfig): Promise<void> {
  try {
    // 1. 保存所有自选股到 watchlist 表
    const allCodes = new Set<string>();
    
    // 收集所有持仓和自选的代码
    Object.keys(config.holdings || {}).forEach(code => allCodes.add(code));
    Object.keys(config.watchlist || {}).forEach(code => allCodes.add(code));
    
    // 保存到 watchlist 表
    for (const code of allCodes) {
      const holding = config.holdings[code];
      const watchlistItem = config.watchlist[code];
      
      if (holding) {
        // 是持仓，保存到 watchlist 表
        await saveWatchlistItem({
          code,
          name: code, // 名称可以从实时数据更新
          alert_up: holding.alert_up,
          alert_down: holding.alert_down,
        });
        
        // 保存交易记录
        if (holding.transactions && holding.transactions.length > 0) {
          await saveHoldingsTransactions(code, holding.transactions);
        } else {
          await deleteHoldingsTransactions(code);
        }
      } else if (watchlistItem) {
        // 是自选，保存到 watchlist 表
        await saveWatchlistItem({
          code,
          name: code,
          alert_up: watchlistItem.alert_up,
          alert_down: watchlistItem.alert_down,
        });
      }
    }
    
    // 2. 删除不在配置中的自选股（但保留交易记录）
    const watchlistItems = await loadAllWatchlistItems();
    const allTransactions = await loadAllHoldingsTransactions();
    
    for (const code of Object.keys(watchlistItems)) {
      if (!allCodes.has(code)) {
        // 检查是否有交易记录，如果有则保留在 watchlist 中（作为历史持仓）
        if (!allTransactions[code] || allTransactions[code].length === 0) {
          // 没有交易记录，可以删除
          await deleteWatchlistItem(code);
        }
        // 有交易记录，保留在 watchlist 中（作为历史持仓）
      }
    }

    // 3. 保存历史持仓到 IndexedDB（兼容旧数据）
    if (config.historical_holdings && config.historical_holdings.length > 0) {
      await saveHistoricalHoldings(config.historical_holdings);
    } else {
      await saveHistoricalHoldings([]);
    }

    // 4. 保存配置到 IndexedDB（不包含交易数据和自选数据）
    await saveConfig(config);
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}

/**
 * 加载历史数据（从 IndexedDB）
 */
export async function loadHistoryData(date: string): Promise<any> {
  try {
    return await loadHistoryDataFromIndexedDB(date);
  } catch (error) {
    console.error('加载历史数据失败:', error);
    return null;
  }
}

/**
 * 保存历史数据（到 IndexedDB，永久保存）
 */
export async function saveHistoryData(date: string, data: any): Promise<void> {
  try {
    await saveHistoryDataToIndexedDB(date, data);
    // 历史数据永久保存，不清理
  } catch (error) {
    console.error('保存历史数据失败:', error);
  }
}

/**
 * 获取昨天的日期字符串
 */
export function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * 获取今天的日期字符串
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}
