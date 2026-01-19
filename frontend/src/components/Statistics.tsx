import React from 'react';
import { Box, Typography, Paper, IconButton, Tooltip, Select, MenuItem, FormControl } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { StockState, HoldingsConfig } from '../types';

interface StatisticsProps {
  stocks: StockState[];
  funds: {
    available_funds: number;
    total_original_funds: number;
  };
  privacyMode: boolean;
  onPrivacyModeToggle: () => void;
  config: HoldingsConfig;
  onConfigUpdate: (newConfig: HoldingsConfig) => Promise<void>;
}

export const Statistics: React.FC<StatisticsProps> = ({
  stocks,
  funds,
  privacyMode,
  onPrivacyModeToggle,
  config,
  onConfigUpdate,
}) => {
  const formatPrivacyValue = (value: number): string => {
    return privacyMode ? '***' : value.toFixed(2);
  };

  // 计算总持仓市值（基于stocks数组，这是从stockStates来的，已经包含了最新的持仓信息）
  const totalHoldingValue = stocks.reduce((sum, stock) => {
    if (stock.last_price !== null && stock.holding_quantity > 0) {
      return sum + stock.last_price * stock.holding_quantity;
    }
    return sum;
  }, 0);

  // 计算历史交易占用的资金（历史交易不应该算在可用资金中，但应该算在总资产中）
  const historicalFundsUsed = (config.historical_holdings || []).reduce((sum, historical) => {
    return sum + historical.transactions.reduce(
      (transactionSum, transaction) => transactionSum + transaction.quantity * transaction.price,
      0
    );
  }, 0);

  // 计算实时市值（可用资金 + 持仓市值 + 历史交易占用的资金）
  // 注意：历史交易占用的资金已经不在available_funds中了，所以需要加上
  // 实时市值 = 可用资金 + 当前持仓市值（按现价计算） + 历史交易占用的资金
  const totalAssets = funds.available_funds + totalHoldingValue + historicalFundsUsed;

  // 计算持仓股票数量
  const holdingStockCount = stocks.filter(
    (stock) => stock.holding_price !== null && stock.holding_quantity > 0
  ).length;

  // 计算总盈亏
  const totalProfit = totalAssets - funds.total_original_funds;
  const totalProfitPct =
    funds.total_original_funds > 0
      ? (totalProfit / funds.total_original_funds) * 100
      : 0;

  // 计算整体涨跌幅（加权平均）
  const totalChangePct =
    stocks.length > 0
      ? stocks.reduce((sum, stock) => sum + stock.last_change_pct, 0) /
        stocks.length
      : 0;

  // 计算仓位百分比
  const positionPct =
    totalAssets > 0 ? (totalHoldingValue / totalAssets) * 100 : 0;

  // 无持仓时，展示为0并使用中性颜色
  const hasPosition = totalHoldingValue > 0 || holdingStockCount > 0;
  const displayChangePct = hasPosition ? totalChangePct : 0;
  const displayProfit = hasPosition ? totalProfit : 0;
  const displayProfitPct = hasPosition ? totalProfitPct : 0;

  // 当前时间
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const updateInterval = config.update_interval ?? 1000; // 默认1秒

  const handleUpdateIntervalChange = async (value: number) => {
    const newConfig = {
      ...config,
      update_interval: value,
    };
    await onConfigUpdate(newConfig);
  };

  return (
    <Paper sx={{ p: 1.5, mb: 1.5, backgroundColor: '#f5f5f5', position: 'relative' }}>
      {/* 右上角控制区 */}
      <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* 更新频率选择 */}
        <FormControl size="small" sx={{ minWidth: 80 }}>
          <Select
            value={updateInterval}
            onChange={(e) => handleUpdateIntervalChange(e.target.value as number)}
            sx={{
              fontSize: '0.75rem',
              height: '28px',
              '& .MuiSelect-select': {
                py: 0.5,
              },
            }}
          >
            <MenuItem value={1000}>1s</MenuItem>
            <MenuItem value={3000}>3s</MenuItem>
            <MenuItem value={5000}>5s</MenuItem>
            <MenuItem value={10000}>10s</MenuItem>
          </Select>
        </FormControl>
        {/* 隐私模式切换按钮 */}
        <Tooltip title={privacyMode ? '显示敏感信息' : '隐藏敏感信息'}>
          <IconButton
            onClick={onPrivacyModeToggle}
            sx={{
              color: privacyMode ? 'text.secondary' : 'primary.main',
            }}
            size="small"
          >
            {privacyMode ? <VisibilityOff /> : <Visibility />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ mb: 0.5 }}>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          时间:{timeStr} | 自选:{stocks.length} | 涨跌幅:
          <Typography
            variant="body2"
            component="span"
            sx={{
              color: hasPosition ? (displayChangePct >= 0 ? '#d32f2f' : '#2e7d32') : 'text.secondary',
              fontSize: '0.875rem',
              fontWeight: 'bold',
            }}
          >
            {displayChangePct >= 0 ? '+' : ''}{displayChangePct.toFixed(2)}%
          </Typography>
          {' | 持仓:'}{holdingStockCount} | 盈亏:
          {privacyMode ? (
            <Typography
              variant="body2"
              component="span"
              sx={{
                color: hasPosition ? (displayProfitPct >= 0 ? '#d32f2f' : '#2e7d32') : 'text.secondary',
                fontSize: '0.875rem',
                fontWeight: 'bold',
              }}
            >
              ***({displayProfitPct >= 0 ? '+' : ''}{displayProfitPct.toFixed(2)}%)
            </Typography>
          ) : (
            <Typography
              variant="body2"
              component="span"
              sx={{
                color: hasPosition ? (displayProfit >= 0 ? '#d32f2f' : '#2e7d32') : 'text.secondary',
                fontSize: '0.875rem',
                fontWeight: 'bold',
              }}
            >
              {displayProfit >= 0 ? '+' : ''}{formatPrivacyValue(displayProfit)}({displayProfitPct >= 0 ? '+' : ''}{displayProfitPct.toFixed(2)}%)
            </Typography>
          )}
        </Typography>
      </Box>
      <Box>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          本金:{formatPrivacyValue(funds.total_original_funds)} | 实时市值:{formatPrivacyValue(totalAssets)} | 持仓市值:{formatPrivacyValue(totalHoldingValue)} | 可用资金:{formatPrivacyValue(funds.available_funds)} | 仓位:{positionPct.toFixed(2)}%
        </Typography>
      </Box>
    </Paper>
  );
};
