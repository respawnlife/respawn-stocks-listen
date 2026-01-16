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
const DB_VERSION = 3; // 升级版本号到 3，重构为两张表结构

// 对象存储名称
const STORE_WATCHLIST = 'watchlist'; // 自选表
const STORE_TRANSACTIONS = 'transactions'; // 交易表
const STORE_CONFIG = 'config';
const STORE_HISTORY = 'history';

// 旧表名称（用于迁移）
const STORE_HOLDINGS_TRANSACTIONS = 'holdings_transactions';
const STORE_HISTORICAL_HOLDINGS = 'historical_holdings';

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

      // 版本 3：重构为两张表结构
      if (oldVersion < 3) {
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
      } else {
        // 确保新表存在（如果从其他版本升级）
        if (!db.objectStoreNames.contains(STORE_WATCHLIST)) {
          const watchlistStore = db.createObjectStore(STORE_WATCHLIST, { keyPath: 'code' });
          watchlistStore.createIndex('code', 'code', { unique: true });
        }

        if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
          const transactionsStore = db.createObjectStore(STORE_TRANSACTIONS, { keyPath: 'id', autoIncrement: true });
          transactionsStore.createIndex('code', 'code', { unique: false });
        }
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
      const oldVersion = (request as any).oldVersion || 0;
      
      // 在数据库打开后执行迁移（异步）
      if (oldVersion < 3) {
        migrateFromOldStructure(dbInstance, oldVersion).catch((error) => {
          console.error('迁移数据失败:', error);
        });
      }
      
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
export async function addTransaction(transaction: TransactionItem): Promise<number> {
  try {
    const db = await openDB();
    const transactionObj = db.transaction([STORE_TRANSACTIONS], 'readwrite');
    const store = transactionObj.objectStore(STORE_TRANSACTIONS);
    
    return new Promise<number>((resolve, reject) => {
      const request = store.add(transaction);
      request.onsuccess = () => {
        resolve(request.result as number);
      };
      request.onerror = () => reject(new Error('添加交易记录失败'));
    });
  } catch (error) {
    console.error('添加交易记录失败:', error);
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

// ========== 兼容性函数（保持向后兼容） ==========

/**
 * 保存持仓交易记录（兼容函数）
 */
export async function saveHoldingsTransactions(
  code: string,
  transactions: Transaction[]
): Promise<void> {
  // 先删除该股票的所有交易记录
  await deleteTransactionsByCode(code);
  
  // 然后添加新的交易记录
  for (const transaction of transactions) {
    await addTransaction({
      code,
      time: transaction.time,
      quantity: transaction.quantity,
      price: transaction.price,
    });
  }
}

/**
 * 加载持仓交易记录（兼容函数）
 */
export async function loadHoldingsTransactions(code: string): Promise<Transaction[]> {
  const items = await loadTransactionsByCode(code);
  return items.map(item => ({
    time: item.time,
    quantity: item.quantity,
    price: item.price,
  }));
}

/**
 * 加载所有持仓交易记录（兼容函数）
 */
export async function loadAllHoldingsTransactions(): Promise<{ [code: string]: Transaction[] }> {
  const allTransactions = await loadAllTransactions();
  const result: { [code: string]: Transaction[] } = {};
  
  for (const [code, items] of Object.entries(allTransactions)) {
    result[code] = items.map(item => ({
      time: item.time,
      quantity: item.quantity,
      price: item.price,
    }));
  }
  
  return result;
}

/**
 * 删除持仓交易记录（兼容函数）
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
 * 加载所有历史持仓（兼容函数）
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

/**
 * 从旧结构迁移数据到新结构
 */
async function migrateFromOldStructure(db: IDBDatabase, oldVersion: number): Promise<void> {
  if (oldVersion < 3) {
    console.log('开始迁移数据从版本', oldVersion, '到版本 3');
    
    try {
      // 1. 迁移配置中的 holdings 和 watchlist 到 watchlist 表
      const configTransaction = db.transaction([STORE_CONFIG], 'readonly');
      const configStore = configTransaction.objectStore(STORE_CONFIG);
      const configRequest = configStore.get('main');
      
      await new Promise<void>((resolve, reject) => {
        configRequest.onsuccess = async () => {
          const config = configRequest.result;
          if (config) {
            const watchlistTransaction = db.transaction([STORE_WATCHLIST], 'readwrite');
            const watchlistStore = watchlistTransaction.objectStore(STORE_WATCHLIST);
            
            // 迁移 holdings 到 watchlist
            if (config.holdings) {
              for (const [code, holding] of Object.entries(config.holdings)) {
                await new Promise<void>((resolveWatchlist) => {
                  const request = watchlistStore.put({
                    code,
                    name: code,
                    alert_up: (holding as any).alert_up || null,
                    alert_down: (holding as any).alert_down || null,
                  });
                  request.onsuccess = () => resolveWatchlist();
                  request.onerror = () => resolveWatchlist(); // 忽略错误，继续
                });
              }
            }
            
            // 迁移 watchlist 到 watchlist 表（如果不存在）
            if (config.watchlist) {
              for (const [code, watchlistItem] of Object.entries(config.watchlist)) {
                // 检查是否已存在
                const existing = await new Promise<WatchlistItem | null>((resolve) => {
                  const request = watchlistStore.get(code);
                  request.onsuccess = () => resolve(request.result || null);
                  request.onerror = () => resolve(null);
                });
                
                if (!existing) {
                  await new Promise<void>((resolveWatchlist) => {
                    const request = watchlistStore.put({
                      code,
                      name: code,
                      alert_up: (watchlistItem as any).alert_up || null,
                      alert_down: (watchlistItem as any).alert_down || null,
                    });
                    request.onsuccess = () => resolveWatchlist();
                    request.onerror = () => resolveWatchlist();
                  });
                }
              }
            }
          }
          resolve();
        };
        configRequest.onerror = () => {
          console.warn('迁移配置数据失败，继续迁移其他数据');
          resolve();
        };
      });
      
      // 2. 迁移 holdings_transactions 到 transactions 表
      if (db.objectStoreNames.contains(STORE_HOLDINGS_TRANSACTIONS)) {
        const oldHoldingsTransaction = db.transaction([STORE_HOLDINGS_TRANSACTIONS], 'readonly');
        const oldHoldingsStore = oldHoldingsTransaction.objectStore(STORE_HOLDINGS_TRANSACTIONS);
        const oldHoldingsRequest = oldHoldingsStore.getAll();
        
        await new Promise<void>((resolve) => {
          oldHoldingsRequest.onsuccess = async () => {
            const transactionsTransaction = db.transaction([STORE_TRANSACTIONS], 'readwrite');
            const transactionsStore = transactionsTransaction.objectStore(STORE_TRANSACTIONS);
            
            for (const item of oldHoldingsRequest.result || []) {
              const code = item.code;
              const transactions = item.transactions || [];
              
              for (const transaction of transactions) {
                await new Promise<void>((resolveTrans) => {
                  const request = transactionsStore.add({
                    code,
                    time: transaction.time,
                    quantity: transaction.quantity,
                    price: transaction.price,
                  });
                  request.onsuccess = () => resolveTrans();
                  request.onerror = () => resolveTrans(); // 忽略错误
                });
              }
            }
            resolve();
          };
          oldHoldingsRequest.onerror = () => {
            console.warn('迁移持仓交易数据失败');
            resolve();
          };
        });
      }
      
      // 3. 迁移 historical_holdings 到 watchlist 和 transactions 表
      if (db.objectStoreNames.contains(STORE_HISTORICAL_HOLDINGS)) {
        const oldHistoricalTransaction = db.transaction([STORE_HISTORICAL_HOLDINGS], 'readonly');
        const oldHistoricalStore = oldHistoricalTransaction.objectStore(STORE_HISTORICAL_HOLDINGS);
        const oldHistoricalRequest = oldHistoricalStore.getAll();
        
        await new Promise<void>((resolve) => {
          oldHistoricalRequest.onsuccess = async () => {
            const watchlistTransaction = db.transaction([STORE_WATCHLIST], 'readwrite');
            const watchlistStore = watchlistTransaction.objectStore(STORE_WATCHLIST);
            const transactionsTransaction = db.transaction([STORE_TRANSACTIONS], 'readwrite');
            const transactionsStore = transactionsTransaction.objectStore(STORE_TRANSACTIONS);
            
            for (const item of oldHistoricalRequest.result || []) {
              const code = item.code;
              const name = item.name || code;
              const transactions = item.transactions || [];
              
              // 添加到 watchlist
              await new Promise<void>((resolveWatchlist) => {
                const request = watchlistStore.put({
                  code,
                  name,
                  alert_up: null,
                  alert_down: null,
                });
                request.onsuccess = () => resolveWatchlist();
                request.onerror = () => resolveWatchlist();
              });
              
              // 添加交易记录
              for (const transaction of transactions) {
                await new Promise<void>((resolveTrans) => {
                  const request = transactionsStore.add({
                    code,
                    time: transaction.time,
                    quantity: transaction.quantity,
                    price: transaction.price,
                  });
                  request.onsuccess = () => resolveTrans();
                  request.onerror = () => resolveTrans();
                });
              }
            }
            resolve();
          };
          oldHistoricalRequest.onerror = () => {
            console.warn('迁移历史持仓数据失败');
            resolve();
          };
        });
      }
      
      console.log('数据迁移完成');
    } catch (error) {
      console.error('迁移数据失败:', error);
      // 不抛出错误，允许继续使用新结构
    }
  }
}
