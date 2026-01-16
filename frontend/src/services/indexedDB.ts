import { Transaction, HistoricalHolding, HoldingsConfig } from '../types';

// 自选表项
export interface WatchlistItem {
  code: string;
  name: string;
  alert_up: number | null;
  alert_down: number | null;
}

// 交易表项
export interface TransactionItem {
  id?: number;
  code: string;
  time: string;
  quantity: number;
  price: number;
}

const DB_NAME = 'stocks_db';
const DB_VERSION = 4; // 新版本，移除所有迁移逻辑，直接创建新结构

// 对象存储名称
const STORE_WATCHLIST = 'watchlist'; // 自选表
const STORE_TRANSACTIONS = 'transactions'; // 交易表
const STORE_CONFIG = 'config';
const STORE_HISTORY = 'history';

// 数据库实例缓存
let dbInstance: IDBDatabase | null = null;

/**
 * 打开 IndexedDB 数据库
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('打开 IndexedDB 失败'));
    };


    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion || 0;
      
      console.log(`IndexedDB 升级: 从版本 ${oldVersion} 到版本 ${DB_VERSION}`);

      // 如果是升级，删除旧的对象存储（如果存在）
      if (oldVersion > 0) {
        // 删除旧的表（如果存在）
        if (db.objectStoreNames.contains('holdings_transactions')) {
          db.deleteObjectStore('holdings_transactions');
        }
        if (db.objectStoreNames.contains('historical_holdings')) {
          db.deleteObjectStore('historical_holdings');
        }
      }

      // 创建自选表（watchlist）
      if (!db.objectStoreNames.contains(STORE_WATCHLIST)) {
        const watchlistStore = db.createObjectStore(STORE_WATCHLIST, { keyPath: 'code' });
        watchlistStore.createIndex('code', 'code', { unique: true });
      }

      // 创建交易表（transactions）
      if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
        const transactionsStore = db.createObjectStore(STORE_TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
        transactionsStore.createIndex('code', 'code', { unique: false });
      }

      // 创建配置存储
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        const configStore = db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
        configStore.createIndex('key', 'key', { unique: true });
      }

      // 创建历史数据存储
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const historyStore = db.createObjectStore(STORE_HISTORY, { keyPath: 'date' });
        historyStore.createIndex('date', 'date', { unique: true });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
  });
}

// ========== 自选表操作 ==========

/**
 * 保存或更新自选股
 */
export async function saveWatchlistItem(item: WatchlistItem): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_WATCHLIST], 'readwrite');
    const store = transaction.objectStore(STORE_WATCHLIST);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('保存自选股失败'));
    });
  } catch (error) {
    console.error('保存自选股失败:', error);
    throw error;
  }
}

/**
 * 加载自选股
 */
export async function loadWatchlistItem(code: string): Promise<WatchlistItem | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_WATCHLIST], 'readonly');
    const store = transaction.objectStore(STORE_WATCHLIST);
    
    return new Promise<WatchlistItem | null>((resolve, reject) => {
      const request = store.get(code);
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(new Error('加载自选股失败'));
    });
  } catch (error) {
    console.error('加载自选股失败:', error);
    return null;
  }
}

/**
 * 加载所有自选股
 */
export async function loadAllWatchlistItems(): Promise<{ [code: string]: WatchlistItem }> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_WATCHLIST], 'readonly');
    const store = transaction.objectStore(STORE_WATCHLIST);
    
    return new Promise<{ [code: string]: WatchlistItem }>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const result: { [code: string]: WatchlistItem } = {};
        request.result.forEach((item: WatchlistItem) => {
          result[item.code] = item;
        });
        resolve(result);
      };
      request.onerror = () => reject(new Error('加载所有自选股失败'));
    });
  } catch (error) {
    console.error('加载所有自选股失败:', error);
    return {};
  }
}

/**
 * 删除自选股
 */
export async function deleteWatchlistItem(code: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_WATCHLIST], 'readwrite');
    const store = transaction.objectStore(STORE_WATCHLIST);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(code);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('删除自选股失败'));
    });
  } catch (error) {
    console.error('删除自选股失败:', error);
    throw error;
  }
}

// ========== 交易表操作 ==========

/**
 * 添加交易记录
 */
export async function addTransaction(transaction: TransactionItem, source?: string): Promise<number> {
  try {
    const db = await openDB();
    const transactionObj = db.transaction([STORE_TRANSACTIONS], 'readwrite');
    const store = transactionObj.objectStore(STORE_TRANSACTIONS);
    
    // 添加详细日志
    const stackTrace = new Error().stack;
    const callerInfo = source || 'unknown';
    console.log('🔵 [添加交易记录]', {
      source: callerInfo,
      code: transaction.code,
      time: transaction.time,
      quantity: transaction.quantity,
      price: transaction.price,
      stack: stackTrace?.split('\n').slice(1, 5).join('\n'), // 只显示前几行堆栈
    });
    
    return new Promise<number>((resolve, reject) => {
      const request = store.add(transaction);
      request.onsuccess = () => {
        const newId = request.result as number;
        console.log('✅ [交易记录已添加]', {
          source: callerInfo,
          id: newId,
          code: transaction.code,
          time: transaction.time,
        });
        resolve(newId);
      };
      request.onerror = () => reject(new Error('添加交易记录失败'));
    });
  } catch (error) {
    console.error('❌ [添加交易记录失败]', {
      source: source || 'unknown',
      error,
      transaction,
    });
    throw error;
  }
}

/**
 * 更新交易记录
 */
export async function updateTransaction(id: number, transaction: TransactionItem): Promise<void> {
  try {
    const db = await openDB();
    const transactionObj = db.transaction([STORE_TRANSACTIONS], 'readwrite');
    const store = transactionObj.objectStore(STORE_TRANSACTIONS);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ ...transaction, id });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('更新交易记录失败'));
    });
  } catch (error) {
    console.error('更新交易记录失败:', error);
    throw error;
  }
}

/**
 * 删除交易记录
 */
export async function deleteTransaction(id: number): Promise<void> {
  try {
    const db = await openDB();
    const transactionObj = db.transaction([STORE_TRANSACTIONS], 'readwrite');
    const store = transactionObj.objectStore(STORE_TRANSACTIONS);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('删除交易记录失败'));
    });
  } catch (error) {
    console.error('删除交易记录失败:', error);
    throw error;
  }
}

/**
 * 根据股票代码加载交易记录
 */
export async function loadTransactionsByCode(code: string): Promise<TransactionItem[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_TRANSACTIONS], 'readonly');
    const store = transaction.objectStore(STORE_TRANSACTIONS);
    const index = store.index('code');
    
    return new Promise<TransactionItem[]>((resolve, reject) => {
      const request = index.getAll(code);
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => reject(new Error('加载交易记录失败'));
    });
  } catch (error) {
    console.error('加载交易记录失败:', error);
    return [];
  }
}

/**
 * 加载所有交易记录（按股票代码分组）
 */
export async function loadAllTransactions(): Promise<{ [code: string]: TransactionItem[] }> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_TRANSACTIONS], 'readonly');
    const store = transaction.objectStore(STORE_TRANSACTIONS);
    
    return new Promise<{ [code: string]: TransactionItem[] }>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const result: { [code: string]: TransactionItem[] } = {};
        request.result.forEach((item: TransactionItem) => {
          if (!result[item.code]) {
            result[item.code] = [];
          }
          result[item.code].push(item);
        });
        resolve(result);
      };
      request.onerror = () => reject(new Error('加载所有交易记录失败'));
    });
  } catch (error) {
    console.error('加载所有交易记录失败:', error);
    return {};
  }
}

/**
 * 清空所有数据（用于重置）
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await openDB();
    
    // 清空 watchlist
    const watchlistTransaction = db.transaction([STORE_WATCHLIST], 'readwrite');
    const watchlistStore = watchlistTransaction.objectStore(STORE_WATCHLIST);
    await new Promise<void>((resolve, reject) => {
      const request = watchlistStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('清空 watchlist 失败'));
    });
    
    // 清空 transactions
    const transactionsTransaction = db.transaction([STORE_TRANSACTIONS], 'readwrite');
    const transactionsStore = transactionsTransaction.objectStore(STORE_TRANSACTIONS);
    await new Promise<void>((resolve, reject) => {
      const request = transactionsStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('清空 transactions 失败'));
    });
    
    // 清空 config
    const configTransaction = db.transaction([STORE_CONFIG], 'readwrite');
    const configStore = configTransaction.objectStore(STORE_CONFIG);
    await new Promise<void>((resolve, reject) => {
      const request = configStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('清空 config 失败'));
    });
    
    // 清空 history（可选，根据需求决定是否清空历史数据）
    const historyTransaction = db.transaction([STORE_HISTORY], 'readwrite');
    const historyStore = historyTransaction.objectStore(STORE_HISTORY);
    await new Promise<void>((resolve, reject) => {
      const request = historyStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('清空 history 失败'));
    });
  } catch (error) {
    console.error('清空所有数据失败:', error);
    throw error;
  }
}

/**
 * 删除某个股票的所有交易记录
 */
export async function deleteTransactionsByCode(code: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_TRANSACTIONS], 'readwrite');
    const store = transaction.objectStore(STORE_TRANSACTIONS);
    const index = store.index('code');
    
    return new Promise<void>((resolve, reject) => {
      const request = index.openKeyCursor(IDBKeyRange.only(code));
      const keysToDelete: IDBValidKey[] = [];
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          keysToDelete.push(cursor.primaryKey);
          cursor.continue();
        } else {
          // 删除所有找到的记录
          const deletePromises = keysToDelete.map((key) => {
            return new Promise<void>((resolveDelete, rejectDelete) => {
              const deleteRequest = store.delete(key);
              deleteRequest.onsuccess = () => resolveDelete();
              deleteRequest.onerror = () => rejectDelete();
            });
          });
          
          Promise.all(deletePromises).then(() => resolve()).catch(reject);
        }
      };
      
      request.onerror = () => reject(new Error('删除交易记录失败'));
    });
  } catch (error) {
    console.error('删除交易记录失败:', error);
    throw error;
  }
}

// ========== 持仓交易记录操作函数 ==========

/**
 * 保存持仓交易记录
 */
export async function saveHoldingsTransactions(
  code: string,
  transactions: Transaction[]
): Promise<void> {
  // 获取该股票现有的交易记录（保留ID）
  const existingTransactions = await loadTransactionsByCode(code);
  
  const existingIds = new Set(existingTransactions.map(t => t.id).filter(id => id !== undefined));
  
  // 删除不在新交易列表中的记录
  // 注意：只删除那些明确不在新列表中的记录（通过 ID 匹配或精确匹配 time+quantity+price）
  for (const existing of existingTransactions) {
    if (existing.id) {
      // 检查是否在新交易列表中
      const found = transactions.some(t => {
        // 通过 ID 匹配
        if (t.id === existing.id) return true;
        // 通过 time+quantity+price 精确匹配（允许小的浮点误差）
        const timeMatch = t.time === existing.time;
        const quantityMatch = Math.abs(t.quantity - existing.quantity) < 0.0001;
        const priceMatch = Math.abs(t.price - existing.price) < 0.0001;
        return timeMatch && quantityMatch && priceMatch;
      });
      if (!found) {
        await deleteTransaction(existing.id);
      }
    }
  }
  
  // 添加或更新交易记录
  for (const transaction of transactions) {
    const transactionItem: TransactionItem = {
      code,
      time: transaction.time,
      quantity: transaction.quantity,
      price: transaction.price,
    };
    
    // 如果交易有ID且ID存在，更新记录
    if (transaction.id && existingIds.has(transaction.id)) {
      await updateTransaction(transaction.id, transactionItem);
    } else {
      // 尝试通过 time+quantity+price 匹配现有记录
      // 注意：由于浮点数精度问题，需要比较时使用容差
      let matchedId: number | undefined = undefined;
      for (const existing of existingTransactions) {
        if (existing.id) {
          // 比较时间、数量和价格（价格和数量允许小的浮点误差）
          const timeMatch = existing.time === transaction.time;
          const quantityMatch = Math.abs(existing.quantity - transaction.quantity) < 0.0001;
          const priceMatch = Math.abs(existing.price - transaction.price) < 0.0001;
          if (timeMatch && quantityMatch && priceMatch) {
            matchedId = existing.id;
            break;
          }
        }
      }
      
      if (matchedId) {
        // 找到了匹配的记录，更新它（但只有在数据真正变化时才更新）
        const existing = existingTransactions.find(t => t.id === matchedId);
        if (existing) {
          // 检查数据是否真的需要更新
          const needsUpdate = 
            existing.time !== transactionItem.time ||
            Math.abs(existing.quantity - transactionItem.quantity) >= 0.0001 ||
            Math.abs(existing.price - transactionItem.price) >= 0.0001;
          if (needsUpdate) {
            await updateTransaction(matchedId, transactionItem);
          }
          // 如果数据没有变化，跳过更新
        }
      } else {
        // 没有匹配的记录，添加新记录
        const newId = await addTransaction(transactionItem, `saveHoldingsTransactions-${code}`);
        // 注意：新添加的交易ID会在下次加载时自动包含
      }
    }
  }
}

/**
 * 加载持仓交易记录
 */
export async function loadHoldingsTransactions(code: string): Promise<Transaction[]> {
  const items = await loadTransactionsByCode(code);
  return items.map(item => ({
    id: item.id,
    time: item.time,
    quantity: item.quantity,
    price: item.price,
  }));
}

/**
 * 加载所有持仓交易记录
 */
export async function loadAllHoldingsTransactions(): Promise<{ [code: string]: Transaction[] }> {
  const allTransactions = await loadAllTransactions();
  const result: { [code: string]: Transaction[] } = {};
  
  for (const [code, items] of Object.entries(allTransactions)) {
    result[code] = items.map(item => ({
      id: item.id,
      time: item.time,
      quantity: item.quantity,
      price: item.price,
    }));
  }
  
  return result;
}

/**
 * 删除持仓交易记录
 */
export async function deleteHoldingsTransactions(code: string): Promise<void> {
  await deleteTransactionsByCode(code);
}

/**
 * 保存历史持仓（兼容函数，现在通过 watchlist 和 transactions 表实现）
 */
export async function saveHistoricalHoldings(historicalHoldings: HistoricalHolding[]): Promise<void> {
  // 历史持仓现在通过 watchlist 表存储，交易记录在 transactions 表中
  // 这个函数保留用于兼容，但实际不需要单独存储历史持仓
  // 历史持仓就是 watchlist 中存在但不在当前持仓中的股票
}

/**
 * 加载所有历史持仓
 */
export async function loadHistoricalHoldings(): Promise<HistoricalHolding[]> {
  // 历史持仓现在通过 watchlist 和 transactions 表实现
  // 返回空数组，因为历史持仓的概念已经改变
  return [];
}

/**
 * 保存配置数据
 */
export async function saveConfig(config: HoldingsConfig): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_CONFIG], 'readwrite');
    const store = transaction.objectStore(STORE_CONFIG);
    
    // 保存配置（不包含交易数据）
    const configToSave = {
      key: 'main',
      privacy_mode: config.privacy_mode,
      update_interval: config.update_interval,
      funds: config.funds,
      market_hours: config.market_hours,
      holdings: Object.fromEntries(
        Object.entries(config.holdings).map(([code, holding]) => [
          code,
          {
            alert_up: holding.alert_up,
            alert_down: holding.alert_down,
          },
        ])
      ),
      watchlist: config.watchlist,
    };
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(configToSave);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('保存配置失败'));
    });
  } catch (error) {
    console.error('保存配置失败:', error);
    throw error;
  }
}

/**
 * 加载配置数据
 */
export async function loadConfig(): Promise<Partial<HoldingsConfig> | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_CONFIG], 'readonly');
    const store = transaction.objectStore(STORE_CONFIG);
    
    return new Promise<Partial<HoldingsConfig> | null>((resolve, reject) => {
      const request = store.get('main');
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          resolve({
            privacy_mode: result.privacy_mode,
            update_interval: result.update_interval,
            funds: result.funds,
            market_hours: result.market_hours,
            holdings: result.holdings,
            watchlist: result.watchlist,
          });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(new Error('加载配置失败'));
    });
  } catch (error) {
    console.error('加载配置失败:', error);
    return null;
  }
}

/**
 * 保存历史数据
 */
export async function saveHistoryData(date: string, data: any): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HISTORY], 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ date, data });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('保存历史数据失败'));
    });
  } catch (error) {
    console.error('保存历史数据失败:', error);
    throw error;
  }
}

/**
 * 加载历史数据
 */
export async function loadHistoryData(date: string): Promise<any | null> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HISTORY], 'readonly');
    const store = transaction.objectStore(STORE_HISTORY);
    
    return new Promise<any | null>((resolve, reject) => {
      const request = store.get(date);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(new Error('加载历史数据失败'));
    });
  } catch (error) {
    console.error('加载历史数据失败:', error);
    return null;
  }
}

// 历史数据永久保存，不再提供清理功能
