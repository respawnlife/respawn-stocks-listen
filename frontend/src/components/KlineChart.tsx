import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  CircularProgress,
} from '@mui/material';
import { createChart, IChartApi, ISeriesApi, ColorType, CandlestickSeries, ITimeScaleApi, SeriesMarker, Time, createSeriesMarkers, LineStyle } from 'lightweight-charts';
import { getKlineData, KlineData, KlinePeriod } from '../services/klineData';
import { loadTransactionsByCode } from '../services/indexedDB';
import { Transaction } from '../types';
import { calculateHoldingFromTransactions } from '../utils/calculations';

interface KlineChartProps {
  open: boolean;
  onClose: () => void;
  stockCode: string;
  stockName: string;
}

export const KlineChart: React.FC<KlineChartProps> = ({ open, onClose, stockCode, stockName }) => {
  console.log('[K线图] 组件渲染，open:', open, 'stockCode:', stockCode, 'stockName:', stockName);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersPluginRef = useRef<any>(null);
  const priceLineRef = useRef<any>(null);
  const badgeContainerRef = useRef<HTMLDivElement>(null);
  const badgeElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [period, setPeriod] = useState<KlinePeriod>('day');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number; transactions: Transaction[]; date: string } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // 加载交易数据
  const loadTransactions = React.useCallback(async () => {
    try {
      const codeWithoutPrefix = stockCode.replace(/^(sh|sz)/, '');
      console.log('[K线图] 开始加载交易数据，股票代码:', codeWithoutPrefix);
      const transactions = await loadTransactionsByCode(codeWithoutPrefix);
      console.log('[K线图] 加载到的交易数据:', transactions.length, '条', transactions.map(t => ({ time: t.time, quantity: t.quantity })));
      setTransactions(transactions.map(t => ({
        id: t.id,
        time: t.time,
        quantity: t.quantity,
        price: t.price,
      })));
    } catch (err) {
      console.error('[K线图] 加载交易数据失败:', err);
      setTransactions([]);
    }
  }, [stockCode]);

  // 根据周期聚合交易数据
  const aggregateTransactionsByPeriod = React.useCallback((transactions: Transaction[], period: KlinePeriod): Map<string, Transaction[]> => {
    const result = new Map<string, Transaction[]>();
    
    transactions.forEach(trans => {
      // 处理交易时间格式：可能是 "YYYY-MM-DD HH:mm:ss" 或 "YYYY-MM-DD"
      let dateStr = trans.time;
      if (dateStr.includes(' ')) {
        // 如果有空格，只取日期部分
        dateStr = dateStr.split(' ')[0];
      }
      
      // 解析日期，确保格式正确
      const transDate = new Date(dateStr + 'T00:00:00'); // 添加时间部分避免时区问题
      if (isNaN(transDate.getTime())) {
        console.warn('[K线图] 无法解析交易日期:', trans.time);
        return;
      }
      
      let key: string;
      
      if (period === 'day') {
        // 日K：按日期聚合
        const year = transDate.getFullYear();
        const month = String(transDate.getMonth() + 1).padStart(2, '0');
        const day = String(transDate.getDate()).padStart(2, '0');
        key = `${year}-${month}-${day}`;
      } else if (period === 'week') {
        // 周K：严格按照自然周聚合（周一到周日）
        // 使用ISO周的标准：周一是一周的开始
        const dayOfWeek = transDate.getDay(); // 0=周日, 1=周一, ..., 6=周六
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 计算到周一的偏移量
        const weekStart = new Date(transDate);
        weekStart.setDate(transDate.getDate() + diff);
        weekStart.setHours(0, 0, 0, 0); // 确保时间部分为0
        // 使用ISO周数：YYYY-Www格式，其中ww是两位数的周数
        const year = weekStart.getFullYear();
        const month = String(weekStart.getMonth() + 1).padStart(2, '0');
        const day = String(weekStart.getDate()).padStart(2, '0');
        key = `${year}-${month}-${day}`; // 使用周一日期作为key
      } else {
        // 月K：按年月聚合
        const year = transDate.getFullYear();
        const month = String(transDate.getMonth() + 1).padStart(2, '0');
        key = `${year}-${month}`;
      }
      
      if (!result.has(key)) {
        result.set(key, []);
      }
      result.get(key)!.push(trans);
    });
    
    return result;
  }, []);

  // 加载K线数据的函数
  const loadKlineData = React.useCallback(async () => {
    if (!chartRef.current || !candlestickSeriesRef.current) {
      console.log('[K线图] 图表未初始化，无法加载数据');
      return;
    }

    console.log(`[K线图] loadKlineData函数开始执行，stockCode: ${stockCode}, period: ${period}`);
    setLoading(true);
    setError(null);

        try {
          console.log(`[K线图] 开始加载 ${stockCode} 的 ${period} 数据（最多一年）`);
          // 不指定count，让函数自动计算一年的数据量
          const data = await getKlineData(stockCode, period);
      console.log(`[K线图] 获取到 ${data.length} 条数据`, data.slice(0, 3));

      if (data.length === 0) {
        setError('暂无数据，请检查网络连接或稍后重试');
        setLoading(false);
        return;
      }

        // 转换数据格式为lightweight-charts需要的格式
        // lightweight-charts支持的时间格式：Unix timestamp (number) 或 Business day (string 'YYYY-MM-DD')
        // 重要：数据必须按时间升序排列
        // 数据已经在klineData.ts中过滤过了，这里直接转换即可
        const chartData = data
          .map((item) => {
            // 将日期格式转换为 YYYY-MM-DD（lightweight-charts的business day格式）
            // 如果日期已经是 YYYY-MM-DD 格式，直接使用；否则尝试转换
            let dateStr = item.date;
            if (!dateStr.includes('-')) {
              // 如果是 YYYYMMDD 格式，转换为 YYYY-MM-DD
              if (dateStr.length === 8) {
                dateStr = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
              }
            }
            return {
              time: dateStr as any, // Business day格式：YYYY-MM-DD
              open: item.open,
              high: item.high,
              low: item.low,
              close: item.close,
            };
          })
          .sort((a, b) => {
            // 确保按时间升序排列
            const timeA = typeof a.time === 'string' ? new Date(a.time).getTime() : a.time;
            const timeB = typeof b.time === 'string' ? new Date(b.time).getTime() : b.time;
            return timeA - timeB;
          });
        
        // 打印前几条数据用于调试
        if (chartData.length > 0) {
          console.log('[K线图] K线数据示例（前3条）:', chartData.slice(0, 3).map(d => ({ time: d.time, timeType: typeof d.time })));
        }
        
        console.log(`[K线图] 转换后保留 ${chartData.length} 条数据`);

      console.log(`[K线图] 转换后的图表数据:`, chartData.slice(0, 3));

      // 聚合交易数据
      const transactionsByPeriod = aggregateTransactionsByPeriod(transactions, period);
      console.log('[K线图] 交易数据聚合结果（周期键 -> 交易数）:', Array.from(transactionsByPeriod.entries()).map(([k, v]) => `${k}: ${v.length}条`));
      
      // 准备markers数据
      const markers: SeriesMarker<Time>[] = [];
      const transactionMap = new Map<string, Transaction[]>();
      
      chartData.forEach((item, index) => {
        const dateStr = typeof item.time === 'string' ? item.time : new Date(item.time).toISOString().split('T')[0];
        const periodKey = period === 'day' 
          ? dateStr 
          : period === 'week'
          ? (() => {
              // 周K：K线数据的日期通常是该周的最后一个交易日（周五）
              // 需要找到该周的开始（周一）来匹配交易数据
              const date = new Date(dateStr + 'T00:00:00');
              const dayOfWeek = date.getDay();
              const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 计算到周一的偏移量
              const weekStart = new Date(date);
              weekStart.setDate(date.getDate() + diff);
              weekStart.setHours(0, 0, 0, 0);
              return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
            })()
          : dateStr.substring(0, 7); // YYYY-MM
        
        const dayTransactions = transactionsByPeriod.get(periodKey) || [];
        if (dayTransactions.length > 0) {
          console.log(`[K线图] 匹配到交易: K线日期=${dateStr}, 周期键=${periodKey}, 交易数=${dayTransactions.length}`);
          const totalQuantity = dayTransactions.reduce((sum, t) => sum + t.quantity, 0);
          transactionMap.set(dateStr, dayTransactions);
          
          // 不创建marker，只用HTML badge显示（marker会显示圆形图标，我们不需要）
        }
      });
      
      console.log('[K线图] 生成的markers数量:', markers.length);
      console.log('[K线图] transactionMap大小:', transactionMap.size);

      // 更新图表数据
      if (candlestickSeriesRef.current && chartRef.current) {
        // 更新时间格式配置
        chartRef.current.applyOptions({
          timeScale: {
            tickMarkFormatter: (time: any, tickMarkType: any, locale: string) => {
              if (typeof time === 'string') {
                const date = new Date(time);
                if (period === 'day') {
                  // 日K：显示 MM-dd
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  return `${month}-${day}`;
                } else if (period === 'week') {
                  // 周K：显示 MM-dd
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  return `${month}-${day}`;
                } else if (period === 'month') {
                  // 月K：显示 yyyy-MM
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  return `${year}-${month}`;
                }
              }
              return time;
            },
          },
          localization: {
            dateFormat: period === 'day' ? 'MM-dd' : period === 'week' ? 'MM-dd' : 'yyyy-MM',
            timeFormatter: (businessDayOrTimestamp: any) => {
              // 自定义tooltip中的时间显示格式
              if (typeof businessDayOrTimestamp === 'string') {
                const date = new Date(businessDayOrTimestamp);
                if (period === 'day') {
                  // 日K：显示 MM-dd
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  return `${month}-${day}`;
                } else if (period === 'week') {
                  // 周K：显示周一到周日 MM-dd～MM-dd
                  const dayOfWeek = date.getDay();
                  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 计算到周一的偏移量
                  const weekStart = new Date(date);
                  weekStart.setDate(date.getDate() + diff);
                  weekStart.setHours(0, 0, 0, 0);
                  const weekEnd = new Date(weekStart);
                  weekEnd.setDate(weekStart.getDate() + 6); // 周日（一周的最后一天）
                  
                  const startMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
                  const startDay = String(weekStart.getDate()).padStart(2, '0');
                  const endMonth = String(weekEnd.getMonth() + 1).padStart(2, '0');
                  const endDay = String(weekEnd.getDate()).padStart(2, '0');
                  return `${startMonth}-${startDay}～${endMonth}-${endDay}`;
                } else if (period === 'month') {
                  // 月K：显示 yyyy-MM
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  return `${year}-${month}`;
                }
              }
              return businessDayOrTimestamp;
            },
          },
        });
        
        // 先设置数据
        candlestickSeriesRef.current.setData(chartData);
        
        // 不创建markers，只用HTML badge显示
        // 移除之前的markers插件
        if (markersPluginRef.current) {
          markersPluginRef.current.remove();
          markersPluginRef.current = null;
        }
        chartRef.current.timeScale().fitContent();
        console.log('[K线图] 图表数据已更新，周期:', period, '数据量:', chartData.length, '标记数:', markers.length);
        
        // 保存交易映射供tooltip使用
        (chartRef.current as any)._transactionMap = transactionMap;
        
        // 创建HTML badge元素（不依赖markers，直接从chartData和transactionMap创建）
        updateBadgeElements(chartData, [], transactionMap);
        
        // 添加持仓价格线
        updateHoldingPriceLine(transactions);
      } else {
        console.error('[K线图] 图表引用不存在');
        setError('图表初始化失败');
      }

      setLoading(false);
    } catch (err) {
      console.error('[K线图] 加载K线数据失败:', err);
      setError(`加载数据失败: ${err instanceof Error ? err.message : '未知错误'}`);
      setLoading(false);
    }
  }, [stockCode, period, transactions, aggregateTransactionsByPeriod]);

  // 更新badge元素的位置和样式
  const updateBadgeElements = (
    chartData: KlineData[],
    markers: SeriesMarker<Time>[],
    transactionMap: Map<string, Transaction[]>
  ) => {
    if (!chartRef.current || !badgeContainerRef.current || !candlestickSeriesRef.current) {
      return;
    }

    // 清除旧的badge元素
    badgeElementsRef.current.forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    badgeElementsRef.current.clear();

    const chart = chartRef.current;
    const container = badgeContainerRef.current;
    const timeScale = chart.timeScale();
    const series = candlestickSeriesRef.current;

    // 遍历chartData，找到有交易的日期
    chartData.forEach((chartDataItem) => {
      const timeValue = chartDataItem.time;
      const timeStr = typeof timeValue === 'string' ? timeValue : new Date(timeValue).toISOString().split('T')[0];
      const transactions = transactionMap.get(timeStr);
      if (!transactions || transactions.length === 0) return;

      const totalQuantity = transactions.reduce((sum, t) => sum + t.quantity, 0);
      const isBuy = totalQuantity > 0;

      // 计算坐标 - 使用series.priceToCoordinate而不是priceScale.priceToCoordinate
      const timePoint = timeScale.timeToCoordinate(timeValue);
      if (timePoint === null) return;

      // 使用series的priceToCoordinate方法
      let pricePoint: number | null = null;
      try {
        pricePoint = series.priceToCoordinate(chartDataItem.high);
      } catch (e) {
        console.error('[K线图] 计算价格坐标失败:', e);
        return;
      }

      if (pricePoint === null) return;

      // 创建badge元素 - 文字在badge内部，白色
      const badge = document.createElement('div');
      badge.textContent = isBuy ? '买' : '卖';
      badge.style.position = 'absolute';
      badge.style.left = `${timePoint}px`;
      badge.style.top = `${pricePoint - 25}px`; // 在K线上方
      badge.style.transform = 'translateX(-50%)';
      badge.style.backgroundColor = isBuy ? '#ef5350' : '#26a69a'; // 红涨绿跌
      badge.style.color = '#ffffff'; // 白色文字
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '4px';
      badge.style.fontSize = '12px';
      badge.style.fontWeight = 'bold';
      badge.style.whiteSpace = 'nowrap';
      badge.style.pointerEvents = 'none';
      badge.style.zIndex = '10';
      badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
      badge.style.display = 'inline-block'; // 确保背景色包裹文字

      container.appendChild(badge);
      badgeElementsRef.current.set(String(timeValue), badge);
    });

    // 监听图表变化，更新badge位置
    const updatePositions = () => {
      chartData.forEach((chartDataItem) => {
        const timeValue = chartDataItem.time;
        const badge = badgeElementsRef.current.get(String(timeValue));
        if (!badge) return;

        const timePoint = timeScale.timeToCoordinate(timeValue);
        if (timePoint === null) return;

        let pricePoint: number | null = null;
        try {
          pricePoint = series.priceToCoordinate(chartDataItem.high);
        } catch (e) {
          return;
        }

        if (pricePoint !== null) {
          badge.style.left = `${timePoint}px`;
          badge.style.top = `${pricePoint - 25}px`;
        }
      });
    };

    // 订阅图表变化事件
    chart.subscribeCrosshairMove(updatePositions);
    timeScale.subscribeVisibleTimeRangeChange(updatePositions);
  };

  // 更新持仓价格线
  const updateHoldingPriceLine = (transactions: Transaction[]) => {
    if (!candlestickSeriesRef.current) {
      return;
    }

    // 移除旧的价格线
    if (priceLineRef.current) {
      candlestickSeriesRef.current.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }

    // 计算持仓价格
    const [holdingQuantity, holdingPrice] = calculateHoldingFromTransactions(transactions);

    // 如果有持仓，添加价格线
    if (holdingQuantity > 0 && holdingPrice > 0) {
      try {
        priceLineRef.current = candlestickSeriesRef.current.createPriceLine({
          price: holdingPrice,
          color: '#0000FF', // 蓝色
          lineWidth: 1,
          lineStyle: LineStyle.Dashed, // 虚线
          axisLabelVisible: true,
          title: '持仓价',
        });
        console.log('[K线图] ✅ 已添加持仓价格线，价格:', holdingPrice);
      } catch (err) {
        console.error('[K线图] ❌ 添加持仓价格线失败:', err);
      }
    }
  };

  // 初始化图表
  useEffect(() => {
    if (!open) {
      // Dialog关闭时清理
      if (markersPluginRef.current) {
        markersPluginRef.current.remove();
        markersPluginRef.current = null;
      }
      // 清除badge元素
      badgeElementsRef.current.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      badgeElementsRef.current.clear();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
      }
      return;
    }

    // 等待Dialog完全打开，DOM元素挂载完成
    const timer = setTimeout(() => {
      if (!chartContainerRef.current) {
        console.error('[K线图] chartContainerRef.current 仍然为null');
        return;
      }

      console.log('[K线图] 开始创建图表');
      // 创建图表
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'white' },
          textColor: '#333',
        },
        width: chartContainerRef.current.clientWidth,
        height: 500,
        grid: {
          vertLines: {
            color: '#e0e0e0',
          },
          horzLines: {
            color: '#e0e0e0',
          },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 12,
          barSpacing: 3,
          fixLeftEdge: true,
          lockVisibleTimeRangeOnResize: true,
        },
        rightPriceScale: {
          borderColor: '#e0e0e0',
        },
      });

      chartRef.current = chart;

      // 创建K线系列
      // lightweight-charts v5.x 使用 addSeries(CandlestickSeries, options)
      // 注意：markers需要在setData时传入，或者使用setMarkers方法（如果存在）
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#ef5350',
        downColor: '#26a69a',
        borderVisible: false,
        wickUpColor: '#ef5350',
        wickDownColor: '#26a69a',
      });

      candlestickSeriesRef.current = candlestickSeries;
      
      console.log('[K线图] 图表和系列创建完成，chartRef:', !!chartRef.current, 'candlestickSeriesRef:', !!candlestickSeriesRef.current);
      
      // 订阅crosshair移动事件，显示自定义tooltip
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.point) {
          setTooltipData(null);
          return;
        }
        
        const transactionMap = (chartRef.current as any)?._transactionMap as Map<string, Transaction[]> | undefined;
        if (!transactionMap) {
          setTooltipData(null);
          return;
        }
        
        const timeValue = param.time;
        let dateStr: string;
        if (typeof timeValue === 'string') {
          dateStr = timeValue;
        } else {
          dateStr = new Date(timeValue).toISOString().split('T')[0];
        }
        
        // 根据周期确定key
        let periodKey: string;
        if (period === 'day') {
          periodKey = dateStr;
        } else if (period === 'week') {
          // 周K：严格按照自然周聚合
          const date = new Date(dateStr + 'T00:00:00');
          const dayOfWeek = date.getDay();
          const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() + diff);
          weekStart.setHours(0, 0, 0, 0);
          periodKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
        } else {
          periodKey = dateStr.substring(0, 7);
        }
        
        // 从transactionMap中查找交易数据（使用dateStr作为key）
        const dayTransactions = transactionMap.get(dateStr) || [];
        if (dayTransactions.length > 0) {
          console.log(`[K线图] Tooltip: 找到交易数据，日期=${dateStr}, 交易数=${dayTransactions.length}`);
          // 计算tooltip位置（跟随鼠标）
          // param.point是相对于图表的坐标，需要转换为相对于容器的坐标
          if (!chartContainerRef.current) {
            setTooltipData(null);
            return;
          }
          const containerRect = chartContainerRef.current.getBoundingClientRect();
          const x = param.point.x + containerRect.left;
          const y = param.point.y + containerRect.top;
          
          // 格式化日期显示
          let displayDate: string;
          if (period === 'day') {
            const date = new Date(dateStr);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            displayDate = `${month}-${day}`;
          } else if (period === 'week') {
            // 周K：显示周一到周日
            const date = new Date(dateStr + 'T00:00:00');
            const dayOfWeek = date.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() + diff);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6); // 周日（一周的最后一天）
            const startMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
            const startDay = String(weekStart.getDate()).padStart(2, '0');
            const endMonth = String(weekEnd.getMonth() + 1).padStart(2, '0');
            const endDay = String(weekEnd.getDate()).padStart(2, '0');
            displayDate = `${startMonth}-${startDay}～${endMonth}-${endDay}`;
          } else {
            displayDate = dateStr.substring(0, 7);
          }
          
          setTooltipData({
            x: x + 10, // 鼠标右侧10px
            y: y - 10, // 鼠标上方10px
            transactions: dayTransactions,
            date: displayDate,
          });
        } else {
          setTooltipData(null);
        }
      });

      // 图表创建完成后，立即加载数据
      loadKlineData();

      // 响应式调整
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      // 清理函数存储在chartRef上，以便在useEffect清理时调用
      (chartRef.current as any)._cleanup = () => {
        window.removeEventListener('resize', handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        candlestickSeriesRef.current = null;
      };

      // 图表创建完成后，立即加载数据
      loadKlineData();
    }, 100); // 延迟100ms确保DOM已挂载

    return () => {
      clearTimeout(timer);
      // 调用清理函数
      if ((chartRef.current as any)?._cleanup) {
        (chartRef.current as any)._cleanup();
      } else {
        // 如果没有清理函数，直接清理
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
        candlestickSeriesRef.current = null;
      }
    };
  }, [open, loadKlineData, loadTransactions]); // 添加loadKlineData和loadTransactions作为依赖

  // 加载交易数据
  useEffect(() => {
    if (open && stockCode) {
      loadTransactions();
    }
  }, [open, stockCode, loadTransactions]);

  // 当周期改变时，重新加载数据
  useEffect(() => {
    console.log('[K线图] 周期改变useEffect执行，period:', period, 'open:', open, 'chartRef:', !!chartRef.current, 'candlestickSeriesRef:', !!candlestickSeriesRef.current);
    if (!open || !chartRef.current || !candlestickSeriesRef.current) {
      console.log('[K线图] 周期改变但条件不满足，退出');
      return;
    }

    // 延迟一下，确保图表已经完全初始化
    const timer = setTimeout(() => {
      console.log('[K线图] 周期改变，重新加载数据');
      loadKlineData();
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [period, open, loadKlineData]);

  const handlePeriodChange = (_event: React.MouseEvent<HTMLElement>, newPeriod: KlinePeriod | null) => {
    if (newPeriod !== null) {
      setPeriod(newPeriod);
    }
  };

  const getPeriodLabel = (p: KlinePeriod): string => {
    switch (p) {
      case 'day':
        return '日K';
      case 'week':
        return '周K';
      case 'month':
        return '月K';
      default:
        return '日K';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {stockName} ({stockCode}) - K线图
          </Typography>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={handlePeriodChange}
            size="small"
            aria-label="K线周期"
          >
            <ToggleButton value="day" aria-label="日K">
              日K
            </ToggleButton>
            <ToggleButton value="week" aria-label="周K">
              周K
            </ToggleButton>
            <ToggleButton value="month" aria-label="月K">
              月K
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 1, position: 'relative' }}>
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
            }}
          >
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
            }}
          >
            <Typography color="error">{error}</Typography>
          </Box>
        )}
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: 500,
            minHeight: 500,
          }}
        >
          <Box
            ref={chartContainerRef}
            sx={{
              width: '100%',
              height: '100%',
            }}
          />
          <Box
            ref={badgeContainerRef}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
          {tooltipData && (
            <Box
              ref={tooltipRef}
              sx={{
                position: 'fixed',
                left: `${tooltipData.x}px`,
                top: `${tooltipData.y}px`,
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                pointerEvents: 'none',
                zIndex: 1000,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              <Box sx={{ marginBottom: '4px', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: '4px' }}>
                {tooltipData.date}
              </Box>
              {tooltipData.transactions.map((trans, idx) => (
                <Box key={idx} sx={{ marginTop: '2px' }}>
                  {trans.quantity > 0 ? '买' : '卖'} {trans.price.toFixed(3)}*{Math.abs(trans.quantity).toFixed(0)}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button size="small" onClick={onClose}>
          关闭
        </Button>
      </DialogActions>
    </Dialog>
  );
};
