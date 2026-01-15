import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './utils/importConfig'; // 导入配置工具
import { initializeConfig } from './services/storage';

// 请求通知权限
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// 初始化配置：如果 localStorage 中没有配置，使用前端项目内的默认配置初始化
initializeConfig().then(() => {
  // 配置初始化完成后，渲染应用
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
