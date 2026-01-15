import { HoldingsConfig } from '../types';
import { saveHoldingsConfig } from '../services/storage';

/**
 * 初始化配置（从 Python 配置文件导入或使用默认配置）
 */
export function initConfigFromPythonConfig(pythonConfig?: any): void {
  let config: HoldingsConfig;

  if (pythonConfig) {
    // 从 Python 配置转换
    config = {
      privacy_mode: pythonConfig.privacy_mode || false,
      funds: pythonConfig.funds || {
        available_funds: 0.0,
        total_original_funds: 0.0,
      },
      market_hours: pythonConfig.market_hours || {
        'A股': {
          enabled: true,
          morning: {
            start: '09:30',
            end: '11:30',
          },
          afternoon: {
            start: '13:00',
            end: '15:00',
          },
          weekdays: [1, 2, 3, 4, 5],
        },
        '美股': {
          enabled: false,
          morning: {
            start: '22:30',
            end: '05:00',
          },
          afternoon: null,
          weekdays: [1, 2, 3, 4, 5],
        },
      },
      stocks: pythonConfig.stocks || {},
    };
  } else {
    // 默认配置
    config = {
      privacy_mode: false,
      funds: {
        available_funds: 4348.13,
        total_original_funds: 10000.0,
      },
      market_hours: {
        'A股': {
          enabled: true,
          morning: {
            start: '09:30',
            end: '11:30',
          },
          afternoon: {
            start: '13:00',
            end: '15:00',
          },
          weekdays: [1, 2, 3, 4, 5],
        },
        '美股': {
          enabled: false,
          morning: {
            start: '22:30',
            end: '05:00',
          },
          afternoon: null,
          weekdays: [1, 2, 3, 4, 5],
        },
      },
      stocks: {
        '002255': {
          transactions: [
            {
              time: '2026-01-10 10:30:00',
              quantity: 400,
              price: 14.013,
            },
          ],
          alert_up: 15.0,
          alert_down: 13.0,
        },
        '600228': {
          transactions: [],
          alert_up: null,
          alert_down: null,
        },
      },
    };
  }

  saveHoldingsConfig(config);
}
