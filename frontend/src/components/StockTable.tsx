import React, { useState, useEffect, Suspense, lazy } from 'react';
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
  Snackbar,
  Menu,
  Popover,
} from '@mui/material';
import {
  Edit,
  Delete,
  Add,
  Remove,
  DragIndicator,
  MoreVert,
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StockState, Transaction, HoldingsConfig } from '../types';
import { formatPriceFixed, formatPrice, calculateHoldingFromTransactions } from '../utils/calculations';
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
  onToggleCategorySidebar?: (fn: () => void) => void;
}

// 可拖拽行组件
interface SortableRowProps {
  stock: StockState;
  children: (props: { attributes: any; listeners: any; isDragging: boolean }) => React.ReactNode;
}

const SortableRow: React.FC<SortableRowProps> = ({ stock, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stock.code });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      sx={{
        ...(isDragging && { backgroundColor: 'rgba(0, 0, 0, 0.05)' }),
        '&:nth-of-type(odd)': { backgroundColor: '#f5f5f5' },
        '&:hover': { backgroundColor: '#e3f2fd' },
        borderBottom: 'none !important',
        borderTop: 'none !important',
        '& td': { borderBottom: 'none !important', borderTop: 'none !important' },
      }}
    >
      {children({ attributes, listeners, isDragging })}
    </TableRow>
  );
};

export const StockTable: React.FC<StockTableProps> = ({ stocks, privacyMode, config, onConfigUpdate, onAddTransaction, onOpenAllTransactionsDialog, onToggleCategorySidebar }) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingStockCategories, setEditingStockCategories] = useState<{
    stockCode: string;
    categories: string[];
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [deleteCategoryName, setDeleteCategoryName] = useState<string | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [categoryMenuAnchor, setCategoryMenuAnchor] = useState<{ el: HTMLElement; categoryName: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ name: string; title: string; color: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCategorySidebar, setShowCategorySidebar] = useState(false);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [operationMenuAnchor, setOperationMenuAnchor] = useState<{ el: HTMLElement; stockCode: string } | null>(null);
  
  // 判断是否为默认"自选"分组
  const isDefaultCategory = (categoryName: string): boolean => {
    const categories = config.categories || {};
    const catData = categories[categoryName];
    return catData?.isDefault === true;
  };

  // 判断是否为默认"持仓"分组
  const isHoldingsCategory = (categoryName: string): boolean => {
    const categories = config.categories || {};
    const catData = categories[categoryName];
    return catData?.isHoldings === true;
  };

  // 判断是否为系统默认分组（自选或持仓）
  const isSystemCategory = (categoryName: string): boolean => {
    return isDefaultCategory(categoryName) || isHoldingsCategory(categoryName);
  };

  // 获取默认"自选"分组的名称
  const getDefaultCategoryName = (): string | null => {
    const categories = config.categories || {};
    for (const [name, data] of Object.entries(categories)) {
      if (data.isDefault === true) {
        return name;
      }
    }
    return null;
  };

  // 获取默认"持仓"分组的名称
  const getHoldingsCategoryName = (): string | null => {
    const categories = config.categories || {};
    for (const [name, data] of Object.entries(categories)) {
      if (data.isHoldings === true) {
        return name;
      }
    }
    return null;
  };

  // 获取所有分组（包括"自选"），并按照固定顺序排序：自选、持仓在前，其他按名称排序
  const getAllCategories = (): string[] => {
    const categories = config.categories || {};
    const allCats = Object.keys(categories);
    
    // 获取默认分组名称
    const defaultCatName = getDefaultCategoryName();
    const holdingsCatName = getHoldingsCategoryName();
    
    // 分离系统分组和其他分组
    const systemCategories: string[] = [];
    const otherCategories: string[] = [];
    
    for (const catName of allCats) {
      if (catName === defaultCatName) {
        systemCategories.unshift(catName); // 自选放在第一位
      } else if (catName === holdingsCatName) {
        systemCategories.push(catName); // 持仓放在第二位
      } else {
        otherCategories.push(catName);
      }
    }
    
    // 其他分组按名称排序
    otherCategories.sort();
    
    // 返回：自选、持仓、其他分组
    return [...systemCategories, ...otherCategories];
  };
  
  // 页面加载时，如果有多个分组，默认选中"自选"
  useEffect(() => {
    const allCategories = getAllCategories();
    if (allCategories.length > 1 && selectedCategory === null) {
      // 如果默认分组在分组列表中，选中它
      const defaultCatName = getDefaultCategoryName();
      if (defaultCatName && allCategories.includes(defaultCatName)) {
        setSelectedCategory(defaultCatName);
      } else if (allCategories.length > 0) {
        // 如果没有默认分组，选中第一个分组
        setSelectedCategory(allCategories[0]);
      }
    }
  }, [config.categories, selectedCategory]);

  // 暴露切换侧边栏的方法给父组件
  useEffect(() => {
    const toggleFn = () => {
      setShowCategorySidebar(prev => !prev);
    };
    
    if (onToggleCategorySidebar) {
      onToggleCategorySidebar(toggleFn);
    }
    // 同时暴露到全局变量（供 ActionBar 使用）
    (window as any).__toggleCategorySidebar = toggleFn;
    
    return () => {
      if ((window as any).__toggleCategorySidebar) {
        delete (window as any).__toggleCategorySidebar;
      }
    };
  }, [onToggleCategorySidebar]);
  
  // 预设的10个沉稳且积极的颜色
  const presetColors = [
    '#1976d2', // 深蓝色
    '#2e7d32', // 深绿色
    '#ed6c02', // 深橙色
    '#9c27b0', // 深紫色
    '#c62828', // 深红色
    '#1565c0', // 深蓝色2
    '#388e3c', // 深绿色2
    '#f57c00', // 深橙色2
    '#7b1fa2', // 深紫色2
    '#d32f2f', // 深红色2
  ];
  
  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = stocks.findIndex((stock) => stock.code === active.id);
      const newIndex = stocks.findIndex((stock) => stock.code === over.id);
      
      if (oldIndex === -1 || newIndex === -1) return;
      
      // 获取当前的排序顺序，如果没有则使用 stocks 的顺序
      const currentOrder = config.stock_order || stocks.map((s) => s.code);
      
      // 确保所有股票都在排序顺序中
      const allStockCodes = stocks.map((s) => s.code);
      const completeOrder = [
        ...currentOrder.filter(code => allStockCodes.includes(code)),
        ...allStockCodes.filter(code => !currentOrder.includes(code))
      ];
      
      // 使用 arrayMove 重新排序
      const oldIndexInOrder = completeOrder.findIndex(code => code === active.id);
      const newIndexInOrder = completeOrder.findIndex(code => code === over.id);
      
      if (oldIndexInOrder === -1 || newIndexInOrder === -1) return;
      
      const newOrder = arrayMove(
        completeOrder,
        oldIndexInOrder,
        newIndexInOrder
      );
      
      // 更新配置中的排序顺序
      const newConfig = {
        ...config,
        stock_order: newOrder,
      };
      
      // 确保保存到 IndexedDB
      onConfigUpdate(newConfig).then(() => {
        console.log('排序顺序已保存:', newOrder);
      }).catch((error) => {
        console.error('保存排序顺序失败:', error);
      });
    }
  };
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

  // 获取股票所属的所有分组
  const getStockCategories = (stockCode: string): string[] => {
    const watchlistItem = config.watchlist[stockCode];
    if (watchlistItem?.categories && watchlistItem.categories.length > 0) {
      return watchlistItem.categories;
    }
    // 如果没有分组，检查是否在默认分组中
    const categories = config.categories || {};
    const defaultCatName = getDefaultCategoryName();
    if (defaultCatName) {
      const defaultCategory = categories[defaultCatName];
      if (defaultCategory && (defaultCategory.codes || []).includes(stockCode)) {
        return [defaultCatName];
      }
    }
    // 检查是否在其他分组中
    const allCategories: string[] = [];
    for (const [catName, catData] of Object.entries(categories)) {
      const codes = catData.codes || [];
      if (codes.includes(stockCode)) {
        allCategories.push(catName);
      }
    }
    return allCategories.length > 0 ? allCategories : (defaultCatName ? [defaultCatName] : []);
  };

  // 获取分组的显示名称（注意：getAllCategories 函数在上面已定义）
  const getCategoryDisplayName = (categoryName: string): string => {
    const categories = config.categories || {};
    const catData = categories[categoryName];
    return catData?.title || categoryName;
  };

  // 获取分组的颜色
  const getCategoryColor = (categoryName: string): string => {
    const categories = config.categories || {};
    const catData = categories[categoryName];
    return catData?.color || '#1976d2';
  };

  // 获取分组中的股票数量
  const getCategoryStockCount = (categoryName: string): number => {
    const categories = config.categories || {};
    const catData = categories[categoryName];
    return (catData?.codes || []).length;
  };

  // 检查股票是否在其他分类中
  const isStockInOtherCategories = (stockCode: string, currentCategory?: string): boolean => {
    const categories = config.categories || {};
    for (const [catName, codes] of Object.entries(categories)) {
      if (catName !== currentCategory && codes.includes(stockCode)) {
        return true;
      }
    }
    // 检查 watchlist 中的分类
    const watchlistItem = config.watchlist[stockCode];
    if (watchlistItem?.categories) {
      const otherCategories = watchlistItem.categories.filter(cat => cat !== currentCategory);
      if (otherCategories.length > 0) {
        return true;
      }
    }
    return false;
  };

  const handleConfirmDeleteStock = () => {
    if (!deletingStock) return;

    const stockCode = deletingStock;
    const stock = stocks.find(s => s.code === stockCode);
    const stockName = stock?.name || stockCode;
    
    // 检查股票是否在其他分类中
    const stockCategories = getStockCategories(stockCode);
    const hasOtherCategories = stockCategories.length > 1;

    // 如果还有其他分类，只从分类中移除（不删除股票）
    if (hasOtherCategories) {
      // 从所有分类中移除该股票
      const newCategories = { ...config.categories };
      for (const catName of Object.keys(newCategories)) {
        const catData = newCategories[catName];
        if (catData && catData.codes) {
          newCategories[catName] = {
            ...catData,
            codes: catData.codes.filter(code => code !== stockCode),
          };
          // 不再自动删除空分类，保留分组供用户手动删除
        }
      }
      
      // 从 watchlist 中移除分类信息
      const newWatchlist = { ...config.watchlist };
      if (newWatchlist[stockCode]) {
        newWatchlist[stockCode] = {
          ...newWatchlist[stockCode],
          categories: [],
        };
      }

      const newConfig = {
        ...config,
        categories: newCategories,
        watchlist: newWatchlist,
      };

      onConfigUpdate(newConfig).then(() => {
        setDeletingStock(null);
        setDeleteOption('refund');
        setSnackbarMessage('已从当前分类删除');
      });
      return;
    }
    
    // 如果没有其他分类，需要确认是否删除股票
    
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

    // 从所有分类中移除该股票
    const newCategories = { ...config.categories };
    for (const catName of Object.keys(newCategories)) {
      const catData = newCategories[catName];
      if (catData && catData.codes) {
        newCategories[catName] = {
          ...catData,
          codes: catData.codes.filter(code => code !== stockCode),
        };
        // 不再自动删除空分类，保留分组供用户手动删除
      }
    }

    // 更新排序顺序：删除该股票
    const currentOrder = config.stock_order || [];
    const newOrder = currentOrder.filter(code => code !== stockCode);
    
    const newConfig = {
      ...config,
      stock_order: newOrder,
      categories: newCategories,
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

  // 处理分类拖拽结束
  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = categoryOrder.findIndex(cat => cat === active.id);
      const newIndex = categoryOrder.findIndex(cat => cat === over.id);
      
      if (oldIndex === -1 || newIndex === -1) return;
      
      // 获取系统分类的位置
      const defaultCatName = getDefaultCategoryName();
      const holdingsCatName = getHoldingsCategoryName();
      const defaultIndex = defaultCatName ? categoryOrder.indexOf(defaultCatName) : -1;
      const holdingsIndex = holdingsCatName ? categoryOrder.indexOf(holdingsCatName) : -1;
      
      // 系统分类不能移动
      if (active.id === defaultCatName || active.id === holdingsCatName) {
        return;
      }
      
      // 不能移动到系统分类之前
      const minMovableIndex = Math.max(defaultIndex, holdingsIndex) + 1;
      if (newIndex < minMovableIndex) {
        return;
      }
      
      const newOrder = arrayMove(categoryOrder, oldIndex, newIndex);
      setCategoryOrder(newOrder);
    }
  };

  // 获取排序后的分组列表
  const getSortedCategories = (): string[] => {
    const allCategories = getAllCategories();
    if (categoryOrder.length === 0) {
      return allCategories;
    }
    
    // 使用保存的顺序，但确保所有分类都在列表中
    const ordered: string[] = [];
    const added = new Set<string>();
    
    // 先添加顺序中的分类
    for (const cat of categoryOrder) {
      if (allCategories.includes(cat)) {
        ordered.push(cat);
        added.add(cat);
      }
    }
    
    // 添加新分类到末尾
    for (const cat of allCategories) {
      if (!added.has(cat)) {
        ordered.push(cat);
      }
    }
    
    return ordered;
  };

  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Box sx={{ flex: showCategorySidebar ? '0 0 calc(100% - 200px)' : '1 1 auto', transition: 'flex 0.3s' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <TableContainer component={Paper} >
        <Table size="small" sx={{ 
          minWidth: 650, 
          borderCollapse: 'collapse'}}>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#1976d2' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 40, p: 0.25, borderBottom: 'none !important' }}>
                {/* 拖拽列 */}
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 140, p: 0.25, borderBottom: 'none !important' }}>
                名称
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 100, p: 0.25, borderBottom: 'none !important' }}>
                代码
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 80, p: 0.25, borderBottom: 'none !important' }}>
                现价
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 80, p: 0.25, borderBottom: 'none !important' }}>
                涨跌幅
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 80, p: 0.25, borderBottom: 'none !important' }}>
                成本价
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 80, p: 0.25, borderBottom: 'none !important' }}>
                数量
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 200, p: 0.25, borderBottom: 'none !important' }}>
                盈亏
              </TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', width: 40, p: 0.25, borderBottom: 'none !important' }}>
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <SortableContext
            items={(() => {
              // 根据选中的分类过滤股票
              let filteredStocks = stocks;
              if (selectedCategory) {
                const categories = config.categories || {};
                const categoryData = categories[selectedCategory];
                if (categoryData && categoryData.codes) {
                  const categoryCodes = new Set(categoryData.codes);
                  filteredStocks = stocks.filter(stock => categoryCodes.has(stock.code));
                }
              }
              return filteredStocks.map((s) => s.code);
            })()}
            strategy={verticalListSortingStrategy}
          >
            <TableBody>
              {(() => {
                // 根据选中的分类过滤股票
                let filteredStocks = stocks;
                if (selectedCategory) {
                  const categories = config.categories || {};
                  const categoryData = categories[selectedCategory];
                  if (categoryData && categoryData.codes) {
                    const categoryCodes = new Set(categoryData.codes);
                    filteredStocks = stocks.filter(stock => categoryCodes.has(stock.code));
                  }
                }
                return filteredStocks;
              })().map((stock) => {
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
                <SortableRow stock={stock}>
                  {({ attributes, listeners }) => (
                    <>
                      <TableCell
                        sx={{
                          p: 0.25,
                          cursor: 'grab',
                          '&:active': { cursor: 'grabbing' },
                          borderBottom: 'none !important',
                        }}
                        {...attributes}
                        {...listeners}
                      >
                        <DragIndicator sx={{ color: 'text.secondary', fontSize: 20 }} />
                      </TableCell>
                      <TableCell sx={{ p: 0.25, borderBottom: 'none !important' }}>
                        {privacyMode ? '***' : stock.name}
                      </TableCell>
                  <TableCell sx={{ p: 0.25, borderBottom: 'none !important' }}>
                    {privacyMode ? '***' : stock.code}
                  </TableCell>
                  <TableCell sx={{ p: 0.25, borderBottom: 'none !important' }}>
                    {stock.last_price !== null
                      ? formatPriceFixed(stock.last_price)
                      : '--'}
                  </TableCell>
                  <TableCell sx={{ p: 0.25, borderBottom: 'none !important' }}>
                    <Chip
                      label={`${stock.last_change_pct >= 0 ? '+' : ''}${stock.last_change_pct.toFixed(2)}%`}
                      color={getChangeColor(stock.last_change_pct)}
                      size="small"
                      sx={{ height: 20, fontSize: '0.75rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.25, borderBottom: 'none !important' }}>
                    {stock.holding_price !== null
                      ? (privacyMode ? '***' : formatPriceFixed(stock.holding_price))
                      : '--'}
                  </TableCell>
                  <TableCell sx={{ p: 0.25, borderBottom: 'none !important' }}>
                    {stock.holding_quantity > 0
                      ? (privacyMode ? '***' : String(Math.floor(stock.holding_quantity)))
                      : '--'}
                  </TableCell>
                  <TableCell sx={{ p: 0.25, borderBottom: 'none !important' }}>
                    <Chip
                      label={profitStr}
                      color={getProfitColor(profit)}
                      size="small"
                      sx={{ height: 20, fontSize: '0.75rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.25, borderBottom: 'none !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          setOperationMenuAnchor({ el: e.currentTarget, stockCode: stock.code });
                        }}
                        sx={{ p: 0.5 }}
                      >
                        <MoreVert fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                    </>
                  )}
                </SortableRow>
              </React.Fragment>
            );
          })}
            </TableBody>
          </SortableContext>
        </Table>
      </TableContainer>
        </DndContext>
      </Box>
      
      {/* 分类侧边栏 */}
      {showCategorySidebar && (
        <Box sx={{ flex: '0 0 200px', border: '1px solid #e0e0e0', borderRadius: 0, backgroundColor: '#f5f5f5', p: 1 }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleCategoryDragEnd}
          >
            <SortableContext
              items={getSortedCategories()}
              strategy={verticalListSortingStrategy}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {getSortedCategories().map((catName) => {
                  const isSystemCat = isSystemCategory(catName);
                  const isSelected = selectedCategory === catName;
                  
                  // 可拖拽的分类项组件
                  const SortableCategoryItem = () => {
                    const {
                      attributes,
                      listeners,
                      setNodeRef,
                      transform,
                      transition,
                      isDragging,
                    } = useSortable({ id: catName, disabled: isSystemCat });
                    
                    const style = {
                      transform: CSS.Transform.toString(transform),
                      transition,
                      opacity: isDragging ? 0.5 : 1,
                    };
                    
                    return (
                      <Box
                        ref={setNodeRef}
                        style={style}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          p: 0.5,
                          backgroundColor: isSelected ? `${getCategoryColor(catName)}20` : 'transparent',
                          borderRadius: 0,
                          cursor: isSelected ? 'default' : 'pointer',
                          '&:hover': {
                            backgroundColor: isSelected ? `${getCategoryColor(catName)}30` : 'rgba(0, 0, 0, 0.04)',
                          },
                        }}
                      >
                        {!isSystemCat && (
                          <Box
                            {...attributes}
                            {...listeners}
                            sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}
                          >
                            <DragIndicator sx={{ color: 'text.secondary', fontSize: 16 }} />
                          </Box>
                        )}
                        <Button
                          size="small"
                          onClick={() => {
                            setSelectedCategory(catName);
                          }}
                          sx={{
                            flex: 1,
                            justifyContent: 'flex-start',
                            color: isSelected ? getCategoryColor(catName) : 'text.primary',
                            textTransform: 'none',
                            minWidth: 'auto',
                            padding: '4px 8px',
                            fontSize: '0.875rem',
                            fontWeight: isSelected ? 'bold' : 'normal',
                          }}
                        >
                          {getCategoryDisplayName(catName)}
                        </Button>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            setCategoryMenuAnchor({ el: e.currentTarget, categoryName: catName });
                          }}
                          sx={{ padding: '2px' }}
                        >
                          <MoreVert fontSize="small" />
                        </IconButton>
                      </Box>
                    );
                  };
                  
                  return <SortableCategoryItem key={catName} />;
                })}
              </Box>
            </SortableContext>
          </DndContext>
        </Box>
      )}

      {/* 操作菜单 */}
      <Menu
        anchorEl={operationMenuAnchor?.el}
        open={!!operationMenuAnchor}
        onClose={() => setOperationMenuAnchor(null)}
      >
        {operationMenuAnchor && (() => {
          const stock = stocks.find(s => s.code === operationMenuAnchor.stockCode);
          if (!stock) return null;
          
          const holding = config.holdings[stock.code];
          const watchlistItem = config.watchlist[stock.code];
          
          return (
            <>
              <MenuItem
                onClick={() => {
                  if (onOpenAllTransactionsDialog) {
                    onOpenAllTransactionsDialog(stock.code);
                  }
                  setOperationMenuAnchor(null);
                }}
                sx={{ py: 0.25, fontSize: '0.875rem' }}
              >
                交易列表
              </MenuItem>
              <MenuItem
                onClick={() => {
                  const categories = getStockCategories(stock.code);
                  // 过滤掉"持仓"分组，因为它是自动管理的
                  const filteredCategories = categories.filter(cat => !isHoldingsCategory(cat));
                  setEditingStockCategories({
                    stockCode: stock.code,
                    categories: [...filteredCategories],
                  });
                  setCategoryDialogOpen(true);
                  setOperationMenuAnchor(null);
                }}
                sx={{ py: 0.25, fontSize: '0.875rem' }}
              >
                分组
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setKlineChartOpen({
                    stockCode: stock.code,
                    stockName: stock.name,
                  });
                  setOperationMenuAnchor(null);
                }}
                sx={{ py: 0.25, fontSize: '0.875rem' }}
              >
                K图
              </MenuItem>
              <MenuItem
                onClick={() => {
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
                  setOperationMenuAnchor(null);
                }}
                sx={{ py: 0.25, fontSize: '0.875rem' }}
              >
                报警
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleDeleteStock(stock.code);
                  setOperationMenuAnchor(null);
                }}
                sx={{ py: 0.25, fontSize: '0.875rem', color: 'error.main' }}
              >
                删除
              </MenuItem>
            </>
          );
        })()}
      </Menu>

      {/* 编辑交易对话框 */}
      <Dialog open={!!editingTransaction} onClose={() => setEditingTransaction(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.25, pt: 0.5, px: 1 }}>编辑交易记录</DialogTitle>
        <DialogContent sx={{ pt: 0.25, px: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
        <DialogActions sx={{ px: 1, pb: 0.25, pt: 0.25 }}>
          <Button size="small" onClick={() => setEditingTransaction(null)} sx={{ py: 0.25, px: 1 }}>取消</Button>
          <Button size="small" onClick={handleSaveEdit} variant="contained" sx={{ py: 0.25, px: 1 }}>保存</Button>
        </DialogActions>
      </Dialog>

      {/* 删除交易记录确认对话框 */}
      <Dialog open={!!deletingTransaction} onClose={() => setDeletingTransaction(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.25, pt: 0.5, px: 1 }}>确认删除</DialogTitle>
        <DialogContent sx={{ pt: 0.25, px: 1 }}>
          <Typography variant="body2">确定要删除这条交易记录吗？此操作不可恢复。</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 1, pb: 0.25, pt: 0.25 }}>
          <Button size="small" onClick={() => setDeletingTransaction(null)} sx={{ py: 0.25, px: 1 }}>取消</Button>
          <Button size="small" onClick={handleConfirmDelete} variant="contained" color="error" sx={{ py: 0.25, px: 1 }}>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 报警配置对话框 */}
      <Dialog open={!!editingAlert} onClose={() => setEditingAlert(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>报警配置</DialogTitle>
        <DialogContent sx={{ pt: 0.5 }}>
          {editingAlert && (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                设置价格报警规则，当股价达到设定价格时会发出提醒。可以添加多条规则。
              </Typography>
              {editingAlert.alerts.map((alert, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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
              >
                添加规则
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 1, pb: 0.5 }}>
          <Button size="small" onClick={() => setEditingAlert(null)}>取消</Button>
          <Button size="small" onClick={handleSaveAlert} variant="contained">保存</Button>
        </DialogActions>
      </Dialog>

      {/* 删除自选股确认对话框 */}
      <Dialog open={!!deletingStock} onClose={() => { setDeletingStock(null); setDeleteOption('refund'); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>确认删除自选股</DialogTitle>
        <DialogContent sx={{ pt: 0.5 }}>
          <Typography variant="body2">
            确定要删除该自选股吗？请选择删除方式：
          </Typography>
          {(!deletingStock || getStockCategories(deletingStock).length <= 1) && (
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
          )}
          {(!deletingStock || getStockCategories(deletingStock).length <= 1) && (
            <Typography sx={{ fontWeight: 'bold', color: 'error.main' }}>
              此操作不可恢复，确定要继续吗？
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 1, pb: 0.5 }}>
          <Button size="small" onClick={() => { setDeletingStock(null); setDeleteOption('refund'); }}>取消</Button>
          <Button size="small" onClick={handleConfirmDeleteStock} variant="contained" color="error">
            确认删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 分组管理对话框 */}
      <Dialog open={categoryDialogOpen} onClose={() => { setCategoryDialogOpen(false); setEditingStockCategories(null); setNewCategoryName(''); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 0.25, pt: 0.5, px: 1 }}>分组管理</DialogTitle>
        <DialogContent sx={{ pt: 0.25, px: 1 }}>
          {editingStockCategories && (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                股票：{stocks.find(s => s.code === editingStockCategories.stockCode)?.name || editingStockCategories.stockCode}
              </Typography>
              
              {/* 创建新分组 */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="新分组名称"
                  size="small"
                  fullWidth
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && newCategoryName.trim()) {
                      const trimmedName = newCategoryName.trim();
                      const defaultCatName = getDefaultCategoryName();
                      if (trimmedName === defaultCatName) {
                        setSnackbarMessage('该名称与默认分组冲突，不能创建');
                        return;
                      }
                      if (editingStockCategories.categories.includes(trimmedName)) {
                        setSnackbarMessage('该分组已存在');
                        return;
                      }
                      setEditingStockCategories({
                        ...editingStockCategories,
                        categories: [...editingStockCategories.categories, trimmedName],
                      });
                      setNewCategoryName('');
                    }
                  }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    if (newCategoryName.trim()) {
                      const trimmedName = newCategoryName.trim();
                      const defaultCatName = getDefaultCategoryName();
                      if (trimmedName === defaultCatName) {
                        setSnackbarMessage('该名称与默认分组冲突，不能创建');
                        return;
                      }
                      if (editingStockCategories.categories.includes(trimmedName)) {
                        setSnackbarMessage('该分组已存在');
                        return;
                      }
                      setEditingStockCategories({
                        ...editingStockCategories,
                        categories: [...editingStockCategories.categories, trimmedName],
                      });
                      setNewCategoryName('');
                    }
                  }}
                >
                  创建
                </Button>
              </Box>

              {/* 分组列表 */}
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                所属分组：
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {editingStockCategories.categories
                  .filter(cat => !isHoldingsCategory(cat)) // 过滤掉"持仓"分组
                  .map((cat) => (
                  <Chip
                    key={cat}
                    label={cat}
                    onDelete={() => {
                      if (isSystemCategory(cat) && editingStockCategories.categories.filter(c => !isHoldingsCategory(c)).length === 1) {
                        setSnackbarMessage('至少需要保留一个分组');
                        return;
                      }
                      setEditingStockCategories({
                        ...editingStockCategories,
                        categories: editingStockCategories.categories.filter(c => c !== cat),
                      });
                    }}
                    color={isSystemCategory(cat) ? 'primary' : 'default'}
                  />
                ))}
                {editingStockCategories.categories.filter(cat => !isHoldingsCategory(cat)).length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    未分组（将自动添加到"自选"分组）
                  </Typography>
                )}
              </Box>

              {/* 添加到现有分组 */}
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                添加到分组：
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {Object.keys(config.categories || {}).filter(cat => 
                  !editingStockCategories.categories.includes(cat) && !isHoldingsCategory(cat) // 过滤掉"持仓"分组
                ).map((cat) => (
                  <Chip
                    key={cat}
                    label={cat}
                    onClick={() => {
                      setEditingStockCategories({
                        ...editingStockCategories,
                        categories: [...editingStockCategories.categories, cat],
                      });
                    }}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
                {/* 如果没有分类，显示默认分类 */}
                {(!config.categories || Object.keys(config.categories).length === 0) && 
                 (() => {
                   const defaultCatName = getDefaultCategoryName();
                   return defaultCatName && !editingStockCategories.categories.includes(defaultCatName);
                 })() && (
                  <Chip
                    label={getDefaultCategoryName() || '自选'}
                    onClick={() => {
                      const defaultCatName = getDefaultCategoryName() || '自选';
                      setEditingStockCategories({
                        ...editingStockCategories,
                        categories: [...editingStockCategories.categories, defaultCatName],
                      });
                    }}
                    sx={{ cursor: 'pointer' }}
                    color="primary"
                  />
                )}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 1, pb: 0.25, pt: 0.25 }}>
          <Button size="small" onClick={() => { setCategoryDialogOpen(false); setEditingStockCategories(null); setNewCategoryName(''); }} sx={{ py: 0.25, px: 1 }}>
            取消
          </Button>
          <Button
            size="small"
            onClick={() => {
              if (!editingStockCategories) return;
              
              const stockCode = editingStockCategories.stockCode;
              const defaultCatName = getDefaultCategoryName() || '自选';
              const categories = editingStockCategories.categories.length > 0 
                ? editingStockCategories.categories 
                : [defaultCatName];
              
              // 更新分类数据
              const newCategories = { ...config.categories || {} };
              
              // 从所有分类中移除该股票
              for (const catName of Object.keys(newCategories)) {
                const catData = newCategories[catName];
                if (catData) {
                  // 确保 codes 数组存在
                  if (!catData.codes) {
                    catData.codes = [];
                  }
                  newCategories[catName] = {
                    ...catData,
                    codes: (catData.codes || []).filter(code => code !== stockCode),
                  };
                  // 不再自动删除空分类，保留分组供用户手动删除
                }
              }
              
              // 确保默认分类存在
              if (!newCategories[defaultCatName]) {
                newCategories[defaultCatName] = { codes: [], title: defaultCatName, color: '#1976d2', isDefault: true };
              }
              
              // 确保持仓分类存在
              const holdingsCatName = getHoldingsCategoryName() || '持仓';
              if (!newCategories[holdingsCatName]) {
                newCategories[holdingsCatName] = { codes: [], title: holdingsCatName, color: '#2e7d32', isHoldings: true };
              }
              
              // 确保 codes 数组存在
              if (!newCategories[holdingsCatName].codes) {
                newCategories[holdingsCatName].codes = [];
              }
              
              // 检查股票持仓数量，如果大于0，自动添加到持仓分类
              const stock = stocks.find(s => s.code === stockCode);
              const holdingQuantity = stock?.holding_quantity || 0;
              if (holdingQuantity > 0) {
                if (!newCategories[holdingsCatName].codes.includes(stockCode)) {
                  newCategories[holdingsCatName] = {
                    ...newCategories[holdingsCatName],
                    codes: [...(newCategories[holdingsCatName].codes || []), stockCode],
                  };
                }
              } else {
                // 如果持仓为0，从持仓分类中移除
                newCategories[holdingsCatName] = {
                  ...newCategories[holdingsCatName],
                  codes: (newCategories[holdingsCatName].codes || []).filter(code => code !== stockCode),
                };
              }
              
              // 将股票添加到选中的分类
              for (const catName of categories) {
                if (!newCategories[catName]) {
                  newCategories[catName] = { codes: [], title: catName, color: '#1976d2' };
                }
                const catData = newCategories[catName];
                // 确保 codes 数组存在
                if (catData && !catData.codes) {
                  catData.codes = [];
                }
                if (catData && catData.codes && !catData.codes.includes(stockCode)) {
                  newCategories[catName] = {
                    ...catData,
                    codes: [...catData.codes, stockCode],
                  };
                }
              }
              
              // 更新 watchlist 中的分类信息
              const newWatchlist = { ...config.watchlist };
              if (newWatchlist[stockCode]) {
                newWatchlist[stockCode] = {
                  ...newWatchlist[stockCode],
                  categories: categories,
                };
              } else {
                // 如果不在 watchlist 中，添加到 watchlist
                newWatchlist[stockCode] = {
                  categories: categories,
                };
              }
              
              const newConfig = {
                ...config,
                categories: newCategories,
                watchlist: newWatchlist,
              };
              
              onConfigUpdate(newConfig).then(() => {
                setCategoryDialogOpen(false);
                setEditingStockCategories(null);
                setNewCategoryName('');
              });
            }}
            variant="contained"
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 分组管理菜单 */}
      <Menu
        anchorEl={categoryMenuAnchor?.el}
        open={!!categoryMenuAnchor}
        onClose={() => setCategoryMenuAnchor(null)}
      >
        {categoryMenuAnchor && (
          <>
            <MenuItem
              onClick={() => {
                const catName = categoryMenuAnchor.categoryName;
                const categories = config.categories || {};
                const catData = categories[catName] || { codes: [], title: catName, color: '#1976d2' };
                setEditingCategory({
                  name: catName,
                  title: catData.title || catName,
                  color: catData.color || '#1976d2',
                });
                setCategoryMenuAnchor(null);
              }}
            >
              设置
            </MenuItem>
            <MenuItem
              onClick={() => {
                const catName = categoryMenuAnchor.categoryName;
                if (isSystemCategory(catName)) {
                  setSnackbarMessage('系统默认分组不能删除');
                  setCategoryMenuAnchor(null);
                  return;
                }
                const stockCount = getCategoryStockCount(catName);
                if (stockCount > 0) {
                  setSnackbarMessage('该分组中还有股票，无法删除');
                  setCategoryMenuAnchor(null);
                  return;
                }
                // 删除分组
                const newCategories = { ...config.categories };
                delete newCategories[catName];
                const newConfig = {
                  ...config,
                  categories: newCategories,
                };
                onConfigUpdate(newConfig).then(() => {
                  setCategoryMenuAnchor(null);
                });
              }}
              disabled={isSystemCategory(categoryMenuAnchor.categoryName) || getCategoryStockCount(categoryMenuAnchor.categoryName) > 0}
            >
              删除
            </MenuItem>
          </>
        )}
      </Menu>

      {/* 编辑分组对话框 */}
      <Dialog open={!!editingCategory} onClose={() => setEditingCategory(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0.5 }}>编辑分组</DialogTitle>
        <DialogContent sx={{ pt: 0.5 }}>
          {editingCategory && (
            <>
              <TextField
                label="分组标题"
                size="small"
                fullWidth
                value={editingCategory.title}
                onChange={(e) => setEditingCategory({ ...editingCategory, title: e.target.value })}
                disabled={isSystemCategory(editingCategory.name)}
                helperText={isSystemCategory(editingCategory.name) ? '系统默认分组不允许修改标题' : ''}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                分组颜色
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {presetColors.map((color) => (
                  <Box
                    key={color}
                    onClick={() => setEditingCategory({ ...editingCategory, color })}
                    sx={{
                      width: 32,
                      height: 32,
                      backgroundColor: color,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      border: editingCategory.color === color ? '2px solid #000' : '2px solid transparent',
                      '&:hover': {
                        opacity: 0.8,
                        transform: 'scale(1.1)',
                      },
                      transition: 'all 0.2s',
                    }}
                  />
                ))}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 1, pb: 0.5 }}>
          <Button size="small" onClick={() => setEditingCategory(null)}>
            取消
          </Button>
          <Button
            size="small"
            onClick={() => {
              if (!editingCategory) return;
              const categories = { ...config.categories };
              const catName = editingCategory.name;
              const existingData = categories[catName] || { codes: [] };
              categories[catName] = {
                ...existingData,
                title: editingCategory.title,
                color: editingCategory.color,
              };
              const newConfig = {
                ...config,
                categories: categories,
              };
              onConfigUpdate(newConfig).then(() => {
                setEditingCategory(null);
              });
            }}
            variant="contained"
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar 提示 */}
      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage('')}
        message={snackbarMessage}
      />

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
    </Box>
  );
};
