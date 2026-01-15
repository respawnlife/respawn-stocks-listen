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
} from '@mui/material';
import {
  Edit,
  Delete,
  Add,
} from '@mui/icons-material';
import { StockState, Transaction, HoldingsConfig } from '../types';
import { formatPriceFixed, formatPrice } from '../utils/calculations';
import { saveHoldingsConfig } from '../services/storage';

interface StockTableProps {
  stocks: StockState[];
  privacyMode: boolean;
  config: HoldingsConfig;
  onConfigUpdate: (newConfig: HoldingsConfig) => void;
  onAddTransaction?: (stockCode: string) => void;
}

export const StockTable: React.FC<StockTableProps> = ({ stocks, privacyMode, config, onConfigUpdate, onAddTransaction }) => {
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
    newTransactions[index] = {
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

    saveHoldingsConfig(newConfig);
    onConfigUpdate(newConfig);
    setEditingTransaction(null);
    setEditForm({ time: '', quantity: '', price: '' });
  };

  const handleDeleteTransaction = (stockCode: string, index: number) => {
    setDeletingTransaction({ stockCode, index });
  };

  const handleConfirmDelete = () => {
    if (!deletingTransaction) return;

    const { stockCode, index } = deletingTransaction;
    const holding = config.holdings[stockCode];
    if (!holding) return;

    // 获取要删除的交易记录
    const transactionToDelete = holding.transactions[index];
    const deletedAmount = transactionToDelete.quantity * transactionToDelete.price;

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

    saveHoldingsConfig(newConfig);
    onConfigUpdate(newConfig);
    setDeletingTransaction(null);
  };

  const handleDeleteStock = (stockCode: string) => {
    setDeletingStock(stockCode);
  };

  const handleConfirmDeleteStock = () => {
    if (!deletingStock) return;

    const stockCode = deletingStock;
    let totalRefundAmount = 0;

    // 检查是否在持仓中，如果在，计算所有交易记录的总金额
    if (config.holdings[stockCode]) {
      const holding = config.holdings[stockCode];
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
    delete newWatchlist[stockCode];

    // 更新可用资金（退回所有交易记录的资金）
    const newAvailableFunds = config.funds.available_funds + totalRefundAmount;

    const newConfig = {
      ...config,
      funds: {
        ...config.funds,
        available_funds: newAvailableFunds,
      },
      holdings: newHoldings,
      watchlist: newWatchlist,
    };

    saveHoldingsConfig(newConfig);
    onConfigUpdate(newConfig);
    setDeletingStock(null);
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
                  <TableCell>{stock.last_update_time}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Button
                        size="small"
                        onClick={() => toggleRow(stock.code)}
                        sx={{
                          color: '#1976d2',
                          textTransform: 'none',
                          minWidth: 'auto',
                          padding: '4px 8px',
                        }}
                      >
                        交易
                      </Button>
                      <Button
                        size="small"
                        onClick={() => handleDeleteStock(stock.code)}
                        sx={{
                          color: 'error.main',
                          textTransform: 'none',
                          minWidth: 'auto',
                          padding: '4px 8px',
                        }}
                      >
                        删除自选
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
                                      : (transaction.quantity * transaction.price).toFixed(2)}
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
      <Dialog open={!!editingTransaction} onClose={() => setEditingTransaction(null)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑交易记录</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="交易时间"
              type="datetime-local"
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
              fullWidth
              variant="outlined"
              value={editForm.quantity}
              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              inputProps={{ min: 1, step: 1 }}
            />
            <TextField
              label="单价"
              type="number"
              fullWidth
              variant="outlined"
              value={editForm.price}
              onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
              inputProps={{ min: 0, step: 0.001 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingTransaction(null)}>取消</Button>
          <Button onClick={handleSaveEdit} variant="contained">保存</Button>
        </DialogActions>
      </Dialog>

      {/* 删除交易记录确认对话框 */}
      <Dialog open={!!deletingTransaction} onClose={() => setDeletingTransaction(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>确定要删除这条交易记录吗？此操作不可恢复。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingTransaction(null)}>取消</Button>
          <Button onClick={handleConfirmDelete} variant="contained" color="error">
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 删除自选股确认对话框 */}
      <Dialog open={!!deletingStock} onClose={() => setDeletingStock(null)}>
        <DialogTitle>确认删除自选股</DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除该自选股吗？此操作将：
          </Typography>
          <Typography component="ul" sx={{ mt: 1, pl: 2 }}>
            <li>删除该股票的所有交易记录</li>
            <li>退回所有交易记录对应的资金到可用资金</li>
            <li>从自选列表中移除该股票</li>
          </Typography>
          <Typography sx={{ mt: 2, fontWeight: 'bold' }}>
            此操作不可恢复，确定要继续吗？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingStock(null)}>取消</Button>
          <Button onClick={handleConfirmDeleteStock} variant="contained" color="error">
            确认删除
          </Button>
        </DialogActions>
      </Dialog>
    </TableContainer>
  );
};
