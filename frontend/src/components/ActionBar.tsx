import React, { useState, useEffect, useCallback } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Chip } from '@mui/material';
import { Add, ShoppingCart, AccountBalance, History, Edit, Delete } from '@mui/icons-material';
import { getRealtimePrice } from '../services/stockData';
import { HoldingsConfig, Transaction } from '../types';
import { saveHoldingsConfig } from '../services/storage';
import { formatPriceFixed } from '../utils/calculations';

interface ActionBarProps {
  config: HoldingsConfig;
  onConfigUpdate: (newConfig: HoldingsConfig) => void;
  onStockAdded?: (code: string) => void;
  stockStates?: Map<string, { name: string; last_price: number | null }>;
  onOpenTransactionDialog?: (fn: (stockCode?: string) => void) => void;
  onOpenAllTransactionsDialog?: (fn: (stockCode?: string) => void) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({ config, onConfigUpdate, onStockAdded, stockStates, onOpenTransactionDialog, onOpenAllTransactionsDialog }) => {
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
  const [transactionPriceInitialized, setTransactionPriceInitialized] = useState(false);

  // 增减本金相关状态
  const [openFundsDialog, setOpenFundsDialog] = useState(false);
  const [fundsAmount, setFundsAmount] = useState('');
  const [fundsOperation, setFundsOperation] = useState<'add' | 'subtract'>('add');

  // 查看历史交易相关状态
  const [openHistoryDialog, setOpenHistoryDialog] = useState(false);
  const [editingHistoryTransaction, setEditingHistoryTransaction] = useState<{
    code: string;
    isHistorical: boolean;
    historicalIndex?: number;
    transactionIndex: number;
    transaction: Transaction;
  } | null>(null);
  const [deletingHistoryTransaction, setDeletingHistoryTransaction] = useState<{
    code: string;
    isHistorical: boolean;
    historicalIndex?: number;
    transactionIndex: number;
  } | null>(null);
  const [historyEditForm, setHistoryEditForm] = useState<{
    time: string;
    quantity: string;
    price: string;
  }>({ time: '', quantity: '', price: '' });
  
  // 筛选相关状态
  const [filterStockCode, setFilterStockCode] = useState<string>('');
  const [filterStockCodeInput, setFilterStockCodeInput] = useState<string>('');
  const [filterTimeStart, setFilterTimeStart] = useState<string>('');
  const [filterTimeEnd, setFilterTimeEnd] = useState<string>('');
  const [filterAmountOperator, setFilterAmountOperator] = useState<'gt' | 'eq' | 'lt'>('gt');
  const [filterAmountValue, setFilterAmountValue] = useState<string>('');

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

      await saveHoldingsConfig(newConfig);
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
    setTransactionPriceInitialized(false); // 重置初始化标志
    if (presetStockCode) {
      // 如果预设了股票代码，直接设置为已验证状态
      setTransactionStockCode(presetStockCode);
      setTransactionStockCodeInput('');
      setTransactionStockValidated(true);
      // 设置当前价格（用于显示）
      const price = stockStates?.get(presetStockCode)?.last_price || null;
      setTransactionCurrentPrice(price);
      // 只在初始化时设置输入框价格
      setTransactionPrice(price ? price.toFixed(3) : '');
      setTransactionPriceInitialized(true);
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

  // 处理打开"查看所有交易"对话框（支持筛选）
  const handleOpenAllTransactionsDialog = useCallback((filterStockCode?: string) => {
    setOpenHistoryDialog(true);
    if (filterStockCode) {
      setFilterStockCode(filterStockCode);
      setFilterStockCodeInput('');
    } else {
      setFilterStockCode('');
      setFilterStockCodeInput('');
    }
    // 重置其他筛选条件
    setFilterTimeStart('');
    setFilterTimeEnd('');
    setFilterAmountOperator('gt');
    setFilterAmountValue('');
  }, []);

  // 暴露打开"查看所有交易"对话框的方法给父组件
  useEffect(() => {
    if (onOpenAllTransactionsDialog) {
      onOpenAllTransactionsDialog(handleOpenAllTransactionsDialog);
    }
  }, [handleOpenAllTransactionsDialog, onOpenAllTransactionsDialog]);

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
    setTransactionPriceInitialized(false);
  };

  // 处理关闭"查看所有交易"对话框
  const handleCloseHistoryDialog = () => {
    setOpenHistoryDialog(false);
    setFilterStockCode('');
    setFilterStockCodeInput('');
    setFilterTimeStart('');
    setFilterTimeEnd('');
    setFilterAmountOperator('gt');
    setFilterAmountValue('');
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
        // 只在初始化时设置输入框价格
        if (!transactionPriceInitialized) {
          setTransactionPrice(price ? price.toFixed(3) : '');
          setTransactionPriceInitialized(true);
        }
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

      await saveHoldingsConfig(newConfig);
      onConfigUpdate(newConfig);
      
      if (onStockAdded) {
        onStockAdded(code);
      }

      // 设置当前价格（用于显示）
      setTransactionCurrentPrice(data.price);
      // 只在初始化时设置输入框价格
      if (!transactionPriceInitialized) {
        setTransactionPrice(data.price.toFixed(3));
        setTransactionPriceInitialized(true);
      }
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

    // 确保 transactions 是数组
    const existingTransactions = Array.isArray(existingHolding.transactions) 
      ? existingHolding.transactions 
      : [];

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
          transactions: [...existingTransactions, newTransaction],
        },
      },
    };

    // 如果股票在自选股中，移除它（因为现在有持仓了）
    if (config.watchlist[code]) {
      const { [code]: removed, ...restWatchlist } = config.watchlist;
      newConfig.watchlist = restWatchlist;
    }

    saveHoldingsConfig(newConfig).then(() => {
      onConfigUpdate(newConfig);
      handleCloseTransaction();
    });
  };

  // 当股价变化时，只更新显示用的当前价格，不更新输入框
  useEffect(() => {
    if (transactionStockCode && stockStates?.has(transactionStockCode) && openTransaction) {
      const price = stockStates.get(transactionStockCode)?.last_price;
      if (price !== null && price !== undefined) {
        // 只更新显示用的当前价格，不更新输入框
        setTransactionCurrentPrice(price);
        // 如果价格还没有初始化，才设置输入框（这种情况应该很少，因为 handleOpenTransaction 已经设置了）
        if (!transactionPriceInitialized) {
          setTransactionPrice(price.toFixed(3));
          setTransactionPriceInitialized(true);
        }
      }
    }
  }, [transactionStockCode, stockStates, openTransaction, transactionPriceInitialized]);

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

    saveHoldingsConfig(newConfig).then(() => {
      onConfigUpdate(newConfig);
      handleCloseFundsDialog();
    });
  };

  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<AccountBalance />}
            onClick={handleOpenFundsDialog}
          >
            增减本金
          </Button>
          <Button
            variant="outlined"
            startIcon={<History />}
            onClick={() => setOpenHistoryDialog(true)}
          >
            查看所有交易
          </Button>
        </Box>
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

      {/* 查看所有交易对话框 */}
      <Dialog open={openHistoryDialog} onClose={handleCloseHistoryDialog} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">所有交易记录</Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                setOpenHistoryDialog(false);
                handleOpenTransaction();
              }}
              size="small"
            >
              增加交易
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* 筛选区域 */}
          <Box sx={{ mt: 2, mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>筛选条件</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 股票筛选 */}
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControl sx={{ minWidth: 200 }}>
                  <InputLabel>股票代码</InputLabel>
                  <Select
                    value={filterStockCode}
                    label="股票代码"
                    onChange={(e) => {
                      setFilterStockCode(e.target.value);
                      setFilterStockCodeInput('');
                    }}
                  >
                    <MenuItem value="">全部</MenuItem>
                    {getAllStockCodes().map((code) => (
                      <MenuItem key={code} value={code}>
                        {code} {stockStates?.get(code)?.name ? `(${stockStates.get(code)?.name})` : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography>或</Typography>
                <TextField
                  label="输入股票代码"
                  value={filterStockCodeInput}
                  onChange={(e) => {
                    setFilterStockCodeInput(e.target.value.toUpperCase());
                    setFilterStockCode('');
                  }}
                  placeholder="例如：600228"
                  sx={{ flex: 1 }}
                />
              </Box>
              
              {/* 交易时间筛选 */}
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  label="开始时间"
                  type="datetime-local"
                  value={filterTimeStart}
                  onChange={(e) => setFilterTimeStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <Typography>至</Typography>
                <TextField
                  label="结束时间"
                  type="datetime-local"
                  value={filterTimeEnd}
                  onChange={(e) => setFilterTimeEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>
              
              {/* 总金额筛选 */}
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel>金额条件</InputLabel>
                  <Select
                    value={filterAmountOperator}
                    label="金额条件"
                    onChange={(e) => setFilterAmountOperator(e.target.value as 'gt' | 'eq' | 'lt')}
                  >
                    <MenuItem value="gt">大于</MenuItem>
                    <MenuItem value="eq">等于</MenuItem>
                    <MenuItem value="lt">小于</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="金额"
                  type="number"
                  value={filterAmountValue}
                  onChange={(e) => setFilterAmountValue(e.target.value)}
                  placeholder="输入金额"
                  sx={{ flex: 1 }}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    setFilterStockCode('');
                    setFilterStockCodeInput('');
                    setFilterTimeStart('');
                    setFilterTimeEnd('');
                    setFilterAmountOperator('gt');
                    setFilterAmountValue('');
                  }}
                >
                  清除筛选
                </Button>
              </Box>
            </Box>
          </Box>
          {(() => {
            // 收集所有交易记录
            const allTransactions: Array<{
              code: string;
              name: string;
              transaction: Transaction;
              isHistorical: boolean;
              historicalIndex?: number;
              transactionIndex: number;
            }> = [];

            // 添加当前持仓中的交易
            Object.entries(config.holdings || {}).forEach(([code, holding]) => {
              const transactions = Array.isArray(holding.transactions) ? holding.transactions : [];
              const stockName = stockStates?.get(code)?.name || code;
              transactions.forEach((transaction, index) => {
                allTransactions.push({
                  code,
                  name: stockName,
                  transaction,
                  isHistorical: false,
                  transactionIndex: index,
                });
              });
            });

            // 添加历史持仓中的交易
            if (config.historical_holdings && Array.isArray(config.historical_holdings)) {
              config.historical_holdings.forEach((historical, historicalIndex) => {
                const transactions = Array.isArray(historical.transactions) ? historical.transactions : [];
                transactions.forEach((transaction, transactionIndex) => {
                  allTransactions.push({
                    code: historical.code,
                    name: historical.name || historical.code,
                    transaction,
                    isHistorical: true,
                    historicalIndex,
                    transactionIndex,
                  });
                });
              });
            }

            // 应用筛选
            let filteredTransactions = allTransactions;
            
            // 股票筛选
            const filterCode = filterStockCode || filterStockCodeInput.trim().toUpperCase();
            if (filterCode) {
              filteredTransactions = filteredTransactions.filter(item => item.code === filterCode);
            }
            
            // 时间筛选
            if (filterTimeStart) {
              const startTime = new Date(filterTimeStart).getTime();
              filteredTransactions = filteredTransactions.filter(item => {
                const itemTime = new Date(item.transaction.time).getTime();
                return itemTime >= startTime;
              });
            }
            if (filterTimeEnd) {
              const endTime = new Date(filterTimeEnd).getTime();
              filteredTransactions = filteredTransactions.filter(item => {
                const itemTime = new Date(item.transaction.time).getTime();
                return itemTime <= endTime;
              });
            }
            
            // 金额筛选
            if (filterAmountValue) {
              const amountValue = parseFloat(filterAmountValue);
              if (!isNaN(amountValue)) {
                filteredTransactions = filteredTransactions.filter(item => {
                  const itemAmount = item.transaction.quantity * item.transaction.price;
                  if (filterAmountOperator === 'gt') return itemAmount > amountValue;
                  if (filterAmountOperator === 'eq') return Math.abs(itemAmount - amountValue) < 0.01;
                  if (filterAmountOperator === 'lt') return itemAmount < amountValue;
                  return true;
                });
              }
            }

            // 按时间排序（最新的在前）
            filteredTransactions.sort((a, b) => {
              const timeA = new Date(a.transaction.time).getTime();
              const timeB = new Date(b.transaction.time).getTime();
              return timeB - timeA;
            });

            return filteredTransactions.length > 0 ? (
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>股票代码</TableCell>
                      <TableCell>股票名称</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>交易时间</TableCell>
                      <TableCell>数量（股）</TableCell>
                      <TableCell>单价</TableCell>
                      <TableCell>总金额</TableCell>
                      <TableCell align="right">操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTransactions.map((item, index) => (
                      <TableRow key={`${item.isHistorical ? 'historical' : 'current'}-${item.code}-${item.transactionIndex}-${index}`}>
                        <TableCell>{item.code}</TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>
                          {item.isHistorical ? (
                            <Chip label="已删除自选" size="small" color="default" />
                          ) : (
                            <Chip label="当前持仓" size="small" color="primary" />
                          )}
                        </TableCell>
                        <TableCell>{item.transaction.time}</TableCell>
                        <TableCell>{Math.floor(item.transaction.quantity).toLocaleString()}</TableCell>
                        <TableCell>{formatPriceFixed(item.transaction.price)}</TableCell>
                        <TableCell>{(item.transaction.quantity * item.transaction.price).toFixed(2)}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditingHistoryTransaction({
                                code: item.code,
                                isHistorical: item.isHistorical,
                                historicalIndex: item.historicalIndex,
                                transactionIndex: item.transactionIndex,
                                transaction: item.transaction,
                              });
                              setHistoryEditForm({
                                time: item.transaction.time,
                                quantity: item.transaction.quantity.toString(),
                                price: item.transaction.price.toString(),
                              });
                            }}
                            sx={{ color: '#1976d2' }}
                          >
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => setDeletingHistoryTransaction({ 
                              code: item.code,
                              isHistorical: item.isHistorical,
                              historicalIndex: item.historicalIndex, 
                              transactionIndex: item.transactionIndex 
                            })}
                            sx={{ color: 'error.main' }}
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography sx={{ mt: 2, textAlign: 'center', color: 'text.secondary' }}>
                {allTransactions.length > 0 ? '没有符合条件的交易记录' : '暂无交易记录'}
              </Typography>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseHistoryDialog}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 编辑交易对话框 */}
      <Dialog open={!!editingHistoryTransaction} onClose={() => setEditingHistoryTransaction(null)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑交易记录</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="交易时间"
              type="datetime-local"
              fullWidth
              variant="outlined"
              value={historyEditForm.time ? (() => {
                try {
                  const date = new Date(historyEditForm.time);
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
                  setHistoryEditForm({ ...historyEditForm, time: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}` });
                }
              }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="数量（股）"
              type="number"
              fullWidth
              variant="outlined"
              value={historyEditForm.quantity}
              onChange={(e) => setHistoryEditForm({ ...historyEditForm, quantity: e.target.value })}
              inputProps={{ min: 1, step: 1 }}
            />
            <TextField
              label="单价"
              type="number"
              fullWidth
              variant="outlined"
              value={historyEditForm.price}
              onChange={(e) => setHistoryEditForm({ ...historyEditForm, price: e.target.value })}
              inputProps={{ min: 0, step: 0.001 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingHistoryTransaction(null)}>取消</Button>
          <Button
            onClick={() => {
              if (!editingHistoryTransaction) return;
              const { code, isHistorical, historicalIndex, transactionIndex } = editingHistoryTransaction;
              const quantity = parseFloat(historyEditForm.quantity);
              const price = parseFloat(historyEditForm.price);

              if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0 || !historyEditForm.time) {
                return;
              }

              const newTransaction: Transaction = {
                time: historyEditForm.time,
                quantity: quantity,
                price: price,
              };

              if (isHistorical) {
                // 编辑历史交易
                const newHistoricalHoldings = [...(config.historical_holdings || [])];
                if (historicalIndex !== undefined && newHistoricalHoldings[historicalIndex]) {
                  newHistoricalHoldings[historicalIndex].transactions[transactionIndex] = newTransaction;
                  const newConfig = {
                    ...config,
                    historical_holdings: newHistoricalHoldings,
                  };
                  saveHoldingsConfig(newConfig).then(() => {
                    onConfigUpdate(newConfig);
                    setEditingHistoryTransaction(null);
                    setHistoryEditForm({ time: '', quantity: '', price: '' });
                  });
                }
              } else {
                // 编辑当前持仓的交易
                const holding = config.holdings[code];
                if (holding) {
                  const oldTransaction = holding.transactions[transactionIndex];
                  // 计算修改前后的金额差额
                  const oldAmount = oldTransaction.quantity * oldTransaction.price;
                  const newAmount = quantity * price;
                  const amountDiff = oldAmount - newAmount;

                  const newTransactions = [...holding.transactions];
                  newTransactions[transactionIndex] = newTransaction;

                  const newAvailableFunds = config.funds.available_funds + amountDiff;

                  const newConfig = {
                    ...config,
                    funds: {
                      ...config.funds,
                      available_funds: Math.max(0, newAvailableFunds),
                    },
                    holdings: {
                      ...config.holdings,
                      [code]: {
                        ...holding,
                        transactions: newTransactions,
                      },
                    },
                  };

                  saveHoldingsConfig(newConfig).then(() => {
                    onConfigUpdate(newConfig);
                    setEditingHistoryTransaction(null);
                    setHistoryEditForm({ time: '', quantity: '', price: '' });
                  });
                }
              }
            }}
            variant="contained"
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除历史交易确认对话框 */}
      <Dialog open={!!deletingHistoryTransaction} onClose={() => setDeletingHistoryTransaction(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>确定要删除这条交易记录吗？此操作不可恢复。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingHistoryTransaction(null)}>取消</Button>
          <Button
            onClick={() => {
              if (!deletingHistoryTransaction) return;
              const { code, isHistorical, historicalIndex, transactionIndex } = deletingHistoryTransaction;
              
              if (isHistorical) {
                // 删除历史交易
                const newHistoricalHoldings = [...(config.historical_holdings || [])];
                if (historicalIndex !== undefined && newHistoricalHoldings[historicalIndex]) {
                  newHistoricalHoldings[historicalIndex].transactions.splice(transactionIndex, 1);
                  
                  // 如果该历史持仓没有交易记录了，删除整个历史持仓
                  if (newHistoricalHoldings[historicalIndex].transactions.length === 0) {
                    newHistoricalHoldings.splice(historicalIndex, 1);
                  }

                  const newConfig = {
                    ...config,
                    historical_holdings: newHistoricalHoldings.length > 0 ? newHistoricalHoldings : undefined,
                  };

                  saveHoldingsConfig(newConfig).then(() => {
                    onConfigUpdate(newConfig);
                    setDeletingHistoryTransaction(null);
                  });
                }
              } else {
                // 删除当前持仓的交易
                const holding = config.holdings[code];
                if (holding) {
                  const transaction = holding.transactions[transactionIndex];
                  const transactionAmount = transaction.quantity * transaction.price;

                  const newTransactions = [...holding.transactions];
                  newTransactions.splice(transactionIndex, 1);

                  // 删除交易时，退回资金（增加可用资金）
                  const newAvailableFunds = config.funds.available_funds + transactionAmount;

                  const newConfig = {
                    ...config,
                    funds: {
                      ...config.funds,
                      available_funds: newAvailableFunds,
                    },
                    holdings: {
                      ...config.holdings,
                      [code]: {
                        ...holding,
                        transactions: newTransactions,
                      },
                    },
                  };

                  saveHoldingsConfig(newConfig).then(() => {
                    onConfigUpdate(newConfig);
                    setDeletingHistoryTransaction(null);
                  });
                }
              }
            }}
            variant="contained"
            color="error"
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
