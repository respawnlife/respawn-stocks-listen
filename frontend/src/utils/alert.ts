import { StockState, AlertRule } from '../types';

/**
 * 检查价格是否触发报警
 * 返回触发报警的规则数组
 */
export function checkPriceAlert(
  stockCode: string,
  currentPrice: number,
  stockState: StockState
): AlertRule[] {
  const triggeredAlerts: AlertRule[] = [];
  
  // 初始化alert_triggered Set
  if (!stockState.alert_triggered) {
    stockState.alert_triggered = new Set();
  }

  // 优先使用新的alerts数组
  if (stockState.alerts && stockState.alerts.length > 0) {
    const lastPrice = stockState.last_price;
    
    for (const alert of stockState.alerts) {
      const alertKey = `${alert.type}-${alert.price}`;
      let shouldTrigger = false;

      if (alert.type === 'up') {
        // 上涨报警：当前价格 >= 报警价格
        if (currentPrice >= alert.price) {
          // 如果之前没有触发过，或者价格从低于报警价格变为高于等于报警价格
          if (!stockState.alert_triggered.has(alertKey) || 
              (lastPrice !== null && lastPrice < alert.price)) {
            shouldTrigger = true;
            stockState.alert_triggered.add(alertKey);
          }
        } else {
          // 价格回到正常范围，移除触发标记（允许再次报警）
          stockState.alert_triggered.delete(alertKey);
        }
      } else if (alert.type === 'down') {
        // 下跌报警：当前价格 <= 报警价格
        if (currentPrice <= alert.price) {
          // 如果之前没有触发过，或者价格从高于报警价格变为低于等于报警价格
          if (!stockState.alert_triggered.has(alertKey) || 
              (lastPrice !== null && lastPrice > alert.price)) {
            shouldTrigger = true;
            stockState.alert_triggered.add(alertKey);
          }
        } else {
          // 价格回到正常范围，移除触发标记（允许再次报警）
          stockState.alert_triggered.delete(alertKey);
        }
      }

      if (shouldTrigger) {
        triggeredAlerts.push(alert);
      }
    }
  } else {
    // 向后兼容：使用旧的alert_up/alert_down
    const alertUp = stockState.alert_up;
    const alertDown = stockState.alert_down;
    const lastPrice = stockState.last_price;

    // 检查上升报警
    if (alertUp !== null && currentPrice >= alertUp) {
      const alertKey = `up-${alertUp}`;
      if (!stockState.alert_triggered.has(alertKey) || 
          (lastPrice !== null && lastPrice < alertUp)) {
        triggeredAlerts.push({ type: 'up', price: alertUp });
        stockState.alert_triggered.add(alertKey);
      }
    } else if (alertUp !== null && currentPrice < alertUp) {
      stockState.alert_triggered.delete(`up-${alertUp}`);
    }

    // 检查下跌报警
    if (alertDown !== null && currentPrice <= alertDown) {
      const alertKey = `down-${alertDown}`;
      if (!stockState.alert_triggered.has(alertKey) || 
          (lastPrice !== null && lastPrice > alertDown)) {
        triggeredAlerts.push({ type: 'down', price: alertDown });
        stockState.alert_triggered.add(alertKey);
      }
    } else if (alertDown !== null && currentPrice > alertDown) {
      stockState.alert_triggered.delete(`down-${alertDown}`);
    }
  }

  return triggeredAlerts;
}

/**
 * 播放报警声音
 */
export function playAlertSound(): void {
  try {
    // 使用 Web Audio API 播放提示音
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 1000; // 频率 1000Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.error('播放声音失败:', error);
    // 备用方案：使用浏览器通知
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('股票报警', {
        body: '价格达到报警阈值',
        icon: '/favicon.ico',
      });
    }
  }
}

/**
 * 显示浏览器通知
 */
export async function showNotification(title: string, body: string): Promise<void> {
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, { body });
      }
    }
  }
}
