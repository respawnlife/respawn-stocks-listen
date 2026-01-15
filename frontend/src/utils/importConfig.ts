import { HoldingsConfig } from '../types';
import { saveHoldingsConfig } from '../services/storage';

/**
 * 从 JSON 文件导入配置
 * 可以通过浏览器控制台调用此函数导入 Python 配置文件
 */
export function importConfigFromJSON(jsonString: string): boolean {
  try {
    const pythonConfig = JSON.parse(jsonString);
    const config: HoldingsConfig = {
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

    saveHoldingsConfig(config);
    return true;
  } catch (error) {
    console.error('导入配置失败:', error);
    return false;
  }
}

// 将函数暴露到全局，方便在控制台使用
if (typeof window !== 'undefined') {
  (window as any).importStockConfig = importConfigFromJSON;
}
