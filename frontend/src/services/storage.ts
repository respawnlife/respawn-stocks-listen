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
  clearAllData,
  addTransaction,
  loadHoldingsTransactions,
  loadWatchlistItem,
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
    // 注意：holdings 和 watchlist 应该从 watchlist 表和 transactions 表重建，而不是从 config 中读取
    config = {
      privacy_mode: configData.privacy_mode ?? false,
      update_interval: configData.update_interval ?? 1000, // 默认1秒
      stock_order: configData.stock_order, // 加载排序顺序
      categories: configData.categories, // 加载分类数据
      funds: configData.funds || {
        available_funds: 0.0,
        total_original_funds: 0.0,
      },
      market_hours: configData.market_hours || {},
      holdings: {}, // 从 watchlist 表和 transactions 表重建，不从这里读取
      watchlist: {}, // 从 watchlist 表重建，不从这里读取
      historical_holdings: [],
    };
    // 确保"自选"分类有 isDefault 标识（兼容旧数据）
    if (config.categories) {
      for (const [name, data] of Object.entries(config.categories)) {
        if (name === '自选' && !data.isDefault) {
          config.categories[name] = { ...data, isDefault: true };
        }
      }
      // 确保"持仓"分类存在且有 isHoldings 标识
      if (!config.categories['持仓']) {
        config.categories['持仓'] = { codes: [], title: '持仓', color: '#2e7d32', isHoldings: true };
      } else if (!config.categories['持仓'].isHoldings) {
        config.categories['持仓'] = { ...config.categories['持仓'], isHoldings: true };
      }
    } else {
      // 如果没有分类，创建默认分类
      config.categories = {
        '自选': { codes: [], title: '自选', color: '#1976d2', isDefault: true },
        '持仓': { codes: [], title: '持仓', color: '#2e7d32', isHoldings: true },
      };
    }
  } else {
    // 没有配置，使用默认配置
    console.log('IndexedDB 中没有配置，使用默认配置初始化');
    config = getDefaultConfig();
    // 确保默认配置有 update_interval
    if (!config.update_interval) {
      config.update_interval = 1000;
    }
    // 保存默认配置到 IndexedDB
    await saveConfig(config);
  }

  // 从 IndexedDB 加载自选表数据
  const watchlistItems = await loadAllWatchlistItems();
  
  // 从 IndexedDB 加载交易数据
  const holdingsTransactions = await loadAllHoldingsTransactions();
  // 不再从 historical_holdings 表加载，因为历史持仓现在通过 watchlist 和 transactions 表管理

  // 重建 holdings 和 watchlist
  config.holdings = {};
  config.watchlist = {};
  
  // 处理所有自选股
  const now = new Date();
  const currentTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  for (const [code, watchlistItem] of Object.entries(watchlistItems)) {
    const transactions = holdingsTransactions[code] || [];
    const validTransactions = Array.isArray(transactions) ? transactions : [];
    
    // 如果老数据没有add_time，初始化为当前时间
    const addTime = watchlistItem.add_time || currentTimeStr;
    
    // 从 alert_up 和 alert_down 构建 alerts 数组
    let alerts: Array<{ type: 'up' | 'down'; price: number }> | undefined = undefined;
    if (watchlistItem.alert_up !== null && watchlistItem.alert_up !== undefined) {
      alerts = alerts || [];
      alerts.push({ type: 'up', price: watchlistItem.alert_up });
    }
    if (watchlistItem.alert_down !== null && watchlistItem.alert_down !== undefined) {
      alerts = alerts || [];
      alerts.push({ type: 'down', price: watchlistItem.alert_down });
    }
    
    if (validTransactions.length > 0) {
      // 有交易记录，是持仓
      config.holdings[code] = {
        transactions: validTransactions,
        alerts: alerts && alerts.length > 0 ? alerts : undefined,
        // 向后兼容
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
      };
    } else {
      // 没有交易记录，是自选
      config.watchlist[code] = {
        alerts: alerts && alerts.length > 0 ? alerts : undefined,
        add_time: addTime,
        // 向后兼容
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
      };
    }
    
    // 如果老数据没有add_time，更新到数据库
    if (!watchlistItem.add_time) {
      await saveWatchlistItem({
        ...watchlistItem,
        add_time: currentTimeStr,
      });
    }
  }

  // 历史持仓现在通过 watchlist 和 transactions 表管理，不再需要单独的 historical_holdings 数组
  config.historical_holdings = [];

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
      update_interval: configData.update_interval ?? 1000, // 默认1秒
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
  // 不再从 historical_holdings 表加载，因为历史持仓现在通过 watchlist 和 transactions 表管理

  // 重建 holdings 和 watchlist
  config.holdings = {};
  config.watchlist = {};
  
  // 处理所有自选股
  const now = new Date();
  const currentTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  for (const [code, watchlistItem] of Object.entries(watchlistItems)) {
    const transactions = holdingsTransactions[code] || [];
    const validTransactions = Array.isArray(transactions) ? transactions : [];
    
    // 如果老数据没有add_time，初始化为当前时间
    const addTime = watchlistItem.add_time || currentTimeStr;
    
    // 从 alert_up 和 alert_down 构建 alerts 数组
    let alerts: Array<{ type: 'up' | 'down'; price: number }> | undefined = undefined;
    if (watchlistItem.alert_up !== null && watchlistItem.alert_up !== undefined) {
      alerts = alerts || [];
      alerts.push({ type: 'up', price: watchlistItem.alert_up });
    }
    if (watchlistItem.alert_down !== null && watchlistItem.alert_down !== undefined) {
      alerts = alerts || [];
      alerts.push({ type: 'down', price: watchlistItem.alert_down });
    }
    
    if (validTransactions.length > 0) {
      // 有交易记录，是持仓
      config.holdings[code] = {
        transactions: validTransactions,
        alerts: alerts && alerts.length > 0 ? alerts : undefined,
        // 向后兼容
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
      };
    } else {
      // 没有交易记录，是自选
      config.watchlist[code] = {
        alerts: alerts && alerts.length > 0 ? alerts : undefined,
        add_time: addTime,
        // 向后兼容
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
      };
    }
    
    // 如果老数据没有add_time，更新到数据库
    if (!watchlistItem.add_time) {
      await saveWatchlistItem({
        ...watchlistItem,
        add_time: currentTimeStr,
      });
    }
  }

  // 历史持仓现在通过 watchlist 和 transactions 表管理，不再需要单独的 historical_holdings 数组
  config.historical_holdings = [];

  return config;
}

/**
 * 保存持仓配置（所有数据保存到 IndexedDB）
 */
export async function saveHoldingsConfig(config: HoldingsConfig): Promise<HoldingsConfig> {
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
        // 先尝试从数据库加载已有的add_time，如果没有则使用当前时间
        const existingItem = await loadWatchlistItem(code);
        let addTime = existingItem?.add_time || new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        // 如果有交易记录，找到最早的交易时间，与 add_time 比较，取更早的一个
        if (holding.transactions && holding.transactions.length > 0) {
          // 找到最早的交易时间
          const transactionTimes = holding.transactions.map(t => t.time).filter(t => t);
          if (transactionTimes.length > 0) {
            // 将时间字符串转换为 Date 对象进行比较
            const transactionDates = transactionTimes.map(t => new Date(t.replace(' ', 'T')));
            const earliestTransactionTime = new Date(Math.min(...transactionDates.map(d => d.getTime())));
            const addTimeDate = new Date(addTime.replace(' ', 'T'));
            
            // 取更早的时间
            if (earliestTransactionTime < addTimeDate) {
              // 将 Date 对象转换回字符串格式
              const year = earliestTransactionTime.getFullYear();
              const month = String(earliestTransactionTime.getMonth() + 1).padStart(2, '0');
              const day = String(earliestTransactionTime.getDate()).padStart(2, '0');
              const hours = String(earliestTransactionTime.getHours()).padStart(2, '0');
              const minutes = String(earliestTransactionTime.getMinutes()).padStart(2, '0');
              const seconds = String(earliestTransactionTime.getSeconds()).padStart(2, '0');
              addTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            }
          }
        }
        
        // 从 alerts 数组提取 alert_up 和 alert_down（向后兼容）
        let alertUp: number | null = holding.alert_up ?? null;
        let alertDown: number | null = holding.alert_down ?? null;
        if (holding.alerts && holding.alerts.length > 0) {
          // 从 alerts 数组提取
          const upAlert = holding.alerts.find(a => a.type === 'up');
          const downAlert = holding.alerts.find(a => a.type === 'down');
          alertUp = upAlert ? upAlert.price : null;
          alertDown = downAlert ? downAlert.price : null;
        }
        
        await saveWatchlistItem({
          code,
          name: code, // 名称可以从实时数据更新
          alert_up: alertUp,
          alert_down: alertDown,
          add_time: addTime, // 使用交易时间和添加时间中更早的一个
        });
        
        // 保存交易记录
        if (holding.transactions && holding.transactions.length > 0) {
          // 检查交易记录是否有 ID，如果没有，说明可能是从 config 中加载的，需要从 IndexedDB 重新加载
          const hasAllIds = holding.transactions.every(t => t.id !== undefined);
          if (!hasAllIds) {
            // 从 IndexedDB 重新加载交易记录以确保有 ID
            const dbTransactions = await loadHoldingsTransactions(code);
            if (dbTransactions.length === holding.transactions.length) {
              // 数量匹配，使用数据库中的交易记录（有 ID）
              await saveHoldingsTransactions(code, dbTransactions);
            } else {
              // 数量不匹配，使用传入的交易记录（可能是新增或修改的）
              await saveHoldingsTransactions(code, holding.transactions);
            }
          } else {
            // 所有交易都有 ID，直接保存
            await saveHoldingsTransactions(code, holding.transactions);
          }
        } else {
          await deleteHoldingsTransactions(code);
        }
      } else if (watchlistItem) {
        // 是自选，保存到 watchlist 表
        // 从 alerts 数组提取 alert_up 和 alert_down（向后兼容）
        let alertUp: number | null = watchlistItem.alert_up ?? null;
        let alertDown: number | null = watchlistItem.alert_down ?? null;
        if (watchlistItem.alerts && watchlistItem.alerts.length > 0) {
          // 从 alerts 数组提取
          const upAlert = watchlistItem.alerts.find(a => a.type === 'up');
          const downAlert = watchlistItem.alerts.find(a => a.type === 'down');
          alertUp = upAlert ? upAlert.price : null;
          alertDown = downAlert ? downAlert.price : null;
        }
        
        await saveWatchlistItem({
          code,
          name: code,
          alert_up: alertUp,
          alert_down: alertDown,
          add_time: watchlistItem.add_time, // 保存添加时间
        });
      }
    }
    
    // 2. 删除不在配置中的自选股（但保留交易记录）
    const watchlistItems = await loadAllWatchlistItems();
    const allTransactionsForDelete = await loadAllHoldingsTransactions();
    
    for (const code of Object.keys(watchlistItems)) {
      if (!allCodes.has(code)) {
        // 检查是否有交易记录，如果有则保留在 watchlist 中（作为历史持仓）
        if (!allTransactionsForDelete[code] || allTransactionsForDelete[code].length === 0) {
          // 没有交易记录，可以删除
          await deleteWatchlistItem(code);
        }
        // 有交易记录，保留在 watchlist 中（作为历史持仓）
      }
    }

    // 3. 历史持仓现在通过 watchlist 和 transactions 表管理，不需要单独保存
    // 当删除股票但选择不退回交易时，交易记录保留在 transactions 表中，股票保留在 watchlist 表中
    // 这样在加载时，有交易记录但不在 holdings 中的股票就是历史持仓

    // 4. 保存配置到 IndexedDB（不包含交易数据和自选数据）
    await saveConfig(config);
    
    // 5. 重新加载所有交易记录，确保新添加的交易有ID，并更新配置
    const allTransactions = await loadAllHoldingsTransactions();
    const updatedConfig = { ...config };
    for (const code of Object.keys(updatedConfig.holdings || {})) {
      if (allTransactions[code] && allTransactions[code].length > 0) {
        // 更新配置中的交易记录，确保它们都有ID
        updatedConfig.holdings[code] = {
          ...updatedConfig.holdings[code],
          transactions: allTransactions[code],
        };
      }
    }
    
    return updatedConfig;
  } catch (error) {
    console.error('保存配置失败:', error);
    return config; // 出错时返回原配置
  }
  
  // 返回更新后的配置（包含交易ID）
  return config;
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

/**
 * 重置所有数据到默认配置
 */
export async function resetToDefaultConfig(): Promise<HoldingsConfig> {
  try {
    // 1. 清空所有 IndexedDB 数据
    await clearAllData();
    
    // 2. 获取默认配置
    const defaultConfig = getDefaultConfig();
    
    // 3. 保存默认配置到 IndexedDB
    // 保存 watchlist
    const now = new Date();
    const currentTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    for (const [code, watchlistItem] of Object.entries(defaultConfig.watchlist || {})) {
      await saveWatchlistItem({
        code,
        name: code,
        alert_up: watchlistItem.alert_up,
        alert_down: watchlistItem.alert_down,
        add_time: watchlistItem.add_time || currentTimeStr, // 如果没有添加时间，使用当前时间
      });
    }
    
    // 保存 holdings 和交易记录
    for (const [code, holding] of Object.entries(defaultConfig.holdings || {})) {
      await saveWatchlistItem({
        code,
        name: code,
        alert_up: holding.alert_up,
        alert_down: holding.alert_down,
        add_time: currentTimeStr, // 重置时使用当前时间
      });
      
      // 保存交易记录
      if (holding.transactions && holding.transactions.length > 0) {
        for (const transaction of holding.transactions) {
          await addTransaction({
            code,
            time: transaction.time,
            quantity: transaction.quantity,
            price: transaction.price,
          }, `resetToDefaultConfig-${code}`);
        }
      }
    }
    
    // 保存主配置（清空 holdings 和 watchlist，因为它们应该从 watchlist 表和 transactions 表重建）
    const configToSave = {
      ...defaultConfig,
      holdings: {}, // 重置时清空，从 watchlist 表和 transactions 表重建
      watchlist: {}, // 重置时清空，从 watchlist 表重建
    };
    await saveConfig(configToSave);
    
    // 返回的配置也应该清空 holdings 和 watchlist
    return {
      ...defaultConfig,
      holdings: {}, // 重置时清空，从 watchlist 表和 transactions 表重建
      watchlist: {}, // 重置时清空，从 watchlist 表重建
    };
  } catch (error) {
    console.error('重置数据失败:', error);
    throw error;
  }
}
