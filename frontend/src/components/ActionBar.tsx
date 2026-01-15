import React, { useState, useEffect, useCallback } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, Typography } from '@mui/material';
import { Add, ShoppingCart, AccountBalance } from '@mui/icons-material';
import { getRealtimePrice } from '../services/stockData';
import { HoldingsConfig, Transaction } from '../types';
import { saveHoldingsConfig } from '../services/storage';

interface ActionBarProps {
  config: HoldingsConfig;
  onConfigUpdate: (newConfig: HoldingsConfig) => void;
  onStockAdded?: (code: string) => void;
  stockStates?: Map<string, { name: string; last_price: number | null }>;
  onOpenTransactionDialog?: (fn: (stockCode?: string) => void) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({ config, onConfigUpdate, onStockAdded, stockStates, onOpenTransactionDialog }) => {
  const [open, setOpen] = useState(false);
  const [stockCode, setStockCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // 添加交易相关状态
  const [openTransaction, setOpenTransaction] = useState(false);
  const [transactionStockCode, setTransactionStockCode] = useState('');
  const [transactionStockCodeInput, setTransactionStockCodeInput] = useState('');
  const [transactionTime, setTransactionTime] = useState('');
  const [transactionQuantity, setTransactionQuantity] = useState('100');
  const [transactionPrice, setTransactionPrice] = useState('');
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionError, setTransactionError] = useState<string>('');
  const [transactionStockValidated, setTransactionStockValidated] = useState(false);
  const [transactionCurrentPrice, setTransactionCurrentPrice] = useState<number | null>(null);

  // 增减本金相关状态
  const [openFundsDialog, setOpenFundsDialog] = useState(false);
  const [fundsAmount, setFundsAmount] = useState('');
  const [fundsOperation, setFundsOperation] = useState<'add' | 'subtract'>('add');

  const handleOpen = () => {
    setOpen(true);
    setStockCode('');
    setError('');
  };

  const handleClose = () => {
    setOpen(false);
    setStockCode('');
    setError('');
  };

  const handleAdd = async () => {
    if (!stockCode.trim()) {
      setError('请输入股票代码');
      return;
    }

    const code = stockCode.trim().toUpperCase();
    
    // 检查是否已存在
    if (config.holdings[code] || config.watchlist[code]) {
      setError('该股票已在自选或持仓中');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 尝试获取股票信息
      const data = await getRealtimePrice(code);
      
      if (!data) {
        setError('无法获取股票信息，请检查股票代码是否正确');
        setLoading(false);
        return;
      }

      // 添加成功，更新配置
      const newConfig = {
        ...config,
        watchlist: {
          ...config.watchlist,
          [code]: {
            alert_up: null,
            alert_down: null,
          },
        },
      };

      saveHoldingsConfig(newConfig);
      onConfigUpdate(newConfig);
      
      if (onStockAdded) {
        onStockAdded(code);
      }

      handleClose();
    } catch (err: any) {
      setError(err.message || '添加失败，请检查股票代码是否正确');
    } finally {
      setLoading(false);
    }
  };

  // 初始化交易时间
  useEffect(() => {
    if (openTransaction && !transactionTime) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setTransactionTime(`${year}-${month}-${day} ${hours}:${minutes}:${seconds}`);
    }
  }, [openTransaction, transactionTime]);

  // 获取所有自选股代码（包括持仓）
  const getAllStockCodes = (): string[] => {
    const codes = new Set<string>();
    Object.keys(config.holdings || {}).forEach(code => codes.add(code));
    Object.keys(config.watchlist || {}).forEach(code => codes.add(code));
    return Array.from(codes).sort();
  };

  // 处理打开交易对话框
  const handleOpenTransaction = useCallback((presetStockCode?: string) => {
    setOpenTransaction(true);
    if (presetStockCode) {
      // 如果预设了股票代码，直接设置为已验证状态
      setTransactionStockCode(presetStockCode);
      setTransactionStockCodeInput('');
      setTransactionStockValidated(true);
      // 设置当前价格
      const price = stockStates?.get(presetStockCode)?.last_price || null;
      setTransactionCurrentPrice(price);
      setTransactionPrice(price ? price.toFixed(3) : '');
    } else {
      setTransactionStockCode('');
      setTransactionStockCodeInput('');
      setTransactionStockValidated(false);
      setTransactionCurrentPrice(null);
      setTransactionPrice('');
    }
    setTransactionTime('');
    setTransactionQuantity('100');
    setTransactionError('');
  }, [stockStates]);

  // 暴露打开对话框的方法给父组件
  useEffect(() => {
    if (onOpenTransactionDialog) {
      onOpenTransactionDialog(handleOpenTransaction);
    }
    // 同时暴露到全局变量（作为备用方案）
    (window as any).__openTransactionDialog = handleOpenTransaction;
    return () => {
      if ((window as any).__openTransactionDialog) {
        delete (window as any).__openTransactionDialog;
      }
    };
  }, [handleOpenTransaction, onOpenTransactionDialog]);

  // 处理关闭交易对话框
  const handleCloseTransaction = () => {
    setOpenTransaction(false);
    setTransactionStockCode('');
    setTransactionStockCodeInput('');
    setTransactionTime('');
    setTransactionQuantity('100');
    setTransactionPrice('');
    setTransactionError('');
    setTransactionStockValidated(false);
    setTransactionCurrentPrice(null);
  };

  // 验证交易股票代码
  const handleValidateTransactionStock = async () => {
    const code = transactionStockCode || transactionStockCodeInput.trim().toUpperCase();
    
    if (!code) {
      setTransactionError('请选择或输入股票代码');
      return;
    }

    setTransactionLoading(true);
    setTransactionError('');

    try {
      // 如果是从下拉框选择的，直接使用
      if (transactionStockCode && getAllStockCodes().includes(transactionStockCode)) {
        const price = stockStates?.get(transactionStockCode)?.last_price || null;
        setTransactionCurrentPrice(price);
        setTransactionPrice(price ? price.toFixed(3) : '');
        setTransactionStockValidated(true);
        setTransactionLoading(false);
        return;
      }

      // 如果是新输入的，先验证并添加到自选股
      if (config.holdings[code] || config.watchlist[code]) {
        setTransactionError('该股票已在自选或持仓中，请从下拉框选择');
        setTransactionLoading(false);
        return;
      }

      const data = await getRealtimePrice(code);
      
      if (!data) {
        setTransactionError('无法获取股票信息，请检查股票代码是否正确');
        setTransactionLoading(false);
        return;
      }

      // 添加到自选股
      const newConfig = {
        ...config,
        watchlist: {
          ...config.watchlist,
          [code]: {
            alert_up: null,
            alert_down: null,
          },
        },
      };

      saveHoldingsConfig(newConfig);
      onConfigUpdate(newConfig);
      
      if (onStockAdded) {
        onStockAdded(code);
      }

      // 设置当前价格
      setTransactionCurrentPrice(data.price);
      setTransactionPrice(data.price.toFixed(3));
      setTransactionStockCode(code);
      setTransactionStockCodeInput('');
      setTransactionStockValidated(true);
    } catch (err: any) {
      setTransactionError(err.message || '验证失败，请检查股票代码是否正确');
    } finally {
      setTransactionLoading(false);
    }
  };

  // 处理提交交易
  const handleSubmitTransaction = () => {
    const code = transactionStockCode || transactionStockCodeInput.trim().toUpperCase();
    
    if (!code) {
      setTransactionError('请选择或输入股票代码');
      return;
    }

    if (!transactionStockValidated) {
      setTransactionError('请先验证股票代码');
      return;
    }

    if (!transactionTime) {
      setTransactionError('请输入交易时间');
      return;
    }

    const quantity = parseFloat(transactionQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      setTransactionError('请输入有效的交易数量');
      return;
    }

    const price = parseFloat(transactionPrice);
    if (isNaN(price) || price <= 0) {
      setTransactionError('请输入有效的交易价格');
      return;
    }

    // 更新持仓配置
    const existingHolding = config.holdings[code] || {
      transactions: [],
      alert_up: null,
      alert_down: null,
    };

    const newTransaction: Transaction = {
      time: transactionTime,
      quantity: quantity,
      price: price,
    };

    // 计算交易金额（买入减少可用资金）
    const transactionAmount = quantity * price;
    const newAvailableFunds = config.funds.available_funds - transactionAmount;

    const newConfig = {
      ...config,
      funds: {
        ...config.funds,
        available_funds: Math.max(0, newAvailableFunds), // 确保不为负数
      },
      holdings: {
        ...config.holdings,
        [code]: {
          ...existingHolding,
          transactions: [...existingHolding.transactions, newTransaction],
        },
      },
    };

    // 如果股票在自选股中，移除它（因为现在有持仓了）
    if (config.watchlist[code]) {
      const { [code]: removed, ...restWatchlist } = config.watchlist;
      newConfig.watchlist = restWatchlist;
    }

    saveHoldingsConfig(newConfig);
    onConfigUpdate(newConfig);
    handleCloseTransaction();
  };

  // 当选择已有股票时，自动设置价格
  useEffect(() => {
    if (transactionStockCode && stockStates?.has(transactionStockCode)) {
      const price = stockStates.get(transactionStockCode)?.last_price;
      if (price !== null && price !== undefined) {
        setTransactionCurrentPrice(price);
        setTransactionPrice(price.toFixed(3));
        setTransactionStockValidated(true);
      }
    }
  }, [transactionStockCode, stockStates]);

  // 处理打开增减本金对话框
  const handleOpenFundsDialog = () => {
    setOpenFundsDialog(true);
    setFundsAmount('');
    setFundsOperation('add');
  };

  // 处理关闭增减本金对话框
  const handleCloseFundsDialog = () => {
    setOpenFundsDialog(false);
    setFundsAmount('');
    setFundsOperation('add');
  };

  // 处理提交增减本金
  const handleSubmitFunds = () => {
    const amount = parseFloat(fundsAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    let newTotalOriginalFunds = config.funds.total_original_funds;
    let newAvailableFunds = config.funds.available_funds;

    if (fundsOperation === 'add') {
      // 增加本金：本金增加，可用资金也增加
      newTotalOriginalFunds += amount;
      newAvailableFunds += amount;
    } else {
      // 减少本金：本金减少，可用资金也减少（但不能低于0）
      newTotalOriginalFunds = Math.max(0, newTotalOriginalFunds - amount);
      newAvailableFunds = Math.max(0, newAvailableFunds - amount);
    }

    const newConfig = {
      ...config,
      funds: {
        ...config.funds,
        total_original_funds: newTotalOriginalFunds,
        available_funds: newAvailableFunds,
      },
    };

    saveHoldingsConfig(newConfig);
    onConfigUpdate(newConfig);
    handleCloseFundsDialog();
  };

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={<AccountBalance />}
          onClick={handleOpenFundsDialog}
        >
          增减本金
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleOpen}
          >
            增加自选
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<ShoppingCart />}
            onClick={() => handleOpenTransaction()}
          >
            增加交易
          </Button>
        </Box>
      </Box>

      {/* 添加自选股对话框 */}
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>添加自选股</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="股票代码"
            fullWidth
            variant="outlined"
            value={stockCode}
            onChange={(e) => {
              setStockCode(e.target.value);
              setError('');
            }}
            placeholder="例如：600228"
            error={!!error}
            helperText={error || '请输入股票代码（如：600228、002255、TSLA）'}
            disabled={loading}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleAdd();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleAdd} variant="contained" disabled={loading}>
            {loading ? '验证中...' : '添加'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 添加交易对话框 */}
      <Dialog open={openTransaction} onClose={handleCloseTransaction} maxWidth="sm" fullWidth>
        <DialogTitle>添加交易记录</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {/* 股票代码选择/输入 */}
            <FormControl fullWidth>
              <InputLabel>股票代码</InputLabel>
              <Select
                value={transactionStockCode}
                label="股票代码"
                onChange={(e) => {
                  setTransactionStockCode(e.target.value);
                  setTransactionStockCodeInput('');
                  setTransactionError('');
                }}
                disabled={transactionLoading}
              >
                {getAllStockCodes().map((code) => (
                  <MenuItem key={code} value={code}>
                    {code} {stockStates?.get(code)?.name ? `(${stockStates.get(code)?.name})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <TextField
              label="或输入新股票代码"
              fullWidth
              variant="outlined"
              value={transactionStockCodeInput}
              onChange={(e) => {
                setTransactionStockCodeInput(e.target.value);
                setTransactionStockCode('');
                setTransactionError('');
                setTransactionStockValidated(false);
              }}
              placeholder="例如：600228"
              disabled={transactionLoading || !!transactionStockCode}
              helperText={transactionStockCode ? '已选择股票' : '输入新代码后需要先验证'}
            />

            {!transactionStockValidated && (transactionStockCode || transactionStockCodeInput) && (
              <Button
                variant="outlined"
                onClick={handleValidateTransactionStock}
                disabled={transactionLoading}
                fullWidth
              >
                {transactionLoading ? '验证中...' : '验证股票代码'}
              </Button>
            )}

            {transactionError && (
              <Box sx={{ color: 'error.main', fontSize: '0.875rem' }}>
                {transactionError}
              </Box>
            )}

            {/* 交易信息输入（仅在股票验证成功后显示） */}
            {transactionStockValidated && (
              <>
                <TextField
                  label="交易时间"
                  type="datetime-local"
                  fullWidth
                  variant="outlined"
                  value={transactionTime ? (() => {
                    try {
                      const date = new Date(transactionTime);
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      const hours = String(date.getHours()).padStart(2, '0');
                      const minutes = String(date.getMinutes()).padStart(2, '0');
                      return `${year}-${month}-${day}T${hours}:${minutes}`;
                    } catch {
                      return '';
                    }
                  })() : ''}
                  onChange={(e) => {
                    const dateTime = e.target.value;
                    if (dateTime) {
                      const date = new Date(dateTime);
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      const hours = String(date.getHours()).padStart(2, '0');
                      const minutes = String(date.getMinutes()).padStart(2, '0');
                      const seconds = String(date.getSeconds()).padStart(2, '0');
                      setTransactionTime(`${year}-${month}-${day} ${hours}:${minutes}:${seconds}`);
                    }
                  }}
                  InputLabelProps={{ shrink: true }}
                />

                <TextField
                  label="数量（股）"
                  type="number"
                  fullWidth
                  variant="outlined"
                  value={transactionQuantity}
                  onChange={(e) => setTransactionQuantity(e.target.value)}
                  inputProps={{ min: 1, step: 1 }}
                  helperText="输入交易数量（股数）"
                />

                <TextField
                  label="单价"
                  type="number"
                  fullWidth
                  variant="outlined"
                  value={transactionPrice}
                  onChange={(e) => setTransactionPrice(e.target.value)}
                  inputProps={{ min: 0, step: 0.001 }}
                  helperText={transactionCurrentPrice !== null ? `当前价格: ${transactionCurrentPrice.toFixed(3)}` : ''}
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTransaction} disabled={transactionLoading}>
            取消
          </Button>
          <Button
            onClick={handleSubmitTransaction}
            variant="contained"
            disabled={transactionLoading || !transactionStockValidated}
          >
            提交
          </Button>
        </DialogActions>
      </Dialog>

      {/* 增减本金对话框 */}
      <Dialog open={openFundsDialog} onClose={handleCloseFundsDialog} maxWidth="sm" fullWidth>
        <DialogTitle>增减本金</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>操作类型</InputLabel>
              <Select
                value={fundsOperation}
                label="操作类型"
                onChange={(e) => setFundsOperation(e.target.value as 'add' | 'subtract')}
              >
                <MenuItem value="add">增加本金</MenuItem>
                <MenuItem value="subtract">减少本金</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="金额"
              type="number"
              fullWidth
              variant="outlined"
              value={fundsAmount}
              onChange={(e) => setFundsAmount(e.target.value)}
              inputProps={{ min: 0, step: 0.01 }}
              helperText={fundsOperation === 'add' ? '增加本金时，可用资金也会同步增加' : '减少本金时，可用资金也会同步减少'}
            />
            {fundsOperation === 'subtract' && (
              <Box sx={{ p: 1, backgroundColor: '#fff3cd', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ color: '#856404' }}>
                  当前本金：{config.funds.total_original_funds.toFixed(2)}
                  <br />
                  当前可用资金：{config.funds.available_funds.toFixed(2)}
                  <br />
                  减少后本金：{Math.max(0, config.funds.total_original_funds - (parseFloat(fundsAmount) || 0)).toFixed(2)}
                  <br />
                  减少后可用资金：{Math.max(0, config.funds.available_funds - (parseFloat(fundsAmount) || 0)).toFixed(2)}
                </Typography>
              </Box>
            )}
            {fundsOperation === 'add' && (
              <Box sx={{ p: 1, backgroundColor: '#d1ecf1', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ color: '#0c5460' }}>
                  当前本金：{config.funds.total_original_funds.toFixed(2)}
                  <br />
                  当前可用资金：{config.funds.available_funds.toFixed(2)}
                  <br />
                  增加后本金：{(config.funds.total_original_funds + (parseFloat(fundsAmount) || 0)).toFixed(2)}
                  <br />
                  增加后可用资金：{(config.funds.available_funds + (parseFloat(fundsAmount) || 0)).toFixed(2)}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseFundsDialog}>取消</Button>
          <Button
            onClick={handleSubmitFunds}
            variant="contained"
            disabled={!fundsAmount || parseFloat(fundsAmount) <= 0}
          >
            确认
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
