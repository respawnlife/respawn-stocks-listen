import React from 'react';
import { Box, Typography, Paper, IconButton, Tooltip } from '@mui/material';
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
}

export const Statistics: React.FC<StatisticsProps> = ({
  stocks,
  funds,
  privacyMode,
  onPrivacyModeToggle,
  config,
}) => {
  const formatPrivacyValue = (value: number): string => {
    return privacyMode ? '***' : value.toFixed(2);
  };

  // 计算总持仓市值
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

  // 当前时间
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  return (
    <Paper sx={{ p: 2, mb: 2, backgroundColor: '#f5f5f5', position: 'relative' }}>
      {/* 隐私模式切换按钮 - 右上角 */}
      <Tooltip title={privacyMode ? '显示敏感信息' : '隐藏敏感信息'}>
        <IconButton
          onClick={onPrivacyModeToggle}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: privacyMode ? 'text.secondary' : 'primary.main',
          }}
          size="small"
        >
          {privacyMode ? <VisibilityOff /> : <Visibility />}
        </IconButton>
      </Tooltip>

      <Box sx={{ mb: 1 }}>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          时间:{timeStr}
        </Typography>
        <Typography variant="body2" component="span" sx={{ mx: 1, color: 'text.secondary' }}>
          |
        </Typography>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          自选:{stocks.length}
        </Typography>
        <Typography variant="body2" component="span" sx={{ mx: 1, color: 'text.secondary' }}>
          |
        </Typography>
        <Typography
          variant="body2"
          component="span"
          sx={{
            color: totalChangePct >= 0 ? 'error.main' : 'success.main',
            fontWeight: 'bold',
          }}
        >
          涨跌幅:{totalChangePct >= 0 ? '+' : ''}
          {totalChangePct.toFixed(2)}%
        </Typography>
        <Typography variant="body2" component="span" sx={{ mx: 1, color: 'text.secondary' }}>
          |
        </Typography>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          持仓:{holdingStockCount}
        </Typography>
        <Typography variant="body2" component="span" sx={{ mx: 1, color: 'text.secondary' }}>
          |
        </Typography>
        <Typography
          variant="body2"
          component="span"
          sx={{
            color: totalProfit >= 0 ? 'error.main' : 'success.main',
            fontWeight: 'bold',
          }}
        >
          盈亏:
          {privacyMode
            ? `***(${totalProfitPct >= 0 ? '+' : ''}${totalProfitPct.toFixed(2)}%)`
            : `${totalProfit >= 0 ? '+' : ''}${formatPrivacyValue(totalProfit)}(${totalProfitPct >= 0 ? '+' : ''}${totalProfitPct.toFixed(2)}%)`}
        </Typography>
      </Box>
      <Box>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          本金:{formatPrivacyValue(funds.total_original_funds)}
        </Typography>
        <Typography variant="body2" component="span" sx={{ mx: 1, color: 'text.secondary' }}>
          |
        </Typography>
        <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
          实时市值:{formatPrivacyValue(totalAssets)}
        </Typography>
        <Typography variant="body2" component="span" sx={{ mx: 1, color: 'text.secondary' }}>
          |
        </Typography>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          持仓市值:{formatPrivacyValue(totalHoldingValue)}
        </Typography>
        <Typography variant="body2" component="span" sx={{ mx: 1, color: 'text.secondary' }}>
          |
        </Typography>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          可用资金:{formatPrivacyValue(funds.available_funds)}
        </Typography>
        <Typography variant="body2" component="span" sx={{ mx: 1, color: 'text.secondary' }}>
          |
        </Typography>
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          仓位:{positionPct.toFixed(2)}%
        </Typography>
      </Box>
    </Paper>
  );
};
