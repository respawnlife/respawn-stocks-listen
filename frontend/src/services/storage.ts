import { HoldingsConfig, StockState } from '../types';
import defaultConfigData from '../config/defaultConfig.json';
import {
  loadAllHoldingsTransactions,
  loadHistoricalHoldings,
  saveHoldingsTransactions,
  saveHistoricalHoldings,
  deleteHoldingsTransactions,
  migrateTransactionsFromLocalStorage,
} from './indexedDB';

const CONFIG_KEY = 'holdings_config';
const HISTORY_PREFIX = 'history_';

/**
 * 获取默认配置（从前端项目内的配置文件读取）
 */
function getDefaultConfig(): HoldingsConfig {
  return defaultConfigData as HoldingsConfig;
}

/**
 * 初始化配置：如果 localStorage 中没有配置，使用前端项目内的默认配置初始化
 */
export async function initializeConfig(): Promise<HoldingsConfig> {
  // 初始化时清理一次旧的历史数据
  cleanupOldHistoryData(30);
  
  // 先检查 localStorage
  let config: HoldingsConfig | null = null;
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      config = JSON.parse(stored);
      // 验证配置格式（兼容旧格式）
      if (config && config.funds) {
        // 如果是旧格式（只有 stocks），转换为新格式
        if ((config as any).stocks && !config.holdings && !config.watchlist) {
          console.log('检测到旧格式配置，正在转换...');
          const holdings: { [code: string]: any } = {};
          const watchlist: { [code: string]: any } = {};
          
          for (const [code, stockConfig] of Object.entries((config as any).stocks)) {
            const transactions = (stockConfig as any).transactions || [];
            if (transactions.length > 0) {
              // 有交易记录的是持仓
              holdings[code] = {
                transactions: transactions,
                alert_up: (stockConfig as any).alert_up || null,
                alert_down: (stockConfig as any).alert_down || null,
              };
            } else {
              // 无交易记录的是自选股
              watchlist[code] = {
                alert_up: (stockConfig as any).alert_up || null,
                alert_down: (stockConfig as any).alert_down || null,
              };
            }
          }
          
          config.holdings = holdings;
          config.watchlist = watchlist;
          delete (config as any).stocks;
          
          // 保存转换后的配置
          localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
          console.log('配置已转换为新格式');
        }
        
        // 确保新格式字段存在
        if (!config.holdings) config.holdings = {};
        if (!config.watchlist) config.watchlist = {};
        if (!config.historical_holdings) config.historical_holdings = [];
      }
    }
  } catch (error) {
    console.error('读取 localStorage 配置失败:', error);
  }

  // localStorage 中没有配置，使用前端项目内的默认配置
  if (!config) {
    console.log('localStorage 中没有配置，使用默认配置初始化');
    config = getDefaultConfig();

    // 将配置写入 localStorage
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      console.log('默认配置已写入 localStorage');
    } catch (error) {
      console.error('写入 localStorage 失败:', error);
    }
  }

  // 迁移交易数据到 IndexedDB（如果还没有迁移过）
  await migrateTransactionsFromLocalStorage(config);

  // 从 IndexedDB 加载交易数据并合并到配置中
  const holdingsTransactions = await loadAllHoldingsTransactions();
  const historicalHoldings = await loadHistoricalHoldings();

  // 合并交易数据到 holdings
  for (const [code, transactions] of Object.entries(holdingsTransactions)) {
    if (config.holdings[code]) {
      config.holdings[code].transactions = transactions;
    } else {
      // 如果配置中没有该持仓，但 IndexedDB 中有交易记录，创建持仓
      config.holdings[code] = {
        transactions: transactions,
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
 * 加载持仓配置（从 localStorage 读取，并从 IndexedDB 加载交易数据）
 */
export async function loadHoldingsConfig(): Promise<HoldingsConfig> {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      // 验证配置格式（兼容旧格式）
      if (config.funds) {
        // 如果是旧格式（只有 stocks），转换为新格式
        if (config.stocks && (!config.holdings || !config.watchlist)) {
          const holdings: { [code: string]: any } = config.holdings || {};
          const watchlist: { [code: string]: any } = config.watchlist || {};
          
          for (const [code, stockConfig] of Object.entries(config.stocks)) {
            // 如果已经在 holdings 或 watchlist 中，跳过
            if (holdings[code] || watchlist[code]) continue;
            
            const transactions = (stockConfig as any).transactions || [];
            if (transactions.length > 0) {
              holdings[code] = {
                transactions: transactions,
                alert_up: (stockConfig as any).alert_up || null,
                alert_down: (stockConfig as any).alert_down || null,
              };
            } else {
              watchlist[code] = {
                alert_up: (stockConfig as any).alert_up || null,
                alert_down: (stockConfig as any).alert_down || null,
              };
            }
          }
          
          config.holdings = holdings;
          config.watchlist = watchlist;
          delete config.stocks;
          localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        }
        
        // 确保新格式字段存在
        if (!config.holdings) config.holdings = {};
        if (!config.watchlist) config.watchlist = {};
        if (!config.historical_holdings) config.historical_holdings = [];

        // 从 IndexedDB 加载交易数据并合并
        const holdingsTransactions = await loadAllHoldingsTransactions();
        const historicalHoldings = await loadHistoricalHoldings();

        // 合并交易数据到 holdings
        for (const [code, transactions] of Object.entries(holdingsTransactions)) {
          if (config.holdings[code]) {
            config.holdings[code].transactions = transactions;
          } else {
            // 如果配置中没有该持仓，但 IndexedDB 中有交易记录，创建持仓
            config.holdings[code] = {
              transactions: transactions,
              alert_up: null,
              alert_down: null,
            };
          }
        }

        // 合并历史持仓
        config.historical_holdings = historicalHoldings;
        
        return config;
      }
    }
  } catch (error) {
    console.error('加载配置失败:', error);
  }

  // 如果读取失败，返回默认配置（这种情况不应该发生，因为 initializeConfig 会先执行）
  const defaultConfig = getDefaultConfig();
  // 从 IndexedDB 加载交易数据
  const holdingsTransactions = await loadAllHoldingsTransactions();
  const historicalHoldings = await loadHistoricalHoldings();
  
  for (const [code, transactions] of Object.entries(holdingsTransactions)) {
    if (defaultConfig.holdings[code]) {
      defaultConfig.holdings[code].transactions = transactions;
    }
  }
  defaultConfig.historical_holdings = historicalHoldings;
  
  return defaultConfig;
}

/**
 * 保存持仓配置（交易数据保存到 IndexedDB，其他配置保存到 localStorage）
 */
export async function saveHoldingsConfig(config: HoldingsConfig): Promise<void> {
  try {
    // 保存交易数据到 IndexedDB
    // 1. 保存持仓交易记录
    for (const [code, holding] of Object.entries(config.holdings)) {
      if (holding.transactions && holding.transactions.length > 0) {
        await saveHoldingsTransactions(code, holding.transactions);
      } else {
        // 如果没有交易记录，删除 IndexedDB 中的记录
        await deleteHoldingsTransactions(code);
      }
    }

    // 2. 保存历史持仓
    if (config.historical_holdings && config.historical_holdings.length > 0) {
      await saveHistoricalHoldings(config.historical_holdings);
    } else {
      await saveHistoricalHoldings([]);
    }

    // 保存配置到 localStorage（不包含交易数据）
    const configToSave: HoldingsConfig = {
      ...config,
      holdings: Object.fromEntries(
        Object.entries(config.holdings).map(([code, holding]) => [
          code,
          {
            alert_up: holding.alert_up,
            alert_down: holding.alert_down,
            transactions: [], // 交易数据不保存在 localStorage
          },
        ])
      ),
      historical_holdings: [], // 历史持仓不保存在 localStorage
    };

    localStorage.setItem(CONFIG_KEY, JSON.stringify(configToSave));
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}

/**
 * 加载历史数据
 */
export function loadHistoryData(date: string): any {
  try {
    const stored = localStorage.getItem(`${HISTORY_PREFIX}${date}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('加载历史数据失败:', error);
  }
  return null;
}

/**
 * 清理超过指定天数的历史数据（默认保留最近30天）
 */
function cleanupOldHistoryData(keepDays: number = 30): void {
  try {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    
    // 遍历 localStorage 中的所有 key
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(HISTORY_PREFIX)) {
        // 提取日期部分（history_2026-01-15 -> 2026-01-15）
        const dateStr = key.substring(HISTORY_PREFIX.length);
        
        // 解析日期
        const date = new Date(dateStr + 'T00:00:00');
        if (isNaN(date.getTime())) {
          // 日期格式无效，跳过
          continue;
        }
        
        // 如果日期早于截止日期，标记为删除
        if (date < cutoffDate) {
          keysToRemove.push(key);
        }
      }
    }
    
    // 删除过期的历史数据
    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });
    
    if (keysToRemove.length > 0) {
      console.log(`已清理 ${keysToRemove.length} 条超过 ${keepDays} 天的历史数据`);
    }
  } catch (error) {
    console.error('清理历史数据失败:', error);
  }
}

/**
 * 保存历史数据
 */
export function saveHistoryData(date: string, data: any): void {
  try {
    localStorage.setItem(`${HISTORY_PREFIX}${date}`, JSON.stringify(data));
    // 保存后清理超过30天的旧数据
    cleanupOldHistoryData(30);
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
