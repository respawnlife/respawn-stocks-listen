import React, { useState, Suspense, lazy } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Collapse,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import {
  Edit,
  Delete,
  Add,
  Remove,
} from '@mui/icons-material';
import { StockState, Transaction, HoldingsConfig } from '../types';
import { formatPriceFixed, formatPrice } from '../utils/calculations';
// saveHoldingsConfig 现在通过 onConfigUpdate 统一处理

// 动态导入 KlineChart 组件（包含大型图表库，按需加载）
const KlineChart = lazy(() => import('./KlineChart').then(module => ({ default: module.KlineChart })));

interface StockTableProps {
  stocks: StockState[];
  privacyMode: boolean;
  config: HoldingsConfig;
  onConfigUpdate: (newConfig: HoldingsConfig) => Promise<void>;
  onAddTransaction?: (stockCode: string) => void;
  onOpenAllTransactionsDialog?: (stockCode?: string) => void;
}

export const StockTable: React.FC<StockTableProps> = ({ stocks, privacyMode, config, onConfigUpdate, onAddTransaction, onOpenAllTransactionsDialog }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingTransaction, setEditingTransaction] = useState<{
    stockCode: string;
    index: number;
    transaction: Transaction;
  } | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<{
    stockCode: string;
    index: number;
  } | null>(null);
  const [deletingStock, setDeletingStock] = useState<string | null>(null);
  const [deleteOption, setDeleteOption] = useState<'refund' | 'keep'>('refund');
  const [editingAlert, setEditingAlert] = useState<{
    stockCode: string;
    alerts: Array<{ type: 'up' | 'down'; price: string }>;
  } | null>(null);
  const [klineChartOpen, setKlineChartOpen] = useState<{
    stockCode: string;
    stockName: string;
  } | null>(null);
  const [editForm, setEditForm] = useState<{
    time: string;
    quantity: string;
    totalAmount: string;
  }>({ time: '', quantity: '', totalAmount: '' });
  const formatPrivacyValue = (value: any): string => {
    if (privacyMode) {
      return '***';
    }
    if (value === null || value === undefined) {
      return '--';
    }
    return String(value);
  };

  const getChangeColor = (changePct: number): 'success' | 'error' | 'default' => {
    if (changePct > 0) return 'error'; // 红色表示上涨
    if (changePct < 0) return 'success'; // 绿色表示下跌
    return 'default';
  };

  const getProfitColor = (profit: number | null): 'success' | 'error' | 'default' => {
    if (profit === null) return 'default';
    if (profit > 0) return 'error'; // 红色表示盈利
    if (profit < 0) return 'success'; // 绿色表示亏损
    return 'default';
  };

  // 格式化更新时间：只显示时分秒，不显示毫秒
  const formatUpdateTime = (timeStr: string | null | undefined): string => {
    if (!timeStr || timeStr === '--') return '--';
    // 如果时间字符串包含毫秒（例如：14:05:23.123 或 2026-01-16 14:05:23.123），则去掉毫秒部分
    if (timeStr.includes('.')) {
      const withoutMs = timeStr.split('.')[0];
      // 如果包含日期部分，只取时分秒部分
      if (withoutMs.includes(' ')) {
        return withoutMs.split(' ')[1] || withoutMs;
      }
      return withoutMs;
    }
    // 如果包含日期部分，只取时分秒部分
    if (timeStr.includes(' ')) {
      return timeStr.split(' ')[1] || timeStr;
    }
    return timeStr;
  };

  const toggleRow = (code: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(code)) {
      newExpanded.delete(code);
    } else {
      newExpanded.add(code);
    }
    setExpandedRows(newExpanded);
  };

  const handleEditTransaction = (stockCode: string, index: number, transaction: Transaction) => {
    setEditingTransaction({ stockCode, index, transaction });
    // 如果有总金额，使用总金额；否则使用 price * |quantity|
    const totalAmount = transaction.totalAmount ?? (Math.abs(transaction.quantity) * transaction.price);
    setEditForm({
      time: transaction.time,
      quantity: transaction.quantity.toString(),
      totalAmount: totalAmount.toString(),
    });
  };

  const handleSaveEdit = () => {
    if (!editingTransaction) return;

    const { stockCode, index, transaction: oldTransaction } = editingTransaction;
    const quantity = parseFloat(editForm.quantity);
    const totalAmount = parseFloat(editForm.totalAmount);

    if (isNaN(quantity) || quantity === 0 || isNaN(totalAmount) || totalAmount <= 0 || !editForm.time) {
      return;
    }

    // 自动计算单价：总金额 / |数量|
    const price = totalAmount / Math.abs(quantity);

    // 如果是卖出（负数），检查修改后的持仓是否足够
    if (quantity < 0) {
      const holding = config.holdings[stockCode];
      if (holding) {
        const transactions = Array.isArray(holding.transactions) ? holding.transactions : [];
        // 计算除了当前编辑交易之外的其他交易的总数量
        let otherQuantity = 0;
        for (let i = 0; i < transactions.length; i++) {
          if (i !== index) {
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

    const holding = config.holdings[stockCode];
    if (!holding) return;

    // 计算资金变化：买入减少资金，卖出增加资金
    const oldTotalAmount = oldTransaction.totalAmount ?? (Math.abs(oldTransaction.quantity) * oldTransaction.price);
    const oldTransactionAmount = oldTransaction.quantity > 0 ? -oldTotalAmount : oldTotalAmount; // 买入为负，卖出为正
    const newTransactionAmount = quantity > 0 ? -totalAmount : totalAmount; // 买入为负，卖出为正
    const amountDiff = oldTransactionAmount - newTransactionAmount; // 资金变化量

    const newTransactions = [...holding.transactions];
    // 保留原有交易的ID
    newTransactions[index] = {
      id: oldTransaction.id,
      time: editForm.time,
      quantity: quantity,
      price: price,
      totalAmount: totalAmount,
    };

    // 更新可用资金
    const newAvailableFunds = config.funds.available_funds + amountDiff;

    const newConfig = {
      ...config,
      funds: {
        ...config.funds,
        available_funds: Math.max(0, newAvailableFunds), // 确保不为负数
      },
      holdings: {
        ...config.holdings,
        [stockCode]: {
          ...holding,
          transactions: newTransactions,
        },
      },
    };

    onConfigUpdate(newConfig).then(() => {
      setEditingTransaction(null);
      setEditForm({ time: '', quantity: '', totalAmount: '' });
    });
  };

  const handleDeleteTransaction = (stockCode: string, index: number) => {
    setDeletingTransaction({ stockCode, index });
  };

  const handleConfirmDelete = async () => {
    if (!deletingTransaction) return;

    const { stockCode, index } = deletingTransaction;
    const holding = config.holdings[stockCode];
    if (!holding) return;

    // 获取要删除的交易记录
    const transactionToDelete = holding.transactions[index];
    const deletedAmount = transactionToDelete.totalAmount ?? (Math.abs(transactionToDelete.quantity) * transactionToDelete.price);

    // 如果交易有ID，从 transactions 表中删除
    if (transactionToDelete.id) {
      const { deleteTransaction } = await import('../services/indexedDB');
      await deleteTransaction(transactionToDelete.id);
    }

    const newTransactions = holding.transactions.filter((_, i) => i !== index);

    // 删除交易时，根据交易类型恢复资金
    // 买入（正数）：删除时退回资金（增加可用资金）
    // 卖出（负数）：删除时扣回资金（减少可用资金）
    const newAvailableFunds = transactionToDelete.quantity > 0
      ? config.funds.available_funds + deletedAmount  // 买入删除，退回资金
      : config.funds.available_funds - deletedAmount; // 卖出删除，扣回资金

    const newConfig = {
      ...config,
      funds: {
        ...config.funds,
        available_funds: newAvailableFunds,
      },
      holdings: {
        ...config.holdings,
        [stockCode]: {
          ...holding,
          transactions: newTransactions,
        },
      },
    };

    onConfigUpdate(newConfig).then(() => {
      setDeletingTransaction(null);
    });
  };

  const handleDeleteStock = (stockCode: string) => {
    setDeletingStock(stockCode);
  };

  const handleSaveAlert = () => {
    if (!editingAlert) return;

    const { stockCode, alerts } = editingAlert;
    
    // 验证并转换报警规则
    const validAlerts: Array<{ type: 'up' | 'down'; price: number }> = [];
    for (const alert of alerts) {
      const price = parseFloat(alert.price.trim());
      if (!isNaN(price) && price > 0) {
        validAlerts.push({
          type: alert.type,
          price: price,
        });
      }
    }

    const newConfig = { 
      ...config,
      holdings: { ...config.holdings },
      watchlist: { ...config.watchlist },
    };
    
    // 更新持仓或自选的报警配置
    if (newConfig.holdings[stockCode]) {
      // 是持仓，更新持仓的报警配置
      newConfig.holdings[stockCode] = {
        ...newConfig.holdings[stockCode],
        alerts: validAlerts.length > 0 ? validAlerts : undefined,
      };
    } else if (newConfig.watchlist[stockCode]) {
      // 是自选，更新自选的报警配置
      newConfig.watchlist[stockCode] = {
        ...newConfig.watchlist[stockCode],
        alerts: validAlerts.length > 0 ? validAlerts : undefined,
      };
    } else {
      // 既不在持仓也不在自选，添加到自选
      newConfig.watchlist[stockCode] = {
        alerts: validAlerts.length > 0 ? validAlerts : undefined,
      };
    }

    setEditingAlert(null);
    onConfigUpdate(newConfig);
  };

  const handleConfirmDeleteStock = () => {
    if (!deletingStock) return;

    const stockCode = deletingStock;
    const stock = stocks.find(s => s.code === stockCode);
    const stockName = stock?.name || stockCode;
    
    let totalRefundAmount = 0;
    let transactionsToMove: Transaction[] = [];

    // 检查是否在持仓中，如果在，计算所有交易记录的总金额
    if (config.holdings[stockCode]) {
      const holding = config.holdings[stockCode];
      transactionsToMove = holding.transactions;
      // 计算所有交易记录的总金额
      totalRefundAmount = holding.transactions.reduce(
        (sum, transaction) => sum + transaction.quantity * transaction.price,
        0
      );
    }

    // 创建新的配置，删除该股票
    const newHoldings = { ...config.holdings };
    delete newHoldings[stockCode];

    const newWatchlist = { ...config.watchlist };
    
    // 根据选项处理
    let newAvailableFunds = config.funds.available_funds;

    if (deleteOption === 'refund') {
      // 选项1：删除并退回所有交易
      newAvailableFunds = config.funds.available_funds + totalRefundAmount;
      // 从 watchlist 中删除（因为要删除交易记录）
      delete newWatchlist[stockCode];
      // 删除交易记录（从 transactions 表删除）
      // 注意：这里不需要手动删除，因为 onConfigUpdate 会调用 saveHoldingsConfig 来同步交易记录
    } else {
      // 选项2：删除但不退回交易
      // 保留在 watchlist 中（但不在 holdings 中），交易记录保留在 transactions 表中
      // 这样在加载时会被识别为历史持仓（有交易记录但不在 holdings 中的股票）
      // 如果股票不在 watchlist 中，添加到 watchlist
      if (!newWatchlist[stockCode]) {
        const holding = config.holdings[stockCode];
        newWatchlist[stockCode] = {
          alerts: holding?.alerts,
          alert_up: holding?.alert_up || null, // 向后兼容
          alert_down: holding?.alert_down || null, // 向后兼容
        };
      }
    }

    const newConfig = {
      ...config,
      funds: {
        ...config.funds,
        available_funds: newAvailableFunds,
      },
      holdings: newHoldings,
      watchlist: newWatchlist,
      // 历史持仓现在通过 watchlist 和 transactions 表管理，不需要单独的数组
      historical_holdings: [],
    };

    onConfigUpdate(newConfig).then(() => {
      setDeletingStock(null);
      setDeleteOption('refund'); // 重置选项
    });
  };

  return (
    <TableContainer component={Paper}>
      <Table size="small" sx={{ minWidth: 650 }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: '#1976d2' }}>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 140 }}>
              名称
            </TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 100 }}>
              代码
            </TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 80 }}>
              现价
            </TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 80 }}>
              涨跌幅
            </TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 80 }}>
              成本价
            </TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 80 }}>
              数量
            </TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 200 }}>
              盈亏
            </TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 140 }}>
              时间
            </TableCell>
            <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 100 }}>
              操作
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {stocks.map((stock) => {
            const holdingValue =
              stock.last_price !== null && stock.holding_quantity > 0
                ? stock.last_price * stock.holding_quantity
                : 0;

            const profit =
              stock.holding_price !== null &&
              stock.holding_quantity > 0 &&
              stock.last_price !== null
                ? (stock.last_price - stock.holding_price) * stock.holding_quantity
                : null;

            const profitPct =
              stock.holding_price !== null && stock.holding_price > 0 && profit !== null
                ? (profit / (stock.holding_price * stock.holding_quantity)) * 100
                : null;

            const profitStr =
              profit !== null && profitPct !== null
                ? privacyMode
                  ? `***(${profitPct.toFixed(2)}%)`
                  : `${profit.toFixed(2)}(${profitPct.toFixed(2)}%)`
                : '--';

            const isExpanded = expandedRows.has(stock.code);

            return (
              <React.Fragment key={stock.code}>
                <TableRow
                  sx={{
                    '&:nth-of-type(odd)': { backgroundColor: '#f5f5f5' },
                    '&:hover': { backgroundColor: '#e3f2fd' },
                  }}
                >
                  <TableCell>
                    {privacyMode ? '***' : stock.name}
                  </TableCell>
                  <TableCell>
                    {privacyMode ? '***' : stock.code}
                  </TableCell>
                  <TableCell>
                    {stock.last_price !== null
                      ? formatPriceFixed(stock.last_price)
                      : '--'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${stock.last_change_pct >= 0 ? '+' : ''}${stock.last_change_pct.toFixed(2)}%`}
                      color={getChangeColor(stock.last_change_pct)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {stock.holding_price !== null
                      ? (privacyMode ? '***' : formatPriceFixed(stock.holding_price))
                      : '--'}
                  </TableCell>
                  <TableCell>
                    {stock.holding_quantity > 0
                      ? (privacyMode ? '***' : String(Math.floor(stock.holding_quantity)))
                      : '--'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={profitStr}
                      color={getProfitColor(profit)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{formatUpdateTime(stock.last_update_time)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <Button
                        size="small"
                        onClick={() => {
                          if (onOpenAllTransactionsDialog) {
                            onOpenAllTransactionsDialog(stock.code);
                          }
                        }}
                        sx={{
                          color: '#1976d2',
                          textTransform: 'none',
                          minWidth: 'auto',
                          padding: '4px 4px',
                        }}
                      >
                        交易
                      </Button>
                      <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.875rem', mx: 0 }}>
                        |
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          setKlineChartOpen({
                            stockCode: stock.code,
                            stockName: stock.name,
                          });
                        }}
                        sx={{
                          color: '#9c27b0',
                          textTransform: 'none',
                          minWidth: 'auto',
                          padding: '4px 4px',
                        }}
                      >
                        K图
                      </Button>
                      <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.875rem', mx: 0 }}>
                        |
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          const holding = config.holdings[stock.code];
                          const watchlistItem = config.watchlist[stock.code];
                          
                          // 从 alerts 数组或 alert_up/alert_down 构建报警规则
                          const alerts: Array<{ type: 'up' | 'down'; price: string }> = [];
                          
                          // 优先使用 alerts 数组
                          if (holding?.alerts && holding.alerts.length > 0) {
                            holding.alerts.forEach(alert => {
                              alerts.push({ type: alert.type, price: alert.price.toString() });
                            });
                          } else if (watchlistItem?.alerts && watchlistItem.alerts.length > 0) {
                            watchlistItem.alerts.forEach(alert => {
                              alerts.push({ type: alert.type, price: alert.price.toString() });
                            });
                          } else {
                            // 如果没有 alerts 数组，从 alert_up/alert_down 转换
                            const currentAlertUp = holding?.alert_up ?? watchlistItem?.alert_up ?? null;
                            const currentAlertDown = holding?.alert_down ?? watchlistItem?.alert_down ?? null;
                            
                            if (currentAlertUp !== null) {
                              alerts.push({ type: 'up', price: currentAlertUp.toString() });
                            }
                            if (currentAlertDown !== null) {
                              alerts.push({ type: 'down', price: currentAlertDown.toString() });
                            }
                          }
                          
                          // 如果没有任何报警规则，至少添加一个空的
                          if (alerts.length === 0) {
                            alerts.push({ type: 'up', price: '' });
                          }
                          
                          setEditingAlert({
                            stockCode: stock.code,
                            alerts: alerts,
                          });
                        }}
                        sx={{
                          color: '#ed6c02',
                          textTransform: 'none',
                          minWidth: 'auto',
                          padding: '4px 4px',
                        }}
                      >
                        报警
                      </Button>
                      <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.875rem', mx: 0 }}>
                        |
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => handleDeleteStock(stock.code)}
                        sx={{
                          color: 'error.main',
                          textTransform: 'none',
                          minWidth: 'auto',
                          padding: '4px 4px',
                        }}
                      >
                        删除
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={9} sx={{ py: 0, border: 0 }}>
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ margin: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                          <Typography variant="h6">
                            交易记录
                          </Typography>
                          <Button
                            startIcon={<Add />}
                            onClick={() => {
                              if (onAddTransaction) {
                                onAddTransaction(stock.code);
                              } else if ((window as any).__openTransactionDialog) {
                                (window as any).__openTransactionDialog(stock.code);
                              }
                            }}
                            sx={{
                              textTransform: 'none',
                              color: '#9c27b0',
                              '&:hover': {
                                backgroundColor: 'transparent',
                                textDecoration: 'underline',
                              },
                            }}
                          >
                            交易
                          </Button>
                        </Box>
                        {stock.transactions && stock.transactions.length > 0 ? (
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell>时间</TableCell>
                                <TableCell>类型</TableCell>
                                <TableCell>数量（股）</TableCell>
                                <TableCell>单价</TableCell>
                                <TableCell>总金额</TableCell>
                                <TableCell align="right">操作</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {stock.transactions.map((transaction, index) => {
                                const isBuy = transaction.quantity > 0;
                                const totalAmount = transaction.totalAmount ?? (Math.abs(transaction.quantity) * transaction.price);
                                
                                return (
                                  <TableRow key={index}>
                                    <TableCell>{transaction.id || '--'}</TableCell>
                                    <TableCell>{transaction.time}</TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={isBuy ? '买入' : '卖出'} 
                                        size="small" 
                                        color={isBuy ? 'primary' : 'secondary'}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      {privacyMode ? '***' : Math.floor(Math.abs(transaction.quantity)).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                      {privacyMode ? '***' : formatPriceFixed(transaction.price)}
                                    </TableCell>
                                    <TableCell>
                                      {privacyMode ? '***' : totalAmount.toFixed(2)}
                                    </TableCell>
                                    <TableCell align="right">
                                      <IconButton
                                        size="small"
                                        onClick={() => handleEditTransaction(stock.code, index, transaction)}
                                        sx={{ color: '#1976d2' }}
                                      >
                                        <Edit fontSize="small" />
                                      </IconButton>
                                      <IconButton
                                        size="small"
                                        onClick={() => handleDeleteTransaction(stock.code, index)}
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
                        ) : (
                          <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                            <Typography variant="body2">暂无交易记录</Typography>
                          </Box>
                        )}
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>

      {/* 编辑交易对话框 */}
      <Dialog open={!!editingTransaction} onClose={() => setEditingTransaction(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>编辑交易记录</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              label="交易时间"
              type="datetime-local"
              size="small"
              fullWidth
              variant="outlined"
              value={editForm.time ? (() => {
                try {
                  const date = new Date(editForm.time);
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
                  setEditForm({ ...editForm, time: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}` });
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
              value={editForm.quantity}
              onChange={(e) => {
                const value = e.target.value;
                // 允许负数、小数和空字符串
                if (value === '' || value === '-' || /^-?\d*\.?\d*$/.test(value)) {
                  setEditForm({ ...editForm, quantity: value });
                }
              }}
              inputProps={{ step: 1 }}
              helperText="正数为买入，负数为卖出"
            />
            <TextField
              label="单价"
              type="number"
              size="small"
              fullWidth
              variant="outlined"
              value={editForm.price}
              onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
              inputProps={{ min: 0, step: 0.001 }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={() => setEditingTransaction(null)}>取消</Button>
          <Button size="small" onClick={handleSaveEdit} variant="contained">保存</Button>
        </DialogActions>
      </Dialog>

      {/* 删除交易记录确认对话框 */}
      <Dialog open={!!deletingTransaction} onClose={() => setDeletingTransaction(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>确认删除</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2">确定要删除这条交易记录吗？此操作不可恢复。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={() => setDeletingTransaction(null)}>取消</Button>
          <Button size="small" onClick={handleConfirmDelete} variant="contained" color="error">
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 报警配置对话框 */}
      <Dialog open={!!editingAlert} onClose={() => setEditingAlert(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>报警配置</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {editingAlert && (
            <>
              <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>
                设置价格报警规则，当股价达到设定价格时会发出提醒。可以添加多条规则。
              </Typography>
              {editingAlert.alerts.map((alert, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value={alert.type}
                      onChange={(e) => {
                        const newAlerts = [...editingAlert.alerts];
                        newAlerts[index].type = e.target.value as 'up' | 'down';
                        setEditingAlert({ ...editingAlert, alerts: newAlerts });
                      }}
                    >
                      <MenuItem value="up">上涨</MenuItem>
                      <MenuItem value="down">下跌</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="金额"
                    type="number"
                    size="small"
                    fullWidth
                    value={alert.price}
                    onChange={(e) => {
                      const newAlerts = [...editingAlert.alerts];
                      newAlerts[index].price = e.target.value;
                      setEditingAlert({ ...editingAlert, alerts: newAlerts });
                    }}
                    placeholder="报警价格"
                    inputProps={{ step: '0.01', min: '0' }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => {
                      const newAlerts = editingAlert.alerts.filter((_, i) => i !== index);
                      if (newAlerts.length === 0) {
                        newAlerts.push({ type: 'up', price: '' });
                      }
                      setEditingAlert({ ...editingAlert, alerts: newAlerts });
                    }}
                    color="error"
                  >
                    <Remove />
                  </IconButton>
                </Box>
              ))}
              <Button
                size="small"
                startIcon={<Add />}
                onClick={() => {
                  setEditingAlert({
                    ...editingAlert,
                    alerts: [...editingAlert.alerts, { type: 'up', price: '' }],
                  });
                }}
                sx={{ mt: 1 }}
              >
                添加规则
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={() => setEditingAlert(null)}>取消</Button>
          <Button size="small" onClick={handleSaveAlert} variant="contained">保存</Button>
        </DialogActions>
      </Dialog>

      {/* 删除自选股确认对话框 */}
      <Dialog open={!!deletingStock} onClose={() => { setDeletingStock(null); setDeleteOption('refund'); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>确认删除自选股</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            确定要删除该自选股吗？请选择删除方式：
          </Typography>
          <FormControl component="fieldset">
            <RadioGroup
              value={deleteOption}
              onChange={(e) => setDeleteOption(e.target.value as 'refund' | 'keep')}
            >
              <FormControlLabel
                value="refund"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                      删除并退回所有交易
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      删除该股票的所有交易记录，并将交易金额退回可用资金
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="keep"
                control={<Radio />}
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                      删除但保留交易记录
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      删除该股票，但将交易记录转移到历史交易数据中，不退回资金
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>
          <Typography sx={{ mt: 2, fontWeight: 'bold', color: 'error.main' }}>
            此操作不可恢复，确定要继续吗？
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button size="small" onClick={() => { setDeletingStock(null); setDeleteOption('refund'); }}>取消</Button>
          <Button size="small" onClick={handleConfirmDeleteStock} variant="contained" color="error">
            确认删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* K线图对话框 */}
      {klineChartOpen && (
        <Suspense fallback={
          <Dialog open={true} onClose={() => setKlineChartOpen(null)} maxWidth="lg" fullWidth>
            <DialogContent>
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress />
              </Box>
            </DialogContent>
          </Dialog>
        }>
          <KlineChart
            open={!!klineChartOpen}
            onClose={() => setKlineChartOpen(null)}
            stockCode={klineChartOpen.stockCode}
            stockName={klineChartOpen.stockName}
          />
        </Suspense>
      )}
    </TableContainer>
  );
};
