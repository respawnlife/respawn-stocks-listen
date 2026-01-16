import React, { useState, useEffect, useRef } from 'react';
import { Container, CssBaseline, ThemeProvider, createTheme, Alert, Snackbar, Typography } from '@mui/material';
import { StockTable } from './components/StockTable';
import { Statistics } from './components/Statistics';
import { ActionBar } from './components/ActionBar';
import { StockState, HoldingsConfig } from './types';
import { initializeConfig, loadHoldingsConfig, saveHoldingsConfig, saveHistoryData, getTodayDate } from './services/storage';
import { getMultipleRealtimePrices } from './services/stockData';
import { calculateHoldingFromTransactions } from './utils/calculations';
import { isTradingTime, shouldStopUpdating } from './utils/tradingTime';
import { checkPriceAlert, playAlertSound, showNotification } from './utils/alert';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
  },
});

const POLL_INTERVAL = 2000; // 2秒更新一次

function App() {
  const [config, setConfig] = useState<HoldingsConfig | null>(null);
  const [stockStates, setStockStates] = useState<Map<string, StockState>>(new Map());
  const [initialized, setInitialized] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string>('');
  const configRef = useRef<HoldingsConfig | null>(null);
  
  // 初始化配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const loadedConfig = await initializeConfig();
        setConfig(loadedConfig);
      } catch (error) {
        console.error('加载配置失败:', error);
      }
    };
    loadConfig();
  }, []);

  // 保持 configRef 与 config 同步
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // 初始化股票状态
  useEffect(() => {
    if (!config) return;
    
    setStockStates((prevStates) => {
      const states = new Map<string, StockState>();
      
      // 处理持仓
      const holdingCodes = Object.keys(config.holdings || {});
      for (const code of holdingCodes) {
        const holdingConfig = config.holdings[code];
        // 确保 transactions 是数组
        const transactions = Array.isArray(holdingConfig.transactions) 
          ? holdingConfig.transactions 
          : [];
        const [holdingQuantity, holdingPrice] = calculateHoldingFromTransactions(
          transactions
        );

        // 保留已有的价格数据
        const existingState = prevStates.get(code);
        states.set(code, {
          code,
          name: existingState?.name || code,
          last_price: existingState?.last_price ?? null,
          last_time: existingState?.last_time ?? null,
          last_update_time: existingState?.last_update_time || '--',
          last_change_pct: existingState?.last_change_pct ?? 0.0,
          holding_price: holdingQuantity > 0 ? holdingPrice : null,
          holding_quantity: holdingQuantity,
          transactions: transactions,
          alert_up: holdingConfig.alert_up,
          alert_down: holdingConfig.alert_down,
          alert_triggered_up: existingState?.alert_triggered_up ?? false,
          alert_triggered_down: existingState?.alert_triggered_down ?? false,
        });
      }
      
      // 处理自选股
      const watchlistCodes = Object.keys(config.watchlist || {});
      for (const code of watchlistCodes) {
        // 如果已经在持仓中，跳过（持仓优先）
        if (states.has(code)) continue;
        
        const watchlistConfig = config.watchlist[code];
        // 保留已有的价格数据
        const existingState = prevStates.get(code);
        states.set(code, {
          code,
          name: existingState?.name || code,
          last_price: existingState?.last_price ?? null,
          last_time: existingState?.last_time ?? null,
          last_update_time: existingState?.last_update_time || '--',
          last_change_pct: existingState?.last_change_pct ?? 0.0,
          holding_price: null,
          holding_quantity: 0,
          transactions: [],
          alert_up: watchlistConfig.alert_up,
          alert_down: watchlistConfig.alert_down,
          alert_triggered_up: existingState?.alert_triggered_up ?? false,
          alert_triggered_down: existingState?.alert_triggered_down ?? false,
        });
      }

      return states;
    });
  }, [config]);

  // 初始化：获取一次数据
  useEffect(() => {
    const initialize = async () => {
      const stockCodes = Array.from(stockStates.keys());
      if (stockCodes.length === 0) {
        setInitialized(true);
        return;
      }

      console.log('正在初始化，获取股票数据...');
      const results = await getMultipleRealtimePrices(stockCodes);

      setStockStates((prev) => {
        const next = new Map(prev);
        for (const [code, data] of results.entries()) {
          const state = next.get(code);
          if (state) {
            const changePct =
              data.yesterday_close > 0
                ? ((data.price - data.yesterday_close) / data.yesterday_close) * 100
                : 0.0;

            // 检查报警
            const [triggeredUp, triggeredDown] = checkPriceAlert(code, data.price, state);
            if (triggeredUp || triggeredDown) {
              playAlertSound();
              const message = triggeredUp
                ? `${data.name}(${code}) 价格上升至 ${data.price.toFixed(2)}，达到报警价格 ${state.alert_up}`
                : `${data.name}(${code}) 价格下跌至 ${data.price.toFixed(2)}，达到报警价格 ${state.alert_down}`;
              setAlertMessage(message);
              showNotification('股票报警', message);
            }

            next.set(code, {
              ...state,
              name: data.name,
              last_price: data.price,
              last_time: new Date(),
              last_update_time: data.update_time,
              last_change_pct: changePct,
            });
          }
        }
        return next;
      });

      setInitialized(true);
    };

    if (stockStates.size > 0 && !initialized && config) {
      initialize();
    }
  }, [stockStates, initialized, config]);

  // 主循环：定时更新数据
  useEffect(() => {
    if (!initialized) return;

    let isMounted = true;

    const updateData = async () => {
      if (!isMounted) return;

      // 检查是否应该停止更新
      if (shouldStopUpdating()) {
        return;
      }

      // 从最新的 stockStates 获取股票代码列表
      setStockStates((prev) => {
        const stockCodes = Array.from(prev.keys());
        if (stockCodes.length === 0) return prev;

        // 使用 ref 获取最新的 config，避免依赖项问题
        const currentConfig = configRef.current;

        // 过滤出在交易时间内的股票
        const tradingStocks = stockCodes.filter((code) =>
          isTradingTime(code, currentConfig.market_hours)
        );

        if (tradingStocks.length === 0) {
          return prev; // 不在交易时间，不更新
        }

        // 异步获取数据
        getMultipleRealtimePrices(tradingStocks).then((results) => {
          if (!isMounted) return;

          setStockStates((current) => {
            const next = new Map(current);
            for (const [code, data] of results.entries()) {
              const state = next.get(code);
              if (state) {
                const changePct =
                  data.yesterday_close > 0
                    ? ((data.price - data.yesterday_close) / data.yesterday_close) * 100
                    : 0.0;

                // 检查报警
                const [triggeredUp, triggeredDown] = checkPriceAlert(code, data.price, state);
                if (triggeredUp || triggeredDown) {
                  playAlertSound();
                  const message = triggeredUp
                    ? `${data.name}(${code}) 价格上升至 ${data.price.toFixed(2)}，达到报警价格 ${state.alert_up}`
                    : `${data.name}(${code}) 价格下跌至 ${data.price.toFixed(2)}，达到报警价格 ${state.alert_down}`;
                  setAlertMessage(message);
                  showNotification('股票报警', message);
                }

                next.set(code, {
                  ...state,
                  name: data.name,
                  last_price: data.price,
                  last_time: new Date(),
                  last_update_time: data.update_time,
                  last_change_pct: changePct,
                });
              }
            }

            // 保存当天数据
            const today = getTodayDate();
            const currentConfigForSave = configRef.current;
            const historyData = {
              date: today,
              stocks: Array.from(next.values()).map((state) => ({
                code: state.code,
                name: state.name,
                price: state.last_price,
                change_pct: state.last_change_pct,
                holding_price: state.holding_price,
                holding_quantity: state.holding_quantity,
                holding_value:
                  state.last_price !== null && state.holding_quantity > 0
                    ? state.last_price * state.holding_quantity
                    : 0,
                profit:
                  state.holding_price !== null &&
                  state.holding_quantity > 0 &&
                  state.last_price !== null
                    ? (state.last_price - state.holding_price) * state.holding_quantity
                    : null,
              })),
              funds: currentConfigForSave.funds,
              timestamp: new Date().toISOString(),
            };
            saveHistoryData(today, historyData).catch((error) => {
              console.error('保存历史数据失败:', error);
            });

            return next;
          });
        });

        return prev;
      });
    };

    const interval = setInterval(updateData, POLL_INTERVAL);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [initialized]);

  // 定期检查配置变化（从 IndexedDB）
  useEffect(() => {
    if (!config) return;

    // IndexedDB 不会触发 storage 事件，所以定期检查配置变化
    const checkInterval = setInterval(async () => {
      const newConfig = await loadHoldingsConfig();
      if (JSON.stringify(newConfig) !== JSON.stringify(config)) {
        setConfig(newConfig);
      }
    }, 1000);

    return () => {
      clearInterval(checkInterval);
    };
  }, [config]);

  const stocksArray = Array.from(stockStates.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  // 切换隐私模式
  const handlePrivacyModeToggle = async () => {
    if (!config) return;
    const newConfig = {
      ...config,
      privacy_mode: !config.privacy_mode,
    };
    setConfig(newConfig);
    await saveHoldingsConfig(newConfig);
  };

  // 处理配置更新（添加自选股后）
  const handleConfigUpdate = (newConfig: HoldingsConfig) => {
    setConfig(newConfig);
  };

  // 打开交易对话框的引用
  const openTransactionDialogRef = useRef<((stockCode?: string) => void) | null>(null);

  // 处理股票添加后的回调（立即获取数据）
  const handleStockAdded = async (code: string) => {
    try {
      // 等待配置更新完成，确保股票状态已初始化
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const data = await getMultipleRealtimePrices([code]);
      if (data.has(code)) {
        const stockData = data.get(code)!;
        setStockStates((prev) => {
          const next = new Map(prev);
          let state = next.get(code);
          
          // 如果状态不存在，创建新状态（从配置中读取）
          if (!state) {
            const watchlistConfig = configRef.current.watchlist[code];
            state = {
              code,
              name: code,
              last_price: null,
              last_time: null,
              last_update_time: '--',
              last_change_pct: 0.0,
              holding_price: null,
              holding_quantity: 0,
              transactions: [],
              alert_up: watchlistConfig?.alert_up || null,
              alert_down: watchlistConfig?.alert_down || null,
              alert_triggered_up: false,
              alert_triggered_down: false,
            };
          }
          
          const changePct =
            stockData.yesterday_close > 0
              ? ((stockData.price - stockData.yesterday_close) / stockData.yesterday_close) * 100
              : 0.0;

          next.set(code, {
            ...state,
            name: stockData.name,
            last_price: stockData.price,
            last_time: new Date(),
            last_update_time: stockData.update_time,
            last_change_pct: changePct,
          });
          
          return next;
        });
      }
    } catch (error) {
      console.error('获取新添加股票数据失败:', error);
    }
  };

  if (!config) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Container maxWidth="xl" sx={{ mt: 2, mb: 2 }}>
          <Typography>加载配置中...</Typography>
        </Container>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="xl" sx={{ mt: 2, mb: 2 }}>
        <Statistics
          stocks={stocksArray}
          funds={config.funds}
          privacyMode={config.privacy_mode}
          onPrivacyModeToggle={handlePrivacyModeToggle}
          config={config}
        />
        <ActionBar
          config={config}
          onConfigUpdate={handleConfigUpdate}
          onStockAdded={handleStockAdded}
          stockStates={new Map(Array.from(stockStates.entries()).map(([code, state]) => [
            code,
            { name: state.name, last_price: state.last_price }
          ]))}
          onOpenTransactionDialog={(fn) => {
            openTransactionDialogRef.current = fn;
          }}
        />
        <StockTable
          stocks={stocksArray}
          privacyMode={config.privacy_mode}
          config={config}
          onConfigUpdate={handleConfigUpdate}
          onAddTransaction={(code) => {
            if (openTransactionDialogRef.current) {
              openTransactionDialogRef.current(code);
            }
          }}
        />
        <Snackbar
          open={!!alertMessage}
          autoHideDuration={6000}
          onClose={() => setAlertMessage('')}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert severity="warning" onClose={() => setAlertMessage('')}>
            {alertMessage}
          </Alert>
        </Snackbar>
      </Container>
    </ThemeProvider>
  );
}

export default App;
