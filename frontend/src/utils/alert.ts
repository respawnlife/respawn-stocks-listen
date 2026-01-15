import { StockState } from '../types';

/**
 * 检查价格是否触发报警
 */
export function checkPriceAlert(
  stockCode: string,
  currentPrice: number,
  stockState: StockState
): [boolean, boolean] {
  const alertUp = stockState.alert_up;
  const alertDown = stockState.alert_down;

  let triggeredUp = false;
  let triggeredDown = false;

  // 检查上升报警：当前价格 >= 报警价格
  if (alertUp !== null && currentPrice >= alertUp) {
    const lastPrice = stockState.last_price;
    if (
      !stockState.alert_triggered_up ||
      (lastPrice !== null && lastPrice < alertUp)
    ) {
      triggeredUp = true;
      stockState.alert_triggered_up = true;
    }
  }

  // 检查下跌报警：当前价格 <= 报警价格
  if (alertDown !== null && currentPrice <= alertDown) {
    const lastPrice = stockState.last_price;
    if (
      !stockState.alert_triggered_down ||
      (lastPrice !== null && lastPrice > alertDown)
    ) {
      triggeredDown = true;
      stockState.alert_triggered_down = true;
    }
  }

  // 如果价格回到正常范围，重置报警标记（允许再次报警）
  if (alertUp !== null && currentPrice < alertUp) {
    stockState.alert_triggered_up = false;
  }
  if (alertDown !== null && currentPrice > alertDown) {
    stockState.alert_triggered_down = false;
  }

  return [triggeredUp, triggeredDown];
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
