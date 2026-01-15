# 股票盯盘工具 - 前端版本

纯前端实现的股票盯盘工具，使用 React + Material-UI 构建。

## 功能特性

- ✅ 实时股票价格监控（A股）
- ✅ 持仓管理和盈亏计算
- ✅ 价格报警（声音+通知）
- ✅ 交易时间检查
- ✅ 历史数据保存（localStorage）
- ✅ 隐私模式
- ✅ 响应式设计

## 技术栈

- React 18
- Material-UI (MUI)
- TypeScript
- Vite
- Bun (包管理器)

## 安装和运行

```bash
# 安装依赖
bun install

# 开发模式
bun run dev

# 构建
bun run build

# 预览构建结果
bun run preview
```

## 配置说明

配置存储在浏览器的 localStorage 中，key 为 `holdings_config`。

可以通过浏览器控制台修改配置：

```javascript
// 读取配置
const config = JSON.parse(localStorage.getItem('holdings_config'));

// 修改配置
config.stocks['002255'] = {
  transactions: [
    { time: '2026-01-10 10:30:00', quantity: 400, price: 14.013 }
  ],
  alert_up: 15.0,
  alert_down: 13.0
};

// 保存配置
localStorage.setItem('holdings_config', JSON.stringify(config));

// 刷新页面即可生效
location.reload();
```

## 数据源

使用新浪财经 API 获取股票实时数据：
- API: `http://hq.sinajs.cn/list=sh600000,sz000001`
- 无需认证，免费使用
- 支持 A 股实时行情

## 注意事项

1. 由于浏览器的 CORS 限制，可能需要配置代理或使用支持 CORS 的 API
2. 历史数据存储在 localStorage，有大小限制（通常 5-10MB）
3. 建议定期导出重要数据
