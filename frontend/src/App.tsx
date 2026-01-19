import React, { useState, useEffect, useRef } from 'react';
import { Container, CssBaseline, ThemeProvider, createTheme, Alert, Snackbar, Typography, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText } from '@mui/material';
import { StockTable } from './components/StockTable';
import { Statistics } from './components/Statistics';
import { ActionBar } from './components/ActionBar';
import { Footer } from './components/Footer';
import { VERSION } from './version';
import { StockState, HoldingsConfig } from './types';
import { initializeConfig, loadHoldingsConfig, saveHoldingsConfig, saveHistoryData, getTodayDate, resetToDefaultConfig } from './services/storage';
import { exportAllData, importAllData } from './services/indexedDB';
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

// POLL_INTERVAL 现在从 config.update_interval 动态获取，默认1000ms

function App() {
  const [config, setConfig] = useState<HoldingsConfig | null>(null);
  const [stockStates, setStockStates] = useState<Map<string, StockState>>(new Map());
  const [initialized, setInitialized] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string>('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [dataManageDialogOpen, setDataManageDialogOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const configRef = useRef<HoldingsConfig | null>(null);
  const stockStatesRef = useRef<Map<string, StockState>>(new Map()); // 使用 ref 保存最新的 stockStates
  const initializationRef = useRef<boolean>(false); // 使用 ref 跟踪是否正在初始化或已初始化
  
  // 重置所有数据
  const handleExportData = async () => {
    try {
      const data = await exportAllData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stocks-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setAlertMessage('数据导出成功');
    } catch (error) {
      console.error('导出数据失败:', error);
      setAlertMessage('导出数据失败，请重试');
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // 验证数据格式
      if (!data || typeof data !== 'object') {
        setAlertMessage('导入失败：文件格式不正确');
        return;
      }

      // 确认导入
      setImportConfirmOpen(true);
      
      // 保存文件数据到临时状态，等待确认
      (window as any).__pendingImportData = data;
    } catch (error) {
      console.error('导入数据失败:', error);
      setAlertMessage('导入失败：文件读取错误');
    } finally {
      // 清空文件输入，允许重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImport = async () => {
    try {
      const data = (window as any).__pendingImportData;
      if (!data) {
        setAlertMessage('导入失败：数据无效');
        return;
      }

      await importAllData(data);
      
      // 重新加载配置
      const newConfig = await initializeConfig();
      setConfig(newConfig);
      
      setImportConfirmOpen(false);
      setAlertMessage('数据导入成功，页面将刷新');
      
      // 延迟刷新页面
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('导入数据失败:', error);
      setAlertMessage('导入数据失败，请重试');
      setImportConfirmOpen(false);
    } finally {
      delete (window as any).__pendingImportData;
    }
  };

  const handleResetData = async () => {
    try {
      const defaultConfig = await resetToDefaultConfig();
      setConfig(defaultConfig);
      configRef.current = defaultConfig;
      setResetConfirmOpen(false);
      setAlertMessage('数据已重置为默认配置');
      // 重新初始化股票状态
      window.location.reload(); // 简单粗暴的方式，确保完全重新加载
    } catch (error) {
      console.error('重置数据失败:', error);
      setAlertMessage('重置数据失败，请刷新页面重试');
    }
  };
  
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

  // 保持 stockStatesRef 与 stockStates 同步
  useEffect(() => {
    stockStatesRef.current = stockStates;
  }, [stockStates]);

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
          alerts: holdingConfig.alerts,
          alert_up: holdingConfig.alert_up, // 向后兼容
          alert_down: holdingConfig.alert_down, // 向后兼容
          alert_triggered: existingState?.alert_triggered ?? new Set(),
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
          alerts: watchlistConfig.alerts,
          alert_up: watchlistConfig.alert_up, // 向后兼容
          alert_down: watchlistConfig.alert_down, // 向后兼容
          alert_triggered: existingState?.alert_triggered ?? new Set(),
        });
      }

      return states;
    });
  }, [config]);

  // 初始化：获取一次数据
  useEffect(() => {
    // 使用 ref 来防止重复执行（包括 StrictMode 的双重执行）
    if (initializationRef.current || initialized) {
      return;
    }

    if (!config) {
      return;
    }
    
    // 等待 stockStates 初始化完成（通过检查是否有股票代码）
    // 使用 setTimeout 确保 stockStates 已经更新
    const checkAndInitialize = () => {
      const stockCodes = Array.from(stockStates.keys());
      if (stockCodes.length === 0) {
        // 如果还没有股票，延迟检查
        setTimeout(checkAndInitialize, 100);
        return;
      }

      // 设置标志，防止重复执行（在调用前设置，避免并发）
      if (initializationRef.current) {
        return;
      }
      initializationRef.current = true;
      
      const initialize = async () => {
        console.log('正在初始化，获取股票数据...');
        const results = await getMultipleRealtimePrices(stockCodes);

      setStockStates((prev) => {
        const next = new Map(prev);
        // 获取当前时间作为更新时间（如果API没有返回时间，使用当前时间）
        const now = new Date();
        const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        // 更新所有股票，无论是否成功获取数据
        for (const code of stockCodes) {
          const state = next.get(code);
          if (state) {
            const data = results.get(code);
            if (data) {
              // 成功获取数据，使用API返回的时间
              const changePct =
                data.yesterday_close > 0
                  ? ((data.price - data.yesterday_close) / data.yesterday_close) * 100
                  : 0.0;

              // 检查报警
              const triggeredAlerts = checkPriceAlert(code, data.price, state);
              if (triggeredAlerts.length > 0) {
                playAlertSound();
                const messages = triggeredAlerts.map(alert => {
                  const typeText = alert.type === 'up' ? '上涨' : '下跌';
                  return `${data.name}(${code}) 价格${typeText}至 ${data.price.toFixed(2)}，达到报警价格 ${alert.price.toFixed(2)}`;
                });
                const message = messages.join('；');
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
            } else {
              // 获取数据失败，但拉取已完成，更新时间（使用当前时间）
              next.set(code, {
                ...state,
                last_time: new Date(),
                last_update_time: currentTimeStr,
              });
            }
          }
        }
        return next;
      });

        setInitialized(true);
      };

      initialize();
    };
    
    checkAndInitialize();
  }, [config, initialized, stockStates]);

  // 主循环：定时更新数据
  useEffect(() => {
    if (!initialized || !config) return;

    let isMounted = true;
    const pollInterval = config.update_interval ?? 1000; // 默认1秒

    const updateData = async () => {
      if (!isMounted) return;

      // 从最新的 stockStates 获取股票代码列表（使用 ref 获取最新值，避免闭包问题）
      const stockCodes = Array.from(stockStatesRef.current.keys());
      if (stockCodes.length === 0) return;

      // 使用 ref 获取最新的 config，避免依赖项问题
      const currentConfig = configRef.current;
      if (!currentConfig) return;

      // 检查是否应该停止更新
      if (shouldStopUpdating()) {
        return;
      }

      // 过滤出在交易时间内的股票
      const tradingStocks = stockCodes.filter((code) =>
        isTradingTime(code, currentConfig.market_hours)
      );

      if (tradingStocks.length === 0) {
        return; // 不在交易时间，不更新
      }

      // 异步获取数据（只调用一次）
      try {
        const results = await getMultipleRealtimePrices(tradingStocks);
        if (!isMounted) return;

        setStockStates((current) => {
          const next = new Map(current);
          // 获取当前时间作为更新时间（如果API没有返回时间，使用当前时间）
          const now = new Date();
          const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
          
          // 更新所有在交易时间内的股票，无论是否成功获取数据
          for (const code of tradingStocks) {
            const state = next.get(code);
            if (state) {
              const data = results.get(code);
              if (data) {
                // 成功获取数据，使用API返回的时间
                const changePct =
                  data.yesterday_close > 0
                    ? ((data.price - data.yesterday_close) / data.yesterday_close) * 100
                    : 0.0;

                // 检查报警
                const triggeredAlerts = checkPriceAlert(code, data.price, state);
                if (triggeredAlerts.length > 0) {
                  playAlertSound();
                  const messages = triggeredAlerts.map(alert => {
                    const typeText = alert.type === 'up' ? '上涨' : '下跌';
                    return `${data.name}(${code}) 价格${typeText}至 ${data.price.toFixed(2)}，达到报警价格 ${alert.price.toFixed(2)}`;
                  });
                  const message = messages.join('；');
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
              } else {
                // 获取数据失败，但拉取已完成，更新时间（使用当前时间）
                next.set(code, {
                  ...state,
                  last_time: new Date(),
                  last_update_time: currentTimeStr,
                });
              }
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
      } catch (error) {
        console.error('获取股票数据失败:', error);
      }
    };

    // 立即执行一次
    updateData();
    
    const interval = setInterval(updateData, pollInterval);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [initialized, config?.update_interval]);

  // 不再定期检查配置变化，改为在增删改操作时主动保存

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
    configRef.current = newConfig;
    await saveHoldingsConfig(newConfig);
  };

  // 处理配置更新（添加自选股后）
  const handleConfigUpdate = async (newConfig: HoldingsConfig) => {
    setConfig(newConfig);
    // 立即更新 configRef，确保后续操作能获取到最新配置
    configRef.current = newConfig;
    // 保存到 IndexedDB
    await saveHoldingsConfig(newConfig);
  };

  // 更新页面 title
  useEffect(() => {
    if (!config) {
      document.title = '--';
      return;
    }

    // 将 stockStates 转换为数组用于计算
    const stocksForCalc = Array.from(stockStates.values());

    // 计算总持仓市值
    const totalHoldingValue = stocksForCalc.reduce((sum, stock) => {
      if (stock.last_price !== null && stock.holding_quantity > 0) {
        return sum + stock.last_price * stock.holding_quantity;
      }
      return sum;
    }, 0);

    // 计算历史交易占用的资金
    const historicalFundsUsed = (config.historical_holdings || []).reduce((sum, historical) => {
      return sum + historical.transactions.reduce(
        (transactionSum, transaction) => transactionSum + transaction.quantity * transaction.price,
        0
      );
    }, 0);

    // 计算实时市值
    const totalAssets = config.funds.available_funds + totalHoldingValue + historicalFundsUsed;

    // 计算持仓股票数量
    const holdingStockCount = stocksForCalc.filter(
      (stock) => stock.holding_price !== null && stock.holding_quantity > 0
    ).length;

    // 计算总盈亏
    const totalProfit = totalAssets - config.funds.total_original_funds;
    const totalProfitPct =
      config.funds.total_original_funds > 0
        ? (totalProfit / config.funds.total_original_funds) * 100
        : 0;

    // 计算整体涨跌幅（加权平均）
    const totalChangePct =
      stocksForCalc.length > 0
        ? stocksForCalc.reduce((sum, stock) => sum + stock.last_change_pct, 0) / stocksForCalc.length
        : 0;

    // 无持仓时，显示为0
    const hasPosition = totalHoldingValue > 0 || holdingStockCount > 0;
    const displayChangePct = hasPosition ? totalChangePct : 0;
    const displayProfit = hasPosition ? totalProfit : 0;
    const displayProfitPct = hasPosition ? totalProfitPct : 0;

    if (holdingStockCount > 0) {
      // 有持仓，显示盈亏：123.40(2.12%)
      const sign = displayProfit >= 0 ? '+' : '';
      document.title = `${sign}${displayProfit.toFixed(2)}(${displayProfitPct >= 0 ? '+' : ''}${displayProfitPct.toFixed(2)}%)`;
    } else {
      // 没有持仓，显示涨跌幅（为0）：0.00%
      document.title = `${displayChangePct >= 0 ? '+' : ''}${displayChangePct.toFixed(2)}%`;
    }
  }, [config, stockStates]);

  // 打开交易对话框的引用
  const openTransactionDialogRef = useRef<((stockCode?: string) => void) | null>(null);
  // 打开"查看所有交易"对话框的引用
  const openAllTransactionsDialogRef = useRef<((stockCode?: string) => void) | null>(null);

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
        <Container maxWidth="xl" sx={{ mt: 2, mb: 8, pb: 2 }}>
          <Statistics
          stocks={stocksArray}
          funds={config.funds}
          privacyMode={config.privacy_mode}
          onPrivacyModeToggle={handlePrivacyModeToggle}
          config={config}
          onConfigUpdate={handleConfigUpdate}
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
          onOpenAllTransactionsDialog={(fn) => {
            openAllTransactionsDialogRef.current = fn;
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
          onOpenAllTransactionsDialog={(code) => {
            if (openAllTransactionsDialogRef.current) {
              openAllTransactionsDialogRef.current(code);
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
        
            {/* 数据管理按钮 */}
            <Box sx={{ mt: 3, mb: 2, textAlign: 'center', display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => setDataManageDialogOpen(true)}
                sx={{ textTransform: 'none' }}
              >
                数据导入导出
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={() => setResetConfirmOpen(true)}
                sx={{ textTransform: 'none' }}
              >
                重置所有数据
              </Button>
            </Box>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportData}
            />

            {/* Footer */}
            <Footer version={VERSION} />
        
        {/* 重置确认对话框 */}
        <Dialog open={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)}>
          <DialogTitle>确认重置数据</DialogTitle>
          <DialogContent>
            <DialogContentText>
              此操作将清空所有现有数据（包括自选股、交易记录、历史数据等），并用默认配置覆盖。
              <br />
              <strong>此操作不可恢复，请谨慎操作！</strong>
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setResetConfirmOpen(false)}>取消</Button>
            <Button onClick={handleResetData} color="error" variant="contained">
              确认重置
            </Button>
          </DialogActions>
        </Dialog>

        {/* 数据管理对话框 */}
        <Dialog open={dataManageDialogOpen} onClose={() => setDataManageDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>数据导入导出</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 3 }}>
              本项目不会上传任何数据到互联网，所有数据均存储在本地浏览器中。
              <br />
              如有多设备使用，请自行通过导入导出功能同步数据。
            </DialogContentText>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={() => {
                  setDataManageDialogOpen(false);
                  handleExportData();
                }}
                sx={{ textTransform: 'none' }}
              >
                导出数据
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={() => {
                  setDataManageDialogOpen(false);
                  fileInputRef.current?.click();
                }}
                sx={{ textTransform: 'none' }}
              >
                导入数据
              </Button>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDataManageDialogOpen(false)}>关闭</Button>
          </DialogActions>
        </Dialog>

        {/* 导入确认对话框 */}
        <Dialog open={importConfirmOpen} onClose={() => setImportConfirmOpen(false)}>
          <DialogTitle>确认导入数据</DialogTitle>
          <DialogContent>
            <DialogContentText>
              此操作将清空所有现有数据，并用导入的数据覆盖。
              <br />
              <strong>此操作不可恢复，请谨慎操作！</strong>
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              setImportConfirmOpen(false);
              delete (window as any).__pendingImportData;
            }}>取消</Button>
            <Button onClick={handleConfirmImport} color="primary" variant="contained">
              确认导入
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </ThemeProvider>
  );
}

export default App;
