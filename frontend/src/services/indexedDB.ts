import { Transaction, HistoricalHolding, HoldingsConfig } from '../types';

const DB_NAME = 'stocks_db';
const DB_VERSION = 2; // 升级版本号

// 对象存储名称
const STORE_HOLDINGS_TRANSACTIONS = 'holdings_transactions';
const STORE_HISTORICAL_HOLDINGS = 'historical_holdings';
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

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion || 0;

      // 创建持仓交易记录存储
      if (!db.objectStoreNames.contains(STORE_HOLDINGS_TRANSACTIONS)) {
        const holdingsStore = db.createObjectStore(STORE_HOLDINGS_TRANSACTIONS, { keyPath: 'code' });
        holdingsStore.createIndex('code', 'code', { unique: true });
      }

      // 创建历史持仓存储
      if (!db.objectStoreNames.contains(STORE_HISTORICAL_HOLDINGS)) {
        const historicalStore = db.createObjectStore(STORE_HISTORICAL_HOLDINGS, { keyPath: 'id', autoIncrement: true });
        historicalStore.createIndex('code', 'code', { unique: false });
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
  });
}

/**
 * 保存持仓交易记录
 */
export async function saveHoldingsTransactions(
  code: string,
  transactions: Transaction[]
): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HOLDINGS_TRANSACTIONS], 'readwrite');
    const store = transaction.objectStore(STORE_HOLDINGS_TRANSACTIONS);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put({ code, transactions });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('保存持仓交易记录失败'));
    });
  } catch (error) {
    console.error('保存持仓交易记录失败:', error);
    throw error;
  }
}

/**
 * 加载持仓交易记录
 */
export async function loadHoldingsTransactions(code: string): Promise<Transaction[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HOLDINGS_TRANSACTIONS], 'readonly');
    const store = transaction.objectStore(STORE_HOLDINGS_TRANSACTIONS);
    
    return new Promise<Transaction[]>((resolve, reject) => {
      const request = store.get(code);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.transactions : []);
      };
      request.onerror = () => reject(new Error('加载持仓交易记录失败'));
    });
  } catch (error) {
    console.error('加载持仓交易记录失败:', error);
    return [];
  }
}

/**
 * 加载所有持仓交易记录
 */
export async function loadAllHoldingsTransactions(): Promise<{ [code: string]: Transaction[] }> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HOLDINGS_TRANSACTIONS], 'readonly');
    const store = transaction.objectStore(STORE_HOLDINGS_TRANSACTIONS);
    
    return new Promise<{ [code: string]: Transaction[] }>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const result: { [code: string]: Transaction[] } = {};
        request.result.forEach((item: { code: string; transactions: Transaction[] }) => {
          result[item.code] = item.transactions;
        });
        resolve(result);
      };
      request.onerror = () => reject(new Error('加载所有持仓交易记录失败'));
    });
  } catch (error) {
    console.error('加载所有持仓交易记录失败:', error);
    return {};
  }
}

/**
 * 删除持仓交易记录
 */
export async function deleteHoldingsTransactions(code: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HOLDINGS_TRANSACTIONS], 'readwrite');
    const store = transaction.objectStore(STORE_HOLDINGS_TRANSACTIONS);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(code);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('删除持仓交易记录失败'));
    });
  } catch (error) {
    console.error('删除持仓交易记录失败:', error);
    throw error;
  }
}

/**
 * 保存历史持仓
 */
export async function saveHistoricalHoldings(historicalHoldings: HistoricalHolding[]): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HISTORICAL_HOLDINGS], 'readwrite');
    const store = transaction.objectStore(STORE_HISTORICAL_HOLDINGS);
    
    // 先清空所有历史持仓
    await new Promise<void>((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = () => resolve();
      clearRequest.onerror = () => reject(new Error('清空历史持仓失败'));
    });
    
    // 然后保存新的历史持仓
    for (const historical of historicalHoldings) {
      await new Promise<void>((resolve, reject) => {
        const request = store.add(historical);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('保存历史持仓失败'));
      });
    }
  } catch (error) {
    console.error('保存历史持仓失败:', error);
    throw error;
  }
}

/**
 * 加载所有历史持仓
 */
export async function loadHistoricalHoldings(): Promise<HistoricalHolding[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HISTORICAL_HOLDINGS], 'readonly');
    const store = transaction.objectStore(STORE_HISTORICAL_HOLDINGS);
    
    return new Promise<HistoricalHolding[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const result: HistoricalHolding[] = request.result.map((item: any) => ({
          code: item.code,
          name: item.name,
          transactions: item.transactions,
        }));
        resolve(result);
      };
      request.onerror = () => reject(new Error('加载历史持仓失败'));
    });
  } catch (error) {
    console.error('加载历史持仓失败:', error);
    return [];
  }
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

/**
 * 清理超过指定天数的历史数据
 */
export async function cleanupOldHistoryData(keepDays: number = 30): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_HISTORY], 'readwrite');
    const store = transaction.objectStore(STORE_HISTORY);
    const index = store.index('date');
    
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    return new Promise<void>((resolve, reject) => {
      const request = index.openCursor();
      const keysToDelete: string[] = [];
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const date = cursor.key as string;
          if (date < cutoffDateStr) {
            keysToDelete.push(date);
          }
          cursor.continue();
        } else {
          // 删除所有过期的数据
          const deletePromises = keysToDelete.map((date) => {
            return new Promise<void>((resolveDelete, rejectDelete) => {
              const deleteRequest = store.delete(date);
              deleteRequest.onsuccess = () => resolveDelete();
              deleteRequest.onerror = () => rejectDelete();
            });
          });
          
          Promise.all(deletePromises).then(() => {
            if (keysToDelete.length > 0) {
              console.log(`已清理 ${keysToDelete.length} 条超过 ${keepDays} 天的历史数据`);
            }
            resolve();
          }).catch(reject);
        }
      };
      
      request.onerror = () => reject(new Error('清理历史数据失败'));
    });
  } catch (error) {
    console.error('清理历史数据失败:', error);
  }
}
