import React, { useState } from 'react';
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
} from '@mui/material';
import {
  Edit,
  Delete,
  Add,
} from '@mui/icons-material';
import { StockState, Transaction, HoldingsConfig } from '../types';
import { formatPriceFixed, formatPrice } from '../utils/calculations';
// saveHoldingsConfig 现在通过 onConfigUpdate 统一处理

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
    alertUp: string;
    alertDown: string;
  } | null>(null);
  const [editForm, setEditForm] = useState<{
    time: string;
    quantity: string;
    price: string;
  }>({ time: '', quantity: '', price: '' });
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
    setEditForm({
      time: transaction.time,
      quantity: transaction.quantity.toString(),
      price: transaction.price.toString(),
    });
  };

  const handleSaveEdit = () => {
    if (!editingTransaction) return;

    const { stockCode, index, transaction: oldTransaction } = editingTransaction;
    const quantity = parseFloat(editForm.quantity);
    const price = parseFloat(editForm.price);

    if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0 || !editForm.time) {
      return;
    }

    const holding = config.holdings[stockCode];
    if (!holding) return;

    // 计算修改前后的金额差额
    const oldAmount = oldTransaction.quantity * oldTransaction.price;
    const newAmount = quantity * price;
    const amountDiff = oldAmount - newAmount; // 如果新金额更大，差额为负，可用资金减少

    const newTransactions = [...holding.transactions];
    // 保留原有交易的ID
    newTransactions[index] = {
      id: oldTransaction.id,
      time: editForm.time,
      quantity: quantity,
      price: price,
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
      setEditForm({ time: '', quantity: '', price: '' });
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
    const deletedAmount = transactionToDelete.quantity * transactionToDelete.price;

    // 如果交易有ID，从 transactions 表中删除
    if (transactionToDelete.id) {
      const { deleteTransaction } = await import('../services/indexedDB');
      await deleteTransaction(transactionToDelete.id);
    }

    const newTransactions = holding.transactions.filter((_, i) => i !== index);

    // 删除交易时，退回资金（增加可用资金）
    const newAvailableFunds = config.funds.available_funds + deletedAmount;

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

    const { stockCode, alertUp, alertDown } = editingAlert;
    const alertUpValue = alertUp.trim() === '' ? null : parseFloat(alertUp);
    const alertDownValue = alertDown.trim() === '' ? null : parseFloat(alertDown);

    // 验证输入
    if (alertUp !== '' && (isNaN(alertUpValue!) || alertUpValue! <= 0)) {
      return;
    }
    if (alertDown !== '' && (isNaN(alertDownValue!) || alertDownValue! <= 0)) {
      return;
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
        alert_up: alertUpValue,
        alert_down: alertDownValue,
      };
    } else if (newConfig.watchlist[stockCode]) {
      // 是自选，更新自选的报警配置
      newConfig.watchlist[stockCode] = {
        ...newConfig.watchlist[stockCode],
        alert_up: alertUpValue,
        alert_down: alertDownValue,
      };
    } else {
      // 既不在持仓也不在自选，添加到自选
      newConfig.watchlist[stockCode] = {
        alert_up: alertUpValue,
        alert_down: alertDownValue,
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
          alert_up: holding?.alert_up || null,
          alert_down: holding?.alert_down || null,
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
                          const holding = config.holdings[stock.code];
                          const watchlistItem = config.watchlist[stock.code];
                          const currentAlertUp = holding?.alert_up ?? watchlistItem?.alert_up ?? null;
                          const currentAlertDown = holding?.alert_down ?? watchlistItem?.alert_down ?? null;
                          setEditingAlert({
                            stockCode: stock.code,
                            alertUp: currentAlertUp !== null ? currentAlertUp.toString() : '',
                            alertDown: currentAlertDown !== null ? currentAlertDown.toString() : '',
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
                              color: '#1976d2',
                              '&:hover': {
                                backgroundColor: 'transparent',
                                textDecoration: 'underline',
                              },
                            }}
                          >
                            增加交易
                          </Button>
                        </Box>
                        {stock.transactions && stock.transactions.length > 0 ? (
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell>时间</TableCell>
                                <TableCell>数量（股）</TableCell>
                                <TableCell>单价</TableCell>
                                <TableCell>总金额</TableCell>
                                <TableCell align="right">操作</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {stock.transactions.map((transaction, index) => (
                                <TableRow key={index}>
                                  <TableCell>{transaction.id || '--'}</TableCell>
                                  <TableCell>{transaction.time}</TableCell>
                                  <TableCell>
                                    {privacyMode ? '***' : Math.floor(transaction.quantity).toLocaleString()}
                                  </TableCell>
                                  <TableCell>
                                    {privacyMode ? '***' : formatPriceFixed(transaction.price)}
                                  </TableCell>
                                  <TableCell>
                                    {privacyMode
                                      ? '***'
                                      : (transaction.quantity * transaction.price).toFixed(3)}
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
                              ))}
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
              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              inputProps={{ min: 1, step: 1 }}
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
      <Dialog open={!!editingAlert} onClose={() => setEditingAlert(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>报警配置</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {editingAlert && (
            <>
              <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>
                股票代码: {editingAlert.stockCode}
              </Typography>
              <TextField
                label="上涨报警价格"
                type="number"
                size="small"
                fullWidth
                value={editingAlert.alertUp}
                onChange={(e) => setEditingAlert({ ...editingAlert, alertUp: e.target.value })}
                placeholder="留空表示不设置"
                sx={{ mb: 2 }}
                inputProps={{ step: '0.01', min: '0' }}
              />
              <TextField
                label="下跌报警价格"
                type="number"
                size="small"
                fullWidth
                value={editingAlert.alertDown}
                onChange={(e) => setEditingAlert({ ...editingAlert, alertDown: e.target.value })}
                placeholder="留空表示不设置"
                inputProps={{ step: '0.01', min: '0' }}
              />
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
    </TableContainer>
  );
};
