// 交易记录
export interface Transaction {
  id?: number; // 数据库自增ID
  time: string;
  quantity: number;
  price: number;
}

// 报警规则
export interface AlertRule {
  type: 'up' | 'down'; // 上涨或下跌
  price: number; // 报警价格
}

// 持仓配置（有交易记录的股票）
export interface HoldingConfig {
  transactions: Transaction[];
  alerts?: AlertRule[]; // 报警规则数组
  // 向后兼容：保留旧的字段
  alert_up?: number | null;
  alert_down?: number | null;
}

// 自选股配置（仅监控，无持仓）
export interface WatchlistConfig {
  alerts?: AlertRule[]; // 报警规则数组
  // 向后兼容：保留旧的字段
  alert_up?: number | null;
  alert_down?: number | null;
}

// 历史交易数据（已删除但保留交易的股票）
export interface HistoricalHolding {
  code: string;
  name: string;
  transactions: Transaction[];
}

// 持仓配置
export interface HoldingsConfig {
  privacy_mode: boolean;
  update_interval?: number; // 更新频率（毫秒），默认1000ms
  funds: {
    available_funds: number;
    total_original_funds: number;
  };
  market_hours: {
    [market: string]: {
      enabled: boolean;
      morning: {
        start: string;
        end: string;
      } | null;
      afternoon: {
        start: string;
        end: string;
      } | null;
      weekdays: number[];
    };
  };
  holdings: {
    [code: string]: HoldingConfig;
  };
  watchlist: {
    [code: string]: WatchlistConfig;
  };
  historical_holdings?: HistoricalHolding[]; // 历史交易数据
}

// 股票状态
export interface StockState {
  code: string;
  name: string;
  last_price: number | null;
  last_time: Date | null;
  last_update_time: string;
  last_change_pct: number;
  holding_price: number | null;
  holding_quantity: number;
  transactions: Transaction[];
  alerts?: AlertRule[]; // 报警规则数组
  // 向后兼容：保留旧的字段
  alert_up?: number | null;
  alert_down?: number | null;
  alert_triggered?: Set<string>; // 已触发的报警规则ID集合（使用 type-price 作为key）
}

// 股票实时数据
export interface StockRealtimeData {
  price: number;
  name: string;
  yesterday_close: number;
  update_time: string;
}
