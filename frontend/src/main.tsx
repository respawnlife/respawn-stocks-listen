import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './utils/importConfig'; // 导入配置工具
import { initializeConfig } from './services/storage';

// 请求通知权限
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// 直接渲染应用，配置初始化在 App 组件内部完成
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
