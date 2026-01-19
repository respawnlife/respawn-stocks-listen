import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Chip } from '@mui/material';
import { Add, ShoppingCart, AccountBalance, History, Edit, Delete } from '@mui/icons-material';
import { getRealtimePrice } from '../services/stockData';
import { HoldingsConfig, Transaction } from '../types';
import { loadHoldingsConfig } from '../services/storage';
import { formatPriceFixed } from '../utils/calculations';
import { loadAllHoldingsTransactions, updateTransaction, deleteTransaction } from '../services/indexedDB';

interface ActionBarProps {
  config: HoldingsConfig;
  onConfigUpdate: (newConfig: HoldingsConfig) => Promise<void>;
  onStockAdded?: (code: string) => void;
  stockStates?: Map<string, { name: string; last_price: number | null }>;
  onOpenTransactionDialog?: (fn: (stockCode?: string) => void) => void;
  onOpenAllTransactionsDialog?: (fn: (stockCode?: string) => void) => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({ config, onConfigUpdate, onStockAdded, stockStates, onOpenTransactionDialog, onOpenAllTransactionsDialog }) => {
  // 用于存储所有交易记录（包括历史持仓）
  const [allTransactionsData, setAllTransactionsData] = useState<{ [code: string]: Transaction[] }>({});
  
  // 加载所有交易记录
  useEffect(() => {
    const loadTransactions = async () => {
      const transactions = await loadAllHoldingsTransactions();
      setAllTransactionsData(transactions);
    };
    loadTransactions();
  }, [config]);
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
  const [transactionTotalAmount, setTransactionTotalAmount] = useState('');
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionError, setTransactionError] = useState<string>('');
  const [transactionStockValidated, setTransactionStockValidated] = useState(false);

  // 增减本金相关状态
  const [openFundsDialog, setOpenFundsDialog] = useState(false);
  const [fundsAmount, setFundsAmount] = useState('');
  const [fundsOperation, setFundsOperation] = useState<'add' | 'subtract'>('add');
  
  // 增减可用资金相关状态
  const [openAvailableFundsDialog, setOpenAvailableFundsDialog] = useState(false);
  const [availableFundsAmount, setAvailableFundsAmount] = useState('');
  const [availableFundsOperation, setAvailableFundsOperation] = useState<'add' | 'subtract'>('add');

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
    totalAmount: string;
  }>({ time: '', quantity: '', totalAmount: '' });
  
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
      // 获取当前时间作为添加时间
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const addTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      
      const newConfig = {
        ...config,
        watchlist: {
          ...config.watchlist,
          [code]: {
            alert_up: null,
            alert_down: null,
            add_time: addTime,
          },
        },
      };

      await onConfigUpdate(newConfig);
      
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

  // 计算单价（总金额 / |数量|）
  const calculatedPrice = useMemo(() => {
    const quantity = parseFloat(transactionQuantity);
    const totalAmount = parseFloat(transactionTotalAmount);
    if (isNaN(quantity) || quantity === 0 || isNaN(totalAmount) || totalAmount <= 0) {
      return null;
    }
    return totalAmount / Math.abs(quantity);
  }, [transactionQuantity, transactionTotalAmount]);

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
    } else {
      setTransactionStockCode('');
      setTransactionStockCodeInput('');
      setTransactionStockValidated(false);
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
    setTransactionTotalAmount('');
    setTransactionError('');
    setTransactionStockValidated(false);
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
            add_time: new Date().toISOString().replace('T', ' ').substring(0, 19), // 当前时间
          },
        },
      };

      await onConfigUpdate(newConfig);
      
      if (onStockAdded) {
        onStockAdded(code);
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
    if (isNaN(quantity) || quantity === 0) {
      setTransactionError('请输入有效的交易数量（不能为0）');
      return;
    }

    const totalAmount = parseFloat(transactionTotalAmount);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      setTransactionError('请输入有效的总金额');
      return;
    }

    // 自动计算单价：总金额 / |数量|
    const price = totalAmount / Math.abs(quantity);

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

    // 如果是卖出（负数），检查当前持仓是否足够
    if (quantity < 0) {
      // 计算当前持仓数量
      let currentQuantity = 0;
      for (const trans of existingTransactions) {
        currentQuantity += Number(trans.quantity) || 0;
      }
      
      // 检查卖出后持仓是否会变成负数
      const newQuantity = currentQuantity + quantity; // quantity是负数
      if (newQuantity < 0) {
        setTransactionError(`持仓不足，当前持仓：${currentQuantity.toFixed(0)}，无法卖出 ${Math.abs(quantity).toFixed(0)}`);
        return;
      }
    }

    const newTransaction: Transaction = {
      time: transactionTime,
      quantity: quantity,
      price: price,
      totalAmount: totalAmount,
    };

    // 计算资金变化
    // 买入（正数）：减少可用资金
    // 卖出（负数）：增加可用资金
    const newAvailableFunds = quantity > 0 
      ? config.funds.available_funds - totalAmount  // 买入减少资金
      : config.funds.available_funds + totalAmount;  // 卖出增加资金

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

    onConfigUpdate(newConfig).then(() => {
      handleCloseTransaction();
    }).catch((error) => {
      console.error('保存交易失败:', error);
      setTransactionError('保存交易失败，请重试');
    });
  };


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

    onConfigUpdate(newConfig).then(() => {
      handleCloseFundsDialog();
    });
  };

  // 处理打开增减可用资金对话框
  const handleOpenAvailableFundsDialog = () => {
    setOpenAvailableFundsDialog(true);
    setAvailableFundsAmount('');
    setAvailableFundsOperation('add');
  };

  // 处理关闭增减可用资金对话框
  const handleCloseAvailableFundsDialog = () => {
    setOpenAvailableFundsDialog(false);
    setAvailableFundsAmount('');
    setAvailableFundsOperation('add');
  };

  // 处理提交增减可用资金
  const handleSubmitAvailableFunds = () => {
    const amount = parseFloat(availableFundsAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    let newAvailableFunds = config.funds.available_funds;

    if (availableFundsOperation === 'add') {
      // 增加可用资金
      newAvailableFunds += amount;
    } else {
      // 减少可用资金（但不能低于0）
      newAvailableFunds = Math.max(0, newAvailableFunds - amount);
    }

    const newConfig = {
      ...config,
      funds: {
        ...config.funds,
        available_funds: newAvailableFunds,
      },
    };

    onConfigUpdate(newConfig).then(() => {
      handleCloseAvailableFundsDialog();
    });
  };

  return (
    <>
      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            variant="outlined"
            color="secondary"
            size="small"
            startIcon={<AccountBalance />}
            onClick={handleOpenFundsDialog}
          >
            增减本金
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            size="small"
            startIcon={<AccountBalance />}
            onClick={handleOpenAvailableFundsDialog}
          >
            增减可用资金
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<Add />}
            onClick={handleOpen}
          >自选
          </Button>
          <Button
            variant="contained"
            color="secondary"
            size="small"
            startIcon={<Add />}
            onClick={() => handleOpenTransaction()}
          >交易
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<History />}
            onClick={() => setOpenHistoryDialog(true)}
          >
            交易列表
          </Button>
        </Box>
      </Box>

      {/* 添加自选股对话框 */}
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>添加自选股</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <TextField
            autoFocus
            size="small"
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
            helperText={error || '请输入股票代码'}
            disabled={loading}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !loading) {
                handleAdd();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={handleClose} disabled={loading}>
            取消
          </Button>
          <Button size="small" onClick={handleAdd} variant="contained" disabled={loading}>
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
            <FormControl fullWidth size="small">
              <InputLabel>股票代码</InputLabel>
              <Select
                value={transactionStockCode}
                label="股票代码"
                onChange={(e) => {
                  const selectedCode = e.target.value;
                  setTransactionStockCode(selectedCode);
                  setTransactionStockCodeInput('');
                  setTransactionError('');
                  // 如果是从自选/持仓中选择的，直接设置为已验证状态
                  if (selectedCode && getAllStockCodes().includes(selectedCode)) {
                    setTransactionStockValidated(true);
                  } else {
                    setTransactionStockValidated(false);
                  }
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
              label="或输入新代码"
              size="small"
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
              helperText={transactionStockCode ? '已选择' : '输入后需验证'}
            />

            {!transactionStockValidated && transactionStockCodeInput && (
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
                  onChange={(e) => {
                    const value = e.target.value;
                    // 允许负数、小数和空字符串
                    if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
                      setTransactionQuantity(value);
                    }
                  }}
                  inputProps={{ step: 1 }}
                  helperText="正数为买入，负数为卖出（如：-100表示卖出100股）"
                />

                <TextField
                  label="总金额"
                  type="number"
                  fullWidth
                  required
                  variant="outlined"
                  value={transactionTotalAmount}
                  onChange={(e) => setTransactionTotalAmount(e.target.value)}
                  inputProps={{ min: 0, step: 0.01 }}
                  helperText="由于券商计算规则复杂，请手动输入（包含所有费用）"
                />

                {calculatedPrice !== null && (
                  <TextField
                    label="单价（自动计算）"
                    type="number"
                    fullWidth
                    variant="outlined"
                    value={calculatedPrice.toFixed(3)}
                    InputProps={{ readOnly: true }}
                    helperText={`总金额 ÷ |数量| = ${calculatedPrice.toFixed(3)}`}
                  />
                )}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={handleCloseTransaction} disabled={transactionLoading}>
            取消
          </Button>
          <Button
            size="small"
            onClick={handleSubmitTransaction}
            variant="contained"
            disabled={transactionLoading || !transactionStockValidated}
          >
            提交
          </Button>
        </DialogActions>
      </Dialog>

      {/* 增减本金对话框 */}
      <Dialog open={openFundsDialog} onClose={handleCloseFundsDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>增减本金</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
                <Typography variant="body2" sx={{ color: '#856404', fontSize: '0.75rem' }}>
                  当前本金：{config.funds.total_original_funds.toFixed(2)} | 可用：{config.funds.available_funds.toFixed(2)}
                  <br />
                  减少后本金：{Math.max(0, config.funds.total_original_funds - (parseFloat(fundsAmount) || 0)).toFixed(2)} | 可用：{Math.max(0, config.funds.available_funds - (parseFloat(fundsAmount) || 0)).toFixed(2)}
                </Typography>
              </Box>
            )}
            {fundsOperation === 'add' && (
              <Box sx={{ p: 1, backgroundColor: '#d1ecf1', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ color: '#0c5460', fontSize: '0.75rem' }}>
                  当前本金：{config.funds.total_original_funds.toFixed(2)} | 可用：{config.funds.available_funds.toFixed(2)}
                  <br />
                  增加后本金：{(config.funds.total_original_funds + (parseFloat(fundsAmount) || 0)).toFixed(2)} | 可用：{(config.funds.available_funds + (parseFloat(fundsAmount) || 0)).toFixed(2)}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={handleCloseFundsDialog}>取消</Button>
          <Button
            size="small"
            onClick={handleSubmitFunds}
            variant="contained"
            disabled={!fundsAmount || parseFloat(fundsAmount) <= 0}
          >
            确认
          </Button>
        </DialogActions>
      </Dialog>

      {/* 增减可用资金对话框 */}
      <Dialog open={openAvailableFundsDialog} onClose={handleCloseAvailableFundsDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>增减可用资金</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>操作类型</InputLabel>
              <Select
                value={availableFundsOperation}
                label="操作类型"
                onChange={(e) => setAvailableFundsOperation(e.target.value as 'add' | 'subtract')}
              >
                <MenuItem value="add">增加可用资金</MenuItem>
                <MenuItem value="subtract">减少可用资金</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="金额"
              type="number"
              fullWidth
              variant="outlined"
              value={availableFundsAmount}
              onChange={(e) => setAvailableFundsAmount(e.target.value)}
              inputProps={{ min: 0, step: 0.01 }}
              helperText={availableFundsOperation === 'add' ? '增加可用资金（不影响本金）' : '减少可用资金（不影响本金）'}
            />
            {availableFundsOperation === 'subtract' && (
              <Box sx={{ p: 1, backgroundColor: '#fff3cd', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ color: '#856404', fontSize: '0.75rem' }}>
                  当前可用资金：{config.funds.available_funds.toFixed(2)}
                  <br />
                  减少后可用资金：{Math.max(0, config.funds.available_funds - (parseFloat(availableFundsAmount) || 0)).toFixed(2)}
                </Typography>
              </Box>
            )}
            {availableFundsOperation === 'add' && (
              <Box sx={{ p: 1, backgroundColor: '#d1ecf1', borderRadius: 1 }}>
                <Typography variant="body2" sx={{ color: '#0c5460', fontSize: '0.75rem' }}>
                  当前可用资金：{config.funds.available_funds.toFixed(2)}
                  <br />
                  增加后可用资金：{(config.funds.available_funds + (parseFloat(availableFundsAmount) || 0)).toFixed(2)}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={handleCloseAvailableFundsDialog}>取消</Button>
          <Button
            size="small"
            onClick={handleSubmitAvailableFunds}
            variant="contained"
            disabled={!availableFundsAmount || parseFloat(availableFundsAmount) <= 0}
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
              color="secondary"
              startIcon={<Add />}
              onClick={() => {
                setOpenHistoryDialog(false);
                // 如果当前有筛选的股票代码，直接传入
                const presetCode = filterStockCode || filterStockCodeInput.trim().toUpperCase() || undefined;
                handleOpenTransaction(presetCode);
              }}
              size="small"
            >
              交易
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* 筛选区域 - 紧凑型横向布局 */}
          <Box sx={{ mt: 1, mb: 1, p: 1, border: '1px solid #e0e0e0', borderRadius: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* 股票筛选 */}
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>股票</InputLabel>
                <Select
                  value={filterStockCode}
                  label="股票"
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
              <Typography variant="body2" sx={{ mx: 0.5 }}>或</Typography>
              <TextField
                label="代码"
                size="small"
                value={filterStockCodeInput}
                onChange={(e) => {
                  setFilterStockCodeInput(e.target.value.toUpperCase());
                  setFilterStockCode('');
                }}
                placeholder="代码"
                sx={{ width: 100 }}
              />
              
              {/* 交易时间筛选 */}
              <TextField
                label="开始日期"
                type="date"
                size="small"
                value={filterTimeStart}
                onChange={(e) => setFilterTimeStart(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
              <Typography variant="body2" sx={{ mx: 0.5 }}>至</Typography>
              <TextField
                label="结束日期"
                type="date"
                size="small"
                value={filterTimeEnd}
                onChange={(e) => setFilterTimeEnd(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150 }}
              />
              
              {/* 总金额筛选 */}
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <InputLabel>金额</InputLabel>
                <Select
                  value={filterAmountOperator}
                  label="金额"
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
                size="small"
                value={filterAmountValue}
                onChange={(e) => setFilterAmountValue(e.target.value)}
                placeholder="金额"
                sx={{ width: 120 }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setFilterStockCode('');
                  setFilterStockCodeInput('');
                  setFilterTimeStart('');
                  setFilterTimeEnd('');
                  setFilterAmountOperator('gt');
                  setFilterAmountValue('');
                }}
              >
                清除
              </Button>
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

            // 添加历史持仓中的交易（有交易记录但不在 holdings 中的股票）
            // 历史持仓现在通过 watchlist 和 transactions 表管理
            // 查找在 watchlist 中但不在 holdings 中的股票，它们就是历史持仓
            const holdingsCodes = new Set(Object.keys(config.holdings || {}));
            for (const [code, watchlistItem] of Object.entries(config.watchlist || {})) {
              if (!holdingsCodes.has(code)) {
                // 不在 holdings 中，检查是否有交易记录
                const transactions = allTransactionsData[code] || [];
                const validTransactions = Array.isArray(transactions) ? transactions : [];
                if (validTransactions.length > 0) {
                  // 有交易记录，是历史持仓
                  const stockName = stockStates?.get(code)?.name || code;
                  validTransactions.forEach((transaction, transactionIndex) => {
                    allTransactions.push({
                      code,
                      name: stockName,
                      transaction,
                      isHistorical: true,
                      transactionIndex,
                    });
                  });
                }
              }
            }

            // 应用筛选
            let filteredTransactions = allTransactions;
            
            // 股票筛选
            const filterCode = filterStockCode || filterStockCodeInput.trim().toUpperCase();
            if (filterCode) {
              filteredTransactions = filteredTransactions.filter(item => item.code === filterCode);
            }
            
            // 时间筛选（按天筛选，不包含时分秒）
            if (filterTimeStart) {
              const startDate = new Date(filterTimeStart);
              startDate.setHours(0, 0, 0, 0); // 设置为当天的开始时间（00:00:00）
              const startTime = startDate.getTime();
              filteredTransactions = filteredTransactions.filter(item => {
                const itemDate = new Date(item.transaction.time);
                itemDate.setHours(0, 0, 0, 0); // 设置为当天的开始时间
                return itemDate.getTime() >= startTime;
              });
            }
            if (filterTimeEnd) {
              const endDate = new Date(filterTimeEnd);
              endDate.setHours(23, 59, 59, 999); // 设置为当天的结束时间（23:59:59.999）
              const endTime = endDate.getTime();
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
                      <TableCell>ID</TableCell>
                      <TableCell>股票代码</TableCell>
                      <TableCell>股票名称</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>交易时间</TableCell>
                      <TableCell>类型</TableCell>
                      <TableCell>数量（股）</TableCell>
                      <TableCell>单价</TableCell>
                      <TableCell>总金额</TableCell>
                      <TableCell align="right">操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTransactions.map((item, index) => {
                      const isBuy = item.transaction.quantity > 0;
                      const totalAmount = item.transaction.totalAmount ?? (Math.abs(item.transaction.quantity) * item.transaction.price);
                      
                      return (
                        <TableRow key={`${item.isHistorical ? 'historical' : 'current'}-${item.code}-${item.transactionIndex}-${index}`}>
                          <TableCell>{item.transaction.id || '--'}</TableCell>
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
                          <TableCell>
                            <Chip 
                              label={isBuy ? '买入' : '卖出'} 
                              size="small" 
                              color={isBuy ? 'primary' : 'secondary'}
                            />
                          </TableCell>
                          <TableCell>{Math.floor(Math.abs(item.transaction.quantity)).toLocaleString()}</TableCell>
                          <TableCell>{formatPriceFixed(item.transaction.price)}</TableCell>
                          <TableCell>{totalAmount.toFixed(2)}</TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              onClick={() => {
                                const totalAmount = item.transaction.totalAmount ?? (Math.abs(item.transaction.quantity) * item.transaction.price);
                                setEditingHistoryTransaction({
                                  code: item.code,
                                  isHistorical: item.isHistorical,
                                  transactionIndex: item.transactionIndex,
                                  transaction: item.transaction,
                                });
                                setHistoryEditForm({
                                  time: item.transaction.time,
                                  quantity: item.transaction.quantity.toString(),
                                  totalAmount: totalAmount.toString(),
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
                                transactionIndex: item.transactionIndex 
                              })}
                              sx={{ color: 'error.main' }}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
              size="small"
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
              size="small"
              fullWidth
              variant="outlined"
              value={historyEditForm.quantity}
              onChange={(e) => {
                const value = e.target.value;
                // 允许负数、小数和空字符串
                if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
                  setHistoryEditForm({ ...historyEditForm, quantity: value });
                }
              }}
              inputProps={{ step: 1 }}
              helperText="正数为买入，负数为卖出"
            />
            <TextField
              label="总金额"
              type="number"
              size="small"
              fullWidth
              required
              variant="outlined"
              value={historyEditForm.totalAmount}
              onChange={(e) => setHistoryEditForm({ ...historyEditForm, totalAmount: e.target.value })}
              inputProps={{ min: 0, step: 0.01 }}
              helperText="由于券商计算规则复杂，请手动输入（包含所有费用）"
            />
            {(() => {
              const quantity = parseFloat(historyEditForm.quantity);
              const totalAmount = parseFloat(historyEditForm.totalAmount);
              const calculatedPrice = (!isNaN(quantity) && quantity !== 0 && !isNaN(totalAmount) && totalAmount > 0)
                ? totalAmount / Math.abs(quantity)
                : null;
              return calculatedPrice !== null ? (
                <TextField
                  label="单价（自动计算）"
                  type="number"
                  size="small"
                  fullWidth
                  variant="outlined"
                  value={calculatedPrice.toFixed(3)}
                  InputProps={{ readOnly: true }}
                  helperText={`总金额 ÷ |数量| = ${calculatedPrice.toFixed(3)}`}
                />
              ) : null;
            })()}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={() => setEditingHistoryTransaction(null)}>取消</Button>
          <Button
            onClick={async () => {
              if (!editingHistoryTransaction) return;
              const { code, isHistorical, transactionIndex } = editingHistoryTransaction;
              const quantity = parseFloat(historyEditForm.quantity);
              const totalAmount = parseFloat(historyEditForm.totalAmount);

              if (isNaN(quantity) || quantity === 0 || isNaN(totalAmount) || totalAmount <= 0 || !historyEditForm.time) {
                return;
              }

              // 自动计算单价：总金额 / |数量|
              const price = totalAmount / Math.abs(quantity);

              // 如果是卖出（负数），检查修改后的持仓是否足够（仅对当前持仓的交易检查）
              if (quantity < 0 && !isHistorical) {
                const holding = config.holdings[code];
                if (holding) {
                  const transactions = Array.isArray(holding.transactions) ? holding.transactions : [];
                  // 计算除了当前编辑交易之外的其他交易的总数量
                  let otherQuantity = 0;
                  for (let i = 0; i < transactions.length; i++) {
                    if (i !== transactionIndex) {
                      otherQuantity += Number(transactions[i].quantity) || 0;
                    }
                  }
                  // 检查修改后的持仓是否会变成负数
                  const newQuantity = otherQuantity + quantity; // quantity是负数
                  if (newQuantity < 0) {
                    alert(`持仓不足，修改后持仓：${newQuantity.toFixed(0)}，无法卖出 ${Math.abs(quantity).toFixed(0)}`);
                    return;
                  }
                }
              }

              const newTransaction: Transaction = {
                id: editingHistoryTransaction.transaction.id, // 保留ID
                time: historyEditForm.time,
                quantity: quantity,
                price: price,
                totalAmount: totalAmount,
              };

              if (isHistorical) {
                // 编辑历史交易（历史持仓现在通过 watchlist 和 transactions 表管理）
                // 需要更新 transactions 表中的记录
                const transactions = allTransactionsData[code] || [];
                const transaction = transactions[transactionIndex];
                if (transaction && transaction.id) {
                  // 更新 transactions 表中的记录
                  await updateTransaction(transaction.id, {
                    code,
                    time: historyEditForm.time,
                    quantity: quantity,
                    price: price,
                    totalAmount: totalAmount,
                  });
                  // 重新加载配置并保存
                  const newConfig = await loadHoldingsConfig();
                  await onConfigUpdate(newConfig);
                  setEditingHistoryTransaction(null);
                  setHistoryEditForm({ time: '', quantity: '', totalAmount: '' });
                  // 重新加载交易数据
                  const updatedTransactions = await loadAllHoldingsTransactions();
                  setAllTransactionsData(updatedTransactions);
                }
              } else {
                // 编辑当前持仓的交易
                const holding = config.holdings[code];
                if (holding) {
                  const oldTransaction = holding.transactions[transactionIndex];
                  // 计算资金变化：买入减少资金，卖出增加资金
                  const oldTotalAmount = oldTransaction.totalAmount ?? (Math.abs(oldTransaction.quantity) * oldTransaction.price);
                  const oldTransactionAmount = oldTransaction.quantity > 0 ? -oldTotalAmount : oldTotalAmount; // 买入为负，卖出为正
                  const newTransactionAmount = quantity > 0 ? -totalAmount : totalAmount; // 买入为负，卖出为正
                  const amountDiff = oldTransactionAmount - newTransactionAmount; // 资金变化量

                  const newTransactions = [...holding.transactions];
                  // 保留原有交易的ID
                  newTransactions[transactionIndex] = {
                    id: oldTransaction.id,
                    time: historyEditForm.time,
                    quantity: quantity,
                    price: price,
                    totalAmount: totalAmount,
                  };

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

                  onConfigUpdate(newConfig).then(() => {
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
            onClick={async () => {
              if (!deletingHistoryTransaction) return;
              const { code, isHistorical, transactionIndex } = deletingHistoryTransaction;
              
              if (isHistorical) {
                // 删除历史交易（历史持仓现在通过 watchlist 和 transactions 表管理）
                const transactions = allTransactionsData[code] || [];
                const transaction = transactions[transactionIndex];
                if (transaction && transaction.id) {
                  // 从 transactions 表中删除记录
                  await deleteTransaction(transaction.id);
                  // 重新加载配置并保存
                  const newConfig = await loadHoldingsConfig();
                  await onConfigUpdate(newConfig);
                  setDeletingHistoryTransaction(null);
                  // 重新加载交易数据
                  const updatedTransactions = await loadAllHoldingsTransactions();
                  setAllTransactionsData(updatedTransactions);
                }
              } else {
                // 删除当前持仓的交易
                const holding = config.holdings[code];
                if (holding) {
                  const transaction = holding.transactions[transactionIndex];
                  // 使用 totalAmount（如果存在），否则使用 quantity * price
                  const transactionAmount = transaction.totalAmount ?? (Math.abs(transaction.quantity) * transaction.price);
                  
                  // 删除交易时，根据交易类型恢复资金
                  // 买入（正数）：删除时退回资金（增加可用资金）
                  // 卖出（负数）：删除时扣回资金（减少可用资金）
                  const newAvailableFunds = transaction.quantity > 0
                    ? config.funds.available_funds + transactionAmount  // 买入删除，退回资金
                    : config.funds.available_funds - transactionAmount; // 卖出删除，扣回资金

                  // 如果交易有ID，从 transactions 表中删除
                  if (transaction.id) {
                    await deleteTransaction(transaction.id);
                  }

                  const newTransactions = [...holding.transactions];
                  newTransactions.splice(transactionIndex, 1);

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

                  onConfigUpdate(newConfig).then(() => {
                    setDeletingHistoryTransaction(null);
                  });
                }
              }
            }}
            size="small"
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
