import { Transaction, HistoricalHolding } from '../types';

const DB_NAME = 'stocks_db';
const DB_VERSION = 1;

// 对象存储名称
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

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

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
 * 从 localStorage 迁移交易数据到 IndexedDB（一次性迁移）
 */
export async function migrateTransactionsFromLocalStorage(config: any): Promise<void> {
  try {
    // 检查是否已经迁移过
    const migrationKey = 'transactions_migrated_to_indexeddb';
    if (localStorage.getItem(migrationKey)) {
      return; // 已经迁移过
    }

    console.log('开始迁移交易数据到 IndexedDB...');

    // 迁移持仓交易记录
    if (config.holdings) {
      for (const [code, holding] of Object.entries(config.holdings)) {
        const holdingConfig = holding as any;
        if (holdingConfig.transactions && holdingConfig.transactions.length > 0) {
          await saveHoldingsTransactions(code, holdingConfig.transactions);
        }
      }
    }

    // 迁移历史持仓
    if (config.historical_holdings && config.historical_holdings.length > 0) {
      await saveHistoricalHoldings(config.historical_holdings);
    }

    // 标记已迁移
    localStorage.setItem(migrationKey, 'true');
    console.log('交易数据迁移完成');
  } catch (error) {
    console.error('迁移交易数据失败:', error);
  }
}
