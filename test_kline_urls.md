# K线数据接口测试URL

股票代码：002255（海陆重工，深圳股票）

## 1. 东方财富API（当前使用）

### 日K线
```
http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.002255&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=0&end=20500000&lmt=250
```

### 周K线
```
http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.002255&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=102&fqt=1&beg=0&end=20500000&lmt=250
```

### 月K线
```
http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.002255&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=103&fqt=1&beg=0&end=20500000&lmt=250
```

## 2. 东方财富API（简化版，使用时间戳）

### 日K线（过去一年）
```
http://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.002255&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=1737014145&end=1768550145&lmt=250
```

## 3. 腾讯财经K线API

### 日K线
```
http://web.ifzq.gtimg.cn/app/kline/kline?param=sz002255,day,1,0,250,640,qfq
```

### 周K线
```
http://web.ifzq.gtimg.cn/app/kline/kline?param=sz002255,week,1,0,250,640,qfq
```

### 月K线
```
http://web.ifzq.gtimg.cn/app/kline/kline?param=sz002255,month,1,0,250,640,qfq
```

## 4. 新浪财经K线API

### 日K线
```
http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sz002255&scale=240&ma=no&datalen=250
```

### 周K线
```
http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sz002255&scale=1200&ma=no&datalen=250
```

### 月K线
```
http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sz002255&scale=4800&ma=no&datalen=250
```

## 5. 腾讯股票K线API（另一种格式）

```
http://stock.gtimg.cn/data/index.php?appn=kline&action=data&symbol=sz002255&interval=day&count=250
```

## 6. 同花顺K线API

```
http://d.10jqka.com.cn/v6/line/hs_002255/01/last.js
```

## 测试说明

1. 直接在浏览器中打开这些URL，查看返回的数据格式
2. 检查返回的JSON结构，特别是数据字段的位置
3. 如果某个接口返回了有效数据，告诉我具体是哪个接口和返回的数据格式

## 当前问题

从日志看，东方财富API返回了数据，但是 `json.data.klines` 可能不存在或为空。需要检查返回的JSON结构。
