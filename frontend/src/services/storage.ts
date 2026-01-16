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

  // 从 IndexedDB 加载交易数据并合并到配置中
  const holdingsTransactions = await loadAllHoldingsTransactions();
  const historicalHoldings = await loadHistoricalHoldings();

  // 合并交易数据到 holdings
  for (const [code, transactions] of Object.entries(holdingsTransactions)) {
    // 确保 transactions 是数组
    const validTransactions = Array.isArray(transactions) ? transactions : [];
    if (config.holdings[code]) {
      config.holdings[code].transactions = validTransactions;
    } else {
      // 如果配置中没有该持仓，但 IndexedDB 中有交易记录，创建持仓
      config.holdings[code] = {
        transactions: validTransactions,
        alert_up: null,
        alert_down: null,
      };
    }
  }

  // 合并历史持仓
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

  // 从 IndexedDB 加载交易数据并合并
  const holdingsTransactions = await loadAllHoldingsTransactions();
  const historicalHoldings = await loadHistoricalHoldings();

  // 合并交易数据到 holdings
  for (const [code, transactions] of Object.entries(holdingsTransactions)) {
    // 确保 transactions 是数组
    const validTransactions = Array.isArray(transactions) ? transactions : [];
    if (config.holdings[code]) {
      config.holdings[code].transactions = validTransactions;
    } else {
      // 如果配置中没有该持仓，但 IndexedDB 中有交易记录，创建持仓
      config.holdings[code] = {
        transactions: validTransactions,
        alert_up: null,
        alert_down: null,
      };
    }
  }

  // 合并历史持仓
  config.historical_holdings = historicalHoldings;

  return config;
}

/**
 * 保存持仓配置（所有数据保存到 IndexedDB）
 */
export async function saveHoldingsConfig(config: HoldingsConfig): Promise<void> {
  try {
    // 1. 保存持仓交易记录到 IndexedDB
    for (const [code, holding] of Object.entries(config.holdings)) {
      if (holding.transactions && holding.transactions.length > 0) {
        await saveHoldingsTransactions(code, holding.transactions);
      } else {
        // 如果没有交易记录，删除 IndexedDB 中的记录
        await deleteHoldingsTransactions(code);
      }
    }

    // 2. 保存历史持仓到 IndexedDB
    if (config.historical_holdings && config.historical_holdings.length > 0) {
      await saveHistoricalHoldings(config.historical_holdings);
    } else {
      await saveHistoricalHoldings([]);
    }

    // 3. 保存配置到 IndexedDB（不包含交易数据）
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
