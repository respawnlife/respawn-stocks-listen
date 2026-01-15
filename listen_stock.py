import time
import random
import json
import os
import sys
import warnings
import akshare as ak
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from rich.console import Console, Group
from rich.table import Table
from rich.live import Live
from rich.text import Text
from rich.box import ROUNDED

# 忽略urllib3的OpenSSL警告
warnings.filterwarnings('ignore', category=UserWarning, module='urllib3')

# -------------------------- 核心配置 --------------------------
# 注意：股票代码列表现在从配置文件读取，不再在这里定义
# 如需添加股票，请在 config/holdings.json 的 "stocks" 数组中添加股票代码

def calculate_holding_from_transactions(transactions: List[Dict]) -> Tuple[float, float]:
    """从交易记录数组计算总数量和平均成本价
    
    :param transactions: 交易记录数组，每个元素包含 time, quantity, price
    :return: (总数量, 平均成本价)
    """
    if not transactions or len(transactions) == 0:
        return 0.0, 0.0
    
    total_quantity = 0.0
    total_cost = 0.0
    
    for trans in transactions:
        quantity = float(trans.get('quantity', 0))
        price = float(trans.get('price', 0))
        if quantity > 0 and price > 0:
            total_quantity += quantity
            total_cost += quantity * price
    
    avg_price = total_cost / total_quantity if total_quantity > 0 else 0.0
    return total_quantity, avg_price


def load_holdings_config() -> Dict:
    """从JSON文件加载持仓配置和资金配置（新格式）
    
    新格式：stocks 中每个股票包含 transactions 数组
    旧格式兼容：如果存在 price/quantity，自动转换为 transactions 格式
    """
    if os.path.exists(HOLDINGS_CONFIG_FILE):
        try:
            with open(HOLDINGS_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                # 验证格式：必须包含funds和stocks字段
                if 'funds' not in config:
                    config['funds'] = {
                        'available_funds': 0.0,
                        'total_original_funds': 0.0
                    }
                if 'stocks' not in config or not isinstance(config['stocks'], dict):
                    config['stocks'] = {}
                
                # 兼容旧格式：将 price/quantity 转换为 transactions 格式
                needs_save = False
                for stock_code, stock_info in config['stocks'].items():
                    if isinstance(stock_info, dict):
                        # 如果是旧格式（有price和quantity，但没有transactions）
                        if 'transactions' not in stock_info and ('price' in stock_info or 'quantity' in stock_info):
                            old_price = stock_info.get('price', 0)
                            old_quantity = stock_info.get('quantity', 0)
                            if old_quantity > 0:
                                # 转换为新格式
                                config['stocks'][stock_code] = {
                                    'transactions': [{
                                        'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                        'quantity': old_quantity,
                                        'price': old_price
                                    }]
                                }
                                needs_save = True
                            else:
                                # 数量为0，设置为空数组
                                config['stocks'][stock_code] = {
                                    'transactions': []
                                }
                                needs_save = True
                        # 确保新格式有transactions字段
                        elif 'transactions' not in stock_info:
                            config['stocks'][stock_code] = {
                                'transactions': []
                            }
                            needs_save = True
                
                # 如果转换了旧格式，保存文件
                if needs_save:
                    try:
                        with open(HOLDINGS_CONFIG_FILE, 'w', encoding='utf-8') as f:
                            json.dump(config, f, ensure_ascii=False, indent=2)
                        print(f"已自动将旧格式转换为新格式: {HOLDINGS_CONFIG_FILE}")
                    except:
                        pass
                
                return config
        except Exception as e:
            print(f"警告：无法加载持仓配置文件 {HOLDINGS_CONFIG_FILE}: {e}")
            return {'funds': {'available_funds': 0.0, 'total_original_funds': 0.0}, 'stocks': {}}
    else:
        # 如果文件不存在，创建默认配置文件
        default_config = {
            'funds': {
                'available_funds': 0.0,
                'total_original_funds': 0.0
            },
            'stocks': {}
        }
        try:
            os.makedirs(os.path.dirname(HOLDINGS_CONFIG_FILE), exist_ok=True)
            with open(HOLDINGS_CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(default_config, f, ensure_ascii=False, indent=2)
            print(f"已创建默认持仓配置文件: {HOLDINGS_CONFIG_FILE}")
        except Exception as e:
            print(f"警告：无法创建持仓配置文件 {HOLDINGS_CONFIG_FILE}: {e}")
        return default_config

# 轮询间隔（秒），设置为0.5秒以减少封禁风险
POLL_INTERVAL = 0.5

# 防封禁配置
MIN_REQUEST_INTERVAL = 0.3  # 每个请求之间的最小间隔（秒）
MAX_RANDOM_DELAY = 0.2  # 随机延迟最大值（秒），增加随机性避免被识别为机器人
RETRY_DELAY = 2  # 重试延迟（秒）

# 缓存目录
CACHE_DIR = "./history"

# 持仓配置文件路径
HOLDINGS_CONFIG_FILE = "./config/holdings.json"

# 停止更新时间（15:01）
STOP_UPDATE_HOUR = 15
STOP_UPDATE_MINUTE = 1


def get_cache_file_path(date_str: Optional[str] = None) -> str:
    """获取缓存文件路径（按日期）"""
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")
    
    # 确保目录存在
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR, exist_ok=True)
    
    return os.path.join(CACHE_DIR, f"{date_str}.json")


def load_yesterday_close_cache(date_str: Optional[str] = None) -> Dict[str, float]:
    """从文件加载昨收价缓存（按日期）
    
    只支持新格式：{"date": "...", "stocks": [...]}
    从stocks数组中提取收盘价
    """
    cache_file = get_cache_file_path(date_str)
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                # 只处理新格式（包含date和stocks字段）
                if isinstance(data, dict) and 'date' in data and 'stocks' in data:
                    # 从stocks数组中提取收盘价
                    cache = {}
                    for stock in data.get('stocks', []):
                        code = stock.get('code')
                        price = stock.get('price')
                        if code and price is not None:
                            cache[code] = float(price)
                    return cache
                # 如果是数组格式（旧的新格式），取最后一个元素
                elif isinstance(data, list) and len(data) > 0:
                    last_item = data[-1]
                    if isinstance(last_item, dict) and 'date' in last_item and 'stocks' in last_item:
                        cache = {}
                        for stock in last_item.get('stocks', []):
                            code = stock.get('code')
                            price = stock.get('price')
                            if code and price is not None:
                                cache[code] = float(price)
                        return cache
                return {}
        except:
            return {}
    return {}


def save_yesterday_close_cache(cache: Dict[str, float], date_str: Optional[str] = None):
    """保存昨收价缓存到文件（按日期）"""
    try:
        cache_file = get_cache_file_path(date_str)
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        pass  # 静默失败


def get_stock_daily_data(stock_code: str, date_str: str) -> Optional[Dict]:
    """获取股票日K线数据（开/收/高/低/成交量等）"""
    try:
        if is_us_stock(stock_code):
            # 美股：使用stock_us_daily
            try:
                df = ak.stock_us_daily(symbol=stock_code, adjust="")
                if not df.empty:
                    # 查找指定日期的数据
                    df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
                    row = df[df['date'] == date_str]
                    if not row.empty:
                        return {
                            'open': float(row.iloc[0]['open']) if 'open' in row.columns else None,
                            'close': float(row.iloc[0]['close']) if 'close' in row.columns else None,
                            'high': float(row.iloc[0]['high']) if 'high' in row.columns else None,
                            'low': float(row.iloc[0]['low']) if 'low' in row.columns else None,
                            'volume': float(row.iloc[0]['volume']) if 'volume' in row.columns else None,
                            'amount': float(row.iloc[0]['amount']) if 'amount' in row.columns else None,
                        }
            except:
                pass
        else:
            # A股：使用stock_zh_a_daily
            try:
                code_with_prefix = f"sz{stock_code}" if stock_code.startswith(('00', '30')) else f"sh{stock_code}"
                # 获取最近的数据
                df = ak.stock_zh_a_daily(symbol=code_with_prefix, start_date=date_str.replace('-', ''), end_date=date_str.replace('-', ''), adjust="")
                if not df.empty:
                    row = df.iloc[0]
                    return {
                        'open': float(row['open']) if 'open' in row.index else None,
                        'close': float(row['close']) if 'close' in row.index else None,
                        'high': float(row['high']) if 'high' in row.index else None,
                        'low': float(row['low']) if 'low' in row.index else None,
                        'volume': float(row['volume']) if 'volume' in row.index else None,
                        'amount': float(row['amount']) if 'amount' in row.index else None,
                    }
            except:
                pass
        return None
    except:
        return None


def save_yesterday_history(stock_states: Dict[str, Dict], funds_config: Dict, yesterday_close_cache: Dict[str, float], target_date: str):
    """保存指定日期的历史数据（包含详细的K线数据）
    
    注意：当天数据只需要存最新状态，不需要存每一条历史记录
    历史数据应该包含完整信息，参照当天数据的格式
    """
    try:
        history_file = get_cache_file_path(target_date)
        
        # 计算统计数据
        total_holding_value = 0.0
        total_profit = 0.0
        stock_snapshots = []
        
        for code, state in stock_states.items():
            if state['last_price'] is not None:
                # 获取详细的K线数据（使用目标日期）
                kline_data = get_stock_daily_data(code, target_date)
                
                # 如果K线数据获取失败，尝试使用当前价格作为收盘价
                if kline_data is None:
                    kline_data = {
                        'open': None,
                        'close': state['last_price'],  # 使用当前价格作为收盘价
                        'high': None,
                        'low': None,
                        'volume': None,
                        'amount': None,
                    }
                
                # 计算持仓市值和盈亏
                holding_value = None
                profit = None
                if state['holding_quantity'] is not None and state['holding_quantity'] > 0:
                    # 使用K线数据的收盘价（如果有），否则使用当前价格
                    price_for_calc = kline_data.get('close') if kline_data and kline_data.get('close') is not None else state['last_price']
                    holding_value = price_for_calc * state['holding_quantity']
                    total_holding_value += holding_value
                    if state['holding_price'] is not None:
                        profit = (price_for_calc - state['holding_price']) * state['holding_quantity']
                        total_profit += profit
                
                # 使用K线数据的收盘价（如果有），否则使用当前价格
                final_price = kline_data.get('close') if kline_data and kline_data.get('close') is not None else state['last_price']
                
                snapshot = {
                    'code': code,
                    'name': state['last_stock_name'],
                    'price': final_price,  # 收盘价（优先使用K线数据）
                    'change_pct': state['last_change_pct'],  # 涨跌幅
                    'update_time': state['last_update_time'],  # 最后更新时间
                    'holding_price': state['holding_price'],  # 平均持仓成本价
                    'holding_quantity': state['holding_quantity'],  # 持仓总数量
                    'holding_value': holding_value,  # 持仓市值
                    'profit': profit,  # 单只股票盈亏
                    'yesterday_close': yesterday_close_cache.get(code),  # 昨收价（相对于目标日期）
                    'transactions': state.get('transactions', []),  # 交易记录数组
                    'kline': kline_data  # K线数据（开/收/高/低/成交量/成交额等）
                }
                stock_snapshots.append(snapshot)
        
        # 计算总资产
        available_funds = funds_config.get('available_funds', 0.0)
        total_original_funds = funds_config.get('total_original_funds', 0.0)
        total_assets = available_funds + total_holding_value
        
        # 构建完整的历史数据（单个对象，不是数组，因为只需要最新状态）
        history_data = {
            'date': target_date,
            'timestamp': datetime.now().isoformat(),
            'funds': {
                'available_funds': available_funds,
                'total_original_funds': total_original_funds,
                'total_assets': total_assets,
                'total_holding_value': total_holding_value,
                'total_profit': total_profit
            },
            'stocks': stock_snapshots
        }
        
        # 保存历史数据（单个对象，不是数组）
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(history_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        pass  # 静默失败


def should_stop_updating() -> bool:
    """判断是否应该停止更新（超过15:01）"""
    now = datetime.now()
    if now.hour > STOP_UPDATE_HOUR:
        return True
    if now.hour == STOP_UPDATE_HOUR and now.minute >= STOP_UPDATE_MINUTE:
        return True
    return False


def is_trading_time(stock_code: str, market_hours_config: Dict) -> bool:
    """判断当前时间是否在交易时间内
    
    :param stock_code: 股票代码
    :param market_hours_config: 市场交易时间配置
    :return: 是否在交易时间内
    """
    # 判断股票所属市场
    if is_us_stock(stock_code):
        market_name = "美股"
    else:
        market_name = "A股"
    
    # 获取市场配置
    market_config = market_hours_config.get(market_name, {})
    if not market_config.get('enabled', False):
        # 如果市场未启用，默认允许交易（向后兼容）
        return True
    
    # 检查是否为工作日
    now = datetime.now()
    weekday = now.weekday() + 1  # Python的weekday()返回0-6，0是周一，需要转换为1-7
    allowed_weekdays = market_config.get('weekdays', [1, 2, 3, 4, 5])
    if weekday not in allowed_weekdays:
        return False
    
    # 获取当前时间（时:分）
    current_time = now.strftime("%H:%M")
    
    # 检查上午交易时间
    morning = market_config.get('morning')
    if morning:
        morning_start = morning.get('start', '09:30')
        morning_end = morning.get('end', '11:30')
        # 处理跨日交易（如美股：22:30 - 05:00）
        if morning_start > morning_end:
            # 跨日交易：从晚上到第二天早上
            if current_time >= morning_start or current_time <= morning_end:
                return True
        else:
            # 正常交易：同一天内
            if morning_start <= current_time <= morning_end:
                return True
    
    # 检查下午交易时间
    afternoon = market_config.get('afternoon')
    if afternoon:
        afternoon_start = afternoon.get('start', '13:00')
        afternoon_end = afternoon.get('end', '15:00')
        # 下午交易时间通常不会跨日
        if afternoon_start <= current_time <= afternoon_end:
            return True
    
    return False


def is_us_stock(stock_code: str) -> bool:
    """判断是否为美股代码（美股代码通常是字母，如TSLA、AAPL）"""
    return stock_code.isalpha() and len(stock_code) >= 1 and len(stock_code) <= 5


def get_realtime_price(stock_code: str, yesterday_close_cache: Dict[str, float]) -> Optional[Tuple[float, str, float, str]]:
    """
    获取股票实时价格
    :param stock_code: 股票代码（如002255、TSLA）
    :param yesterday_close_cache: 昨收价缓存字典
    :return: (价格, 股票名称, 昨收价, 更新时间) 或 None
    """
    try:
        # 获取昨天的日期字符串（用于缓存文件）
        yesterday_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # 判断是否为美股
        is_us = is_us_stock(stock_code)
        
        if is_us:
            # 美股：使用雪球接口（雪球支持美股）
            try:
                # 美股代码直接使用，不需要前缀
                df = ak.stock_individual_spot_xq(symbol=stock_code, timeout=3)
                if df is not None and not df.empty:
                    # 雪球返回的是item-value格式的DataFrame
                    full_data = {}
                    for _, row in df.iterrows():
                        full_data[row['item']] = row['value']
                    
                    # 获取现价
                    price_value = full_data.get('现价') or full_data.get('最新')
                    if price_value:
                        current_price = float(price_value)
                        current_time = datetime.now()
                        
                        # 获取股票名称
                        stock_name = full_data.get('名称', stock_code)
                        
                        # 获取昨收价
                        yesterday_close = yesterday_close_cache.get(stock_code)
                        if yesterday_close is None:
                            file_cache = load_yesterday_close_cache(yesterday_date)
                            yesterday_close = file_cache.get(stock_code)
                            if yesterday_close is None:
                                # 从接口获取昨收
                                yesterday_close_value = full_data.get('昨收')
                                if yesterday_close_value:
                                    yesterday_close = float(yesterday_close_value)
                                    yesterday_close_cache[stock_code] = yesterday_close
                                    file_cache[stock_code] = yesterday_close
                                    save_yesterday_close_cache(file_cache, yesterday_date)
                                else:
                                    yesterday_close = current_price
                        
                        # 格式化为 H:i:s.ms
                        update_time = current_time.strftime("%H:%M:%S") + f".{current_time.microsecond // 1000:03d}"
                        return current_price, stock_name, yesterday_close, update_time
            except:
                pass
        else:
            # A股：使用原有逻辑
            code_with_prefix = f"sz{stock_code}" if stock_code.startswith(('00', '30')) else f"sh{stock_code}"
            
            # 方法1：使用东方财富单个股票接口
            try:
                df = ak.stock_individual_info_em(symbol=stock_code, timeout=3)
                
                if not df.empty:
                    full_data = {}
                    for _, row in df.iterrows():
                        full_data[row['item']] = row['value']
                    
                    price_row = df[df['item'] == '最新']
                    if not price_row.empty:
                        current_price = float(price_row.iloc[0]['value'])
                        current_time = datetime.now()
                        
                        # 获取股票名称
                        name_row = df[df['item'] == '股票简称']
                        stock_name = name_row.iloc[0]['value'] if not name_row.empty else code_with_prefix
                        
                        # 获取昨收价（优先从缓存，缓存没有则从文件，文件没有则联网获取）
                        yesterday_close = yesterday_close_cache.get(stock_code)
                        
                        if yesterday_close is None:
                            # 从文件加载缓存（使用昨天的日期）
                            file_cache = load_yesterday_close_cache(yesterday_date)
                            yesterday_close = file_cache.get(stock_code)
                            
                            if yesterday_close is None:
                                # 文件也没有，联网获取
                                try:
                                    spot_df = ak.stock_zh_a_spot_em()
                                    stock_row = spot_df[spot_df['代码'] == stock_code]
                                    if not stock_row.empty and '昨收' in stock_row.columns:
                                        yesterday_close = float(stock_row.iloc[0]['昨收'])
                                        # 更新内存缓存和文件缓存
                                        yesterday_close_cache[stock_code] = yesterday_close
                                        file_cache[stock_code] = yesterday_close
                                        save_yesterday_close_cache(file_cache, yesterday_date)
                                except:
                                    pass
                        
                        # 如果还是没有找到昨收，使用当前价格
                        if yesterday_close is None:
                            yesterday_close = current_price
                        
                        # 格式化为 H:i:s.ms
                        update_time = current_time.strftime("%H:%M:%S") + f".{current_time.microsecond // 1000:03d}"
                        return current_price, stock_name, yesterday_close, update_time
            except:
                pass
            
            # 方法2：使用雪球接口（备用）
            try:
                df = ak.stock_individual_spot_xq(symbol=code_with_prefix, timeout=3)
                if df is not None and not df.empty:
                    # 检查返回格式：可能是item-value格式或直接是DataFrame
                    if 'item' in df.columns and 'value' in df.columns:
                        # item-value格式
                        full_data = {}
                        for _, row in df.iterrows():
                            full_data[row['item']] = row['value']
                        price_value = full_data.get('现价') or full_data.get('最新')
                        stock_name = full_data.get('名称', code_with_prefix)
                        yesterday_close_value = full_data.get('昨收')
                    else:
                        # 直接DataFrame格式
                        if '现价' in df.columns:
                            price_value = df.iloc[0]['现价']
                            stock_name = df.iloc[0].get('名称', code_with_prefix) if '名称' in df.columns else code_with_prefix
                            yesterday_close_value = df.iloc[0].get('昨收') if '昨收' in df.columns else None
                        else:
                            price_value = None
                            stock_name = code_with_prefix
                            yesterday_close_value = None
                    
                    if price_value:
                        current_price = float(price_value)
                        current_time = datetime.now()
                        
                        yesterday_close = yesterday_close_cache.get(stock_code)
                        if yesterday_close is None:
                            file_cache = load_yesterday_close_cache(yesterday_date)
                            yesterday_close = file_cache.get(stock_code)
                            if yesterday_close is None:
                                if yesterday_close_value:
                                    yesterday_close = float(yesterday_close_value)
                                    yesterday_close_cache[stock_code] = yesterday_close
                                    file_cache[stock_code] = yesterday_close
                                    save_yesterday_close_cache(file_cache, yesterday_date)
                                else:
                                    yesterday_close = current_price
                        
                        # 格式化为 H:i:s.ms
                        update_time = current_time.strftime("%H:%M:%S") + f".{current_time.microsecond // 1000:03d}"
                        return current_price, stock_name, yesterday_close, update_time
            except:
                pass
        
        return None
    except:
        return None


def format_price(price: Optional[float]) -> str:
    """格式化价格：保留3位小数，去掉末尾的0"""
    if price is None:
        return "--"
    # 格式化为3位小数，然后去掉末尾的0
    formatted = f"{price:.3f}"
    # 去掉末尾的0，如果小数点后全为0，也去掉小数点
    return formatted.rstrip('0').rstrip('.')


def format_price_fixed(price: Optional[float]) -> str:
    """格式化价格：固定两位小数，不trim掉0（用于现价和成本价显示）"""
    if price is None:
        return "--"
    return f"{price:.2f}"


def format_privacy_value(value, privacy_mode: bool) -> str:
    """根据隐私模式格式化显示值
    
    :param value: 要显示的值（可以是字符串、数字等）
    :param privacy_mode: 是否启用隐私模式
    :return: 格式化后的字符串
    """
    if privacy_mode:
        return "***"
    if value is None:
        return "--"
    return str(value)


def get_stock_name(stock_code: str) -> str:
    """获取股票名称（用于显示，默认显示代码）"""
    if is_us_stock(stock_code):
        return stock_code  # 美股直接返回代码
    else:
        code_with_prefix = f"sz{stock_code}" if stock_code.startswith(('00', '30')) else f"sh{stock_code}"
        return code_with_prefix


def play_alert_sound():
    """播放报警声音"""
    try:
        if os.name == 'nt':  # Windows
            import winsound
            winsound.Beep(1000, 500)  # 频率1000Hz，持续500ms
        elif os.name == 'posix':  # macOS/Linux
            # macOS使用系统声音
            if sys.platform == 'darwin':
                os.system('afplay /System/Library/Sounds/Glass.aiff 2>/dev/null || say "alert" 2>/dev/null')
            else:  # Linux
                os.system('beep -f 1000 -l 500 2>/dev/null || echo -e "\a"')
    except:
        # 如果播放声音失败，使用简单的终端响铃
        print('\a', end='', flush=True)


def check_price_alert(stock_code: str, current_price: float, stock_states: Dict[str, Dict]):
    """检查价格是否触发报警
    
    :param stock_code: 股票代码
    :param current_price: 当前价格
    :param stock_states: 股票状态字典
    :return: (是否触发上升报警, 是否触发下跌报警)
    """
    if stock_code not in stock_states:
        return False, False
    
    state = stock_states[stock_code]
    alert_up = state.get('alert_up')
    alert_down = state.get('alert_down')
    
    triggered_up = False
    triggered_down = False
    
    # 检查上升报警：当前价格 >= 报警价格
    if alert_up is not None and current_price >= alert_up:
        # 如果之前没有触发过，或者价格从低于报警价格变为高于等于报警价格
        last_price = state.get('last_price')
        if not state.get('alert_triggered_up', False) or (last_price is not None and last_price < alert_up):
            triggered_up = True
            state['alert_triggered_up'] = True
    
    # 检查下跌报警：当前价格 <= 报警价格
    if alert_down is not None and current_price <= alert_down:
        # 如果之前没有触发过，或者价格从高于报警价格变为低于等于报警价格
        last_price = state.get('last_price')
        if not state.get('alert_triggered_down', False) or (last_price is not None and last_price > alert_down):
            triggered_down = True
            state['alert_triggered_down'] = True
    
    # 如果价格回到正常范围，重置报警标记（允许再次报警）
    if alert_up is not None and current_price < alert_up:
        state['alert_triggered_up'] = False
    if alert_down is not None and current_price > alert_down:
        state['alert_triggered_down'] = False
    
    return triggered_up, triggered_down


def listen_stocks():
    """监听多个股票行情"""
    # 获取昨天的日期字符串（用于缓存文件）
    yesterday_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    # 加载昨收价缓存
    yesterday_close_cache = load_yesterday_close_cache(yesterday_date)
    
    # 加载持仓配置和资金配置
    config = load_holdings_config()
    funds_config = config.get('funds', {})
    stocks_config = config.get('stocks', {})
    privacy_mode = config.get('privacy_mode', False)  # 隐私模式配置
    market_hours_config = config.get('market_hours', {})  # 市场交易时间配置
    
    # 记录配置文件的最后修改时间
    config_file_mtime = 0
    if os.path.exists(HOLDINGS_CONFIG_FILE):
        config_file_mtime = os.path.getmtime(HOLDINGS_CONFIG_FILE)
    
    # 如果没有配置股票列表，提示错误
    if not stocks_config:
        print("错误：配置文件中没有股票代码，请在 config/holdings.json 的 'stocks' 对象中添加股票代码")
        return
    
    # 获取股票代码列表
    stock_codes = list(stocks_config.keys())
    
    # 获取资金信息
    available_funds = funds_config.get('available_funds', 0.0)
    total_original_funds = funds_config.get('total_original_funds', 0.0)
    
    # 为每个股票维护最后的价格
    stock_states: Dict[str, Dict] = {}
    for code in stock_codes:
        # 从JSON配置中读取持仓信息（新格式：transactions数组）
        stock_info = stocks_config.get(code, {})
        transactions = stock_info.get('transactions', []) if isinstance(stock_info, dict) else []
        
        # 从transactions数组计算总数量和平均成本价
        holding_quantity, holding_price = calculate_holding_from_transactions(transactions)
        
        # 读取报警价格配置
        alert_up = stock_info.get('alert_up') if isinstance(stock_info, dict) else None
        alert_down = stock_info.get('alert_down') if isinstance(stock_info, dict) else None
        if alert_up is not None:
            alert_up = float(alert_up)
        if alert_down is not None:
            alert_down = float(alert_down)
        
        stock_states[code] = {
            'last_price': None,
            'last_time': None,
            'last_stock_name': get_stock_name(code),
            'last_update_time': '--',
            'last_change_pct': 0.0,
            'holding_price': holding_price if holding_quantity > 0 else None,  # 平均持仓成本价
            'holding_quantity': holding_quantity,  # 持仓总数量
            'transactions': transactions,  # 保存原始交易记录
            'alert_up': alert_up,  # 上升报警价格
            'alert_down': alert_down,  # 下跌报警价格
            'alert_triggered_up': False,  # 标记是否已触发上升报警（避免重复报警）
            'alert_triggered_down': False,  # 标记是否已触发下跌报警（避免重复报警）
        }
    
    def reload_config_if_changed():
        """检查配置文件是否被修改，如果修改则重新加载配置"""
        nonlocal config, funds_config, stocks_config, privacy_mode, market_hours_config
        nonlocal stock_codes, available_funds, total_original_funds, config_file_mtime
        
        if not os.path.exists(HOLDINGS_CONFIG_FILE):
            return False
        
        current_mtime = os.path.getmtime(HOLDINGS_CONFIG_FILE)
        if current_mtime <= config_file_mtime:
            return False  # 文件未修改
        
        # 文件被修改了，重新加载配置
        try:
            new_config = load_holdings_config()
            new_funds_config = new_config.get('funds', {})
            new_stocks_config = new_config.get('stocks', {})
            new_privacy_mode = new_config.get('privacy_mode', False)
            new_market_hours_config = new_config.get('market_hours', {})
            
            # 更新配置
            funds_config = new_funds_config
            stocks_config = new_stocks_config
            privacy_mode = new_privacy_mode
            market_hours_config = new_market_hours_config
            available_funds = funds_config.get('available_funds', 0.0)
            total_original_funds = funds_config.get('total_original_funds', 0.0)
            
            # 更新股票代码列表
            new_stock_codes = list(stocks_config.keys())
            
            # 更新现有股票的持仓信息
            for code in new_stock_codes:
                stock_info = stocks_config.get(code, {})
                transactions = stock_info.get('transactions', []) if isinstance(stock_info, dict) else []
                holding_quantity, holding_price = calculate_holding_from_transactions(transactions)
                
                # 读取报警价格配置
                alert_up = stock_info.get('alert_up') if isinstance(stock_info, dict) else None
                alert_down = stock_info.get('alert_down') if isinstance(stock_info, dict) else None
                if alert_up is not None:
                    alert_up = float(alert_up)
                if alert_down is not None:
                    alert_down = float(alert_down)
                
                if code in stock_states:
                    # 更新现有股票的持仓信息，保留价格数据
                    stock_states[code]['holding_price'] = holding_price if holding_quantity > 0 else None
                    stock_states[code]['holding_quantity'] = holding_quantity
                    stock_states[code]['transactions'] = transactions
                    # 更新报警价格配置
                    stock_states[code]['alert_up'] = alert_up
                    stock_states[code]['alert_down'] = alert_down
                    # 重置报警标记（允许新配置触发报警）
                    stock_states[code]['alert_triggered_up'] = False
                    stock_states[code]['alert_triggered_down'] = False
                else:
                    # 新增股票，初始化状态
                    stock_states[code] = {
                        'last_price': None,
                        'last_time': None,
                        'last_stock_name': get_stock_name(code),
                        'last_update_time': '--',
                        'last_change_pct': 0.0,
                        'holding_price': holding_price if holding_quantity > 0 else None,
                        'holding_quantity': holding_quantity,
                        'transactions': transactions,
                        'alert_up': alert_up,
                        'alert_down': alert_down,
                        'alert_triggered_up': False,
                        'alert_triggered_down': False,
                    }
            
            # 移除已删除的股票（可选：保留但不再更新，或者直接删除）
            # 这里选择保留已删除股票的数据，但不再更新
            # 如果需要完全移除，可以取消下面的注释
            # removed_codes = set(stock_states.keys()) - set(new_stock_codes)
            # for code in removed_codes:
            #     del stock_states[code]
            
            stock_codes = new_stock_codes
            config_file_mtime = current_mtime
            
            return True  # 配置已更新
        except Exception as e:
            # 配置加载失败，不更新
            return False
    
    last_request_time = 0
    console = Console()
    initialized = False  # 标记是否已初始化完成
    
    def generate_display():
        """生成要显示的内容（从stock_states读取数据）"""
        # 收集所有股票数据
        stock_data_list = []
        total_holding_value = 0.0  # 总持仓市值（用于计算总盈余）
        
        for stock_code in stock_codes:
            state = stock_states[stock_code]
            if state['last_price'] is not None:
                # 计算单只股票的盈余和持仓市值
                profit = None
                holding_value = None
                # 持仓市值 = 当前股价 × 持仓数量（只要有持仓数量就计算）
                if state['holding_quantity'] is not None and state['holding_quantity'] > 0:
                    holding_value = state['last_price'] * state['holding_quantity']
                    total_holding_value += holding_value
                    # 如果有持仓价格，计算单只股票的盈亏
                    if state['holding_price'] is not None:
                        profit = (state['last_price'] - state['holding_price']) * state['holding_quantity']
                
                stock_data_list.append({
                    'code': stock_code,
                    'name': state['last_stock_name'],
                    'price': state['last_price'],
                    'change_pct': state['last_change_pct'],
                    'holding_price': state['holding_price'],
                    'holding_quantity': state['holding_quantity'],
                    'profit': profit,
                    'update_time': state['last_update_time']
                })
            else:
                stock_data_list.append({
                    'code': stock_code,
                    'name': state['last_stock_name'],
                    'price': None,
                    'change_pct': None,
                    'holding_price': state['holding_price'],
                    'holding_quantity': state['holding_quantity'],
                    'profit': None,
                    'update_time': '--'
                })
        
        # 计算整体涨跌比
        valid_change_pcts = [d['change_pct'] for d in stock_data_list if d['change_pct'] is not None]
        overall_change_pct = sum(valid_change_pcts) / len(valid_change_pcts) if valid_change_pcts else 0.0
        
        # 当前时间
        current_time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
        # 创建表格（使用蓝色背景和白色文字）
        table = Table(
            show_header=True, 
            header_style="bold white on blue",
            box=ROUNDED,
            border_style="blue",
            row_styles=["white on blue", "white on bright_blue"],
            padding=(0, 1)
        )
        # 文字颜色统一为白色，涨跌比单独处理
        table.add_column("名称", style="white", width=14, header_style="bold white on blue", justify="left")
        table.add_column("代码", style="white", width=10, header_style="bold white on blue", justify="left")
        table.add_column("现价", justify="right", style="white", width=8, header_style="bold white on blue")
        table.add_column("涨跌幅", justify="right", style="white", width=8, header_style="bold white on blue")
        table.add_column("成本价", justify="right", style="white", width=8, header_style="bold white on blue")
        table.add_column("数量", justify="right", style="white", width=8, header_style="bold white on blue")
        table.add_column("盈亏", justify="right", style="white", width=20, header_style="bold white on blue")
        table.add_column("时间", justify="right", style="white", width=14, header_style="bold white on blue")
        
        # 添加数据行
        for data in stock_data_list:
            if data['price'] is not None:
                # 股票名称和代码：隐私模式隐藏
                name = format_privacy_value(data['name'], privacy_mode)
                code = format_privacy_value(data['code'], privacy_mode)
                # 现价：固定两位小数，不trim掉0
                price_str = format_price_fixed(data['price'])
                
                # 涨跌比：红涨绿跌（中国股市标准），在蓝色背景上显示
                change_pct = data['change_pct']
                if change_pct is not None:
                    if change_pct > 0:
                        change_str = Text(f"{change_pct:+.2f}%", style="bold red on blue")
                    elif change_pct < 0:
                        change_str = Text(f"{change_pct:+.2f}%", style="bold green on blue")
                    else:
                        change_str = Text(f"{change_pct:+.2f}%", style="white on blue")
                else:
                    change_str = Text("--", style="white on blue")
                
                # 持仓价格（成本价）：隐私模式隐藏
                if privacy_mode:
                    holding_price_str = "***"
                else:
                    holding_price_str = format_price_fixed(data['holding_price'])
                
                # 持仓数量：隐私模式隐藏
                if privacy_mode:
                    holding_quantity_str = "***"
                else:
                    holding_quantity_str = f"{int(data['holding_quantity'])}" if data['holding_quantity'] is not None else "--"
                
                # 盈余（格式：金额(百分比)），隐私模式只隐藏金额，保留百分比
                if data['profit'] is not None:
                    profit_amount = data['profit']
                    # 计算盈亏百分比：盈亏金额 / 持仓成本 * 100
                    profit_pct = None
                    if data['holding_price'] is not None and data['holding_quantity'] is not None and data['holding_quantity'] > 0:
                        holding_cost = data['holding_price'] * data['holding_quantity']
                        if holding_cost > 0:
                            profit_pct = (profit_amount / holding_cost) * 100
                    
                    if profit_pct is not None:
                        if privacy_mode:
                            profit_str = f"***({profit_pct:+.2f}%)"
                        else:
                            profit_str = f"{profit_amount:+.2f}({profit_pct:+.2f}%)"
                    else:
                        profit_str = format_privacy_value(f"{profit_amount:+.2f}", privacy_mode)
                else:
                    profit_str = "--"
                
                time_str = data['update_time']
                table.add_row(
                    name, 
                    code, 
                    price_str, 
                    change_str, 
                    holding_price_str, 
                    holding_quantity_str, 
                    profit_str, 
                    time_str
                )
            else:
                # 股票名称和代码：隐私模式隐藏
                name = format_privacy_value(data['name'], privacy_mode)
                code = format_privacy_value(data['code'], privacy_mode)
                # 成本价和数量：隐私模式隐藏
                if privacy_mode:
                    holding_price_str = "***"
                    holding_quantity_str = "***"
                else:
                    holding_price_str = format_price_fixed(data['holding_price'])
                    holding_quantity_str = f"{int(data['holding_quantity'])}" if data['holding_quantity'] is not None else "--"
                table.add_row(
                    name, 
                    code, 
                    "获取数据失败", 
                    "--", 
                    holding_price_str, 
                    holding_quantity_str, 
                    "--", 
                    data['update_time']
                )
                    
        # 计算总资产（可动用资金 + 持仓市值）
        total_assets = available_funds + total_holding_value
        
        # 计算持仓股票数量（有持仓配置的股票数量）
        holding_stock_count = sum(1 for code in stock_codes 
                                 if stock_states[code]['holding_price'] is not None 
                                 and stock_states[code]['holding_quantity'] is not None)
        
        # 计算仓位百分比（持仓市值 / 总资产 * 100）
        position_pct = (total_holding_value / total_assets * 100) if total_assets > 0 else 0.0
        
        # 计算总盈余：总资产 - 总原始资金（本金）
        # 总资产 = 可用资金 + 持仓市值
        # 如果总资产 < 本金，则为亏损（负数）
        total_profit = total_assets - total_original_funds
        
        # 创建统计信息（使用白色文字，按示例格式）
        stats_text = Text()
        
        # 计算盈亏百分比
        total_profit_pct = None
        if total_original_funds > 0:
            total_profit_pct = (total_profit / total_original_funds) * 100
        
        # 第一行：时间:2026-01-15 10:19:43 | 自选股:2 | 涨跌幅:-2.54% | 持仓:1 | 盈亏:-343.87(-3.44%)
        stats_text.append(f"时间:{current_time_str}", style="bold white")
        stats_text.append(" | ", style="white")
        stats_text.append(f"自选:{len(stock_codes)}", style="white")
        stats_text.append(" | ", style="white")
        # 涨跌幅：红涨绿跌
        if overall_change_pct > 0:
            stats_text.append(f"涨跌幅:{overall_change_pct:+.2f}%", style="bold red")
        elif overall_change_pct < 0:
            stats_text.append(f"涨跌幅:{overall_change_pct:+.2f}%", style="bold green")
        else:
            stats_text.append(f"涨跌幅:{overall_change_pct:+.2f}%", style="white")
        stats_text.append(" | ", style="white")
        stats_text.append(f"持仓:{holding_stock_count}", style="white")
        stats_text.append(" | ", style="white")
        # 盈亏：金额(百分比)，隐私模式只隐藏金额，保留百分比
        if total_profit_pct is not None:
            if privacy_mode:
                # 隐私模式：只显示百分比
                if total_profit_pct > 0:
                    stats_text.append(f"盈亏:***({total_profit_pct:+.2f}%)", style="bold red")
                elif total_profit_pct < 0:
                    stats_text.append(f"盈亏:***({total_profit_pct:+.2f}%)", style="bold green")
                else:
                    stats_text.append(f"盈亏:***({total_profit_pct:+.2f}%)", style="white")
            else:
                if total_profit > 0:
                    stats_text.append(f"盈亏:{total_profit:+.2f}({total_profit_pct:+.2f}%)", style="bold red")
                elif total_profit < 0:
                    stats_text.append(f"盈亏:{total_profit:+.2f}({total_profit_pct:+.2f}%)", style="bold green")
                else:
                    stats_text.append(f"盈亏:{total_profit:+.2f}({total_profit_pct:+.2f}%)", style="white")
        else:
            if privacy_mode:
                stats_text.append("盈亏:***", style="white")
            else:
                stats_text.append(f"盈亏:{total_profit:+.2f}", style="white")
        stats_text.append("\n")
        
        # 第二行：本金:10000.00 | 实时市值:9656.13 | 持仓市值:5308.00 | 可用资金:4348.13 | 仓位:54.97%
        # 本金：隐私模式隐藏
        if privacy_mode:
            stats_text.append("本金:***", style="white")
        else:
            stats_text.append(f"本金:{total_original_funds:.2f}", style="white")
        stats_text.append(" | ", style="white")
        # 实时市值：隐私模式隐藏
        if privacy_mode:
            stats_text.append("实时市值:***", style="bold white")
        else:
            stats_text.append(f"实时市值:{total_assets:.2f}", style="bold white")
        stats_text.append(" | ", style="white")
        # 持仓市值：隐私模式隐藏
        if privacy_mode:
            stats_text.append("持仓市值:***", style="white")
        else:
            stats_text.append(f"持仓市值:{total_holding_value:.2f}", style="white")
        stats_text.append(" | ", style="white")
        # 可用资金：隐私模式隐藏
        if privacy_mode:
            stats_text.append("可用资金:***", style="white")
        else:
            stats_text.append(f"可用资金:{available_funds:.2f}", style="white")
        stats_text.append(" | ", style="white")
        stats_text.append(f"仓位:{position_pct:.2f}%", style="white")
        
        # 组合输出
        return Group(stats_text, table)
    
    # 初始化阶段：先获取一次数据，不显示rich界面（不检查交易时间，确保能获取到初始数据）
    print("正在初始化，获取股票数据...")
    for stock_code in stock_codes:
        result = get_realtime_price(stock_code, yesterday_close_cache)
        if result:
            current_price, stock_name, yesterday_close, update_time = result
            # 计算基于昨收的涨跌比
            if yesterday_close and yesterday_close > 0:
                change_pct = ((current_price - yesterday_close) / yesterday_close) * 100
            else:
                change_pct = 0.0
            
            # 检查价格报警（初始化时也检查）
            triggered_up, triggered_down = check_price_alert(stock_code, current_price, stock_states)
            if triggered_up or triggered_down:
                # 触发报警：播放声音和终端闪烁
                play_alert_sound()
                # 终端闪烁（使用ANSI转义码）
                if triggered_up:
                    print(f"\033[5m\033[93m⚠️  报警：{stock_name}({stock_code}) 价格上升至 {current_price:.2f}，达到报警价格 {stock_states[stock_code].get('alert_up'):.2f}\033[0m", flush=True)
                if triggered_down:
                    print(f"\033[5m\033[91m⚠️  报警：{stock_name}({stock_code}) 价格下跌至 {current_price:.2f}，达到报警价格 {stock_states[stock_code].get('alert_down'):.2f}\033[0m", flush=True)
            
            stock_states[stock_code]['last_price'] = current_price
            stock_states[stock_code]['last_time'] = datetime.now()
            stock_states[stock_code]['last_stock_name'] = stock_name
            stock_states[stock_code]['last_update_time'] = update_time
            stock_states[stock_code]['last_change_pct'] = change_pct
            initialized = True
        
        # 每个股票请求之间添加小延迟
        if stock_code != stock_codes[-1]:
            time.sleep(0.2)
    
    # 如果初始化失败，提示并退出
    if not initialized:
        print("错误：无法获取股票数据，请检查网络连接和股票代码")
        return
    
    # 初始化完成，清屏后开始使用rich界面显示
    os.system('clear' if os.name != 'nt' else 'cls')  # Linux/Mac 使用 clear，Windows 使用 cls
    
    # 初始化当前日期
    last_saved_date = datetime.now().strftime("%Y-%m-%d")
    
    # 使用Live进行实时更新（screen=True 表示全屏显示，不滚动，类似 top 命令）
    try:
        with Live(generate_display(), refresh_per_second=2, screen=True) as live:
            while True:
                try:
                    # 检查是否应该停止更新（超过15:01）
                    stop_updating = should_stop_updating()
                    
                    if not stop_updating:
                        # 遍历所有股票，收集数据
                        for stock_code in stock_codes:
                            # 检查是否在交易时间内
                            if not is_trading_time(stock_code, market_hours_config):
                                # 不在交易时间，跳过该股票
                                continue
                            
                            # 防封禁：确保请求间隔
                            current_time = time.time()
                            time_since_last = current_time - last_request_time
                            if time_since_last < MIN_REQUEST_INTERVAL:
                                sleep_time = MIN_REQUEST_INTERVAL - time_since_last + random.uniform(0, MAX_RANDOM_DELAY)
                                time.sleep(sleep_time)
                            
                            last_request_time = time.time()
                            result = get_realtime_price(stock_code, yesterday_close_cache)
                            stock_name = get_stock_name(stock_code)  # 默认名称
                            
                            if result:
                                current_price, stock_name, yesterday_close, update_time = result
                                last_price = stock_states[stock_code]['last_price']
                                last_time = stock_states[stock_code]['last_time']
                                
                                # 计算基于昨收的涨跌比
                                if yesterday_close and yesterday_close > 0:
                                    change_pct = ((current_price - yesterday_close) / yesterday_close) * 100
                                else:
                                    change_pct = 0.0
                                
                                # 检查价格报警
                                triggered_up, triggered_down = check_price_alert(stock_code, current_price, stock_states)
                                if triggered_up or triggered_down:
                                    # 触发报警：播放声音和终端闪烁
                                    play_alert_sound()
                                    # 终端闪烁（使用ANSI转义码）
                                    if triggered_up:
                                        print(f"\033[5m\033[93m⚠️  报警：{stock_name}({stock_code}) 价格上升至 {current_price:.2f}，达到报警价格 {stock_states[stock_code].get('alert_up'):.2f}\033[0m", flush=True)
                                    if triggered_down:
                                        print(f"\033[5m\033[91m⚠️  报警：{stock_name}({stock_code}) 价格下跌至 {current_price:.2f}，达到报警价格 {stock_states[stock_code].get('alert_down'):.2f}\033[0m", flush=True)
                                
                                # 如果价格有变化，或者距离上次打印超过1秒，则更新状态
                                current_datetime = datetime.now()
                                should_update = (last_price != current_price or 
                                               last_time is None or 
                                               (current_datetime - last_time).total_seconds() >= 1)
                                
                                if should_update:
                                    stock_states[stock_code]['last_price'] = current_price
                                    stock_states[stock_code]['last_time'] = current_datetime
                                    stock_states[stock_code]['last_stock_name'] = stock_name
                                    stock_states[stock_code]['last_update_time'] = update_time
                                    stock_states[stock_code]['last_change_pct'] = change_pct
                            else:
                                # 获取数据失败，尝试使用上次数据
                                if stock_states[stock_code]['last_price'] is None:
                                    # 没有上次数据，保持默认状态
                                    pass
                            
                            # 每个股票请求之间添加小延迟
                            if stock_code != stock_codes[-1]:
                                time.sleep(0.2)
                    # 如果超过15:01，不再从接口更新数据，但程序继续运行，界面继续显示
                    
                    # Live会自动调用generate_display()更新显示，但也可以手动触发
                    live.update(generate_display())
                    
                    # 检查配置文件是否被修改，如果修改则重新加载配置（动态更新）
                    reload_config_if_changed()
                    
                    # 检查日期是否变化，如果变化则保存前一天的历史数据
                    current_date = datetime.now().strftime("%Y-%m-%d")
                    if last_saved_date is not None and last_saved_date != current_date:
                        # 日期变化，保存前一天的历史数据（包含详细K线数据）
                        save_yesterday_history(stock_states, funds_config, yesterday_close_cache, last_saved_date)
                    last_saved_date = current_date
                    
                    # 每次更新后都保存当天数据（实时保存，避免程序崩溃丢失数据）
                    current_date_str = datetime.now().strftime("%Y-%m-%d")
                    save_yesterday_history(stock_states, funds_config, yesterday_close_cache, current_date_str)
                    
                    # 如果时间超过15:01，停止从接口更新数据，但程序继续运行
                    if should_stop_updating():
                        # 不再从接口更新数据，但程序继续运行
                        pass
                    
                    # 计算下次请求前的等待时间
                    sleep_time = max(0, POLL_INTERVAL) + random.uniform(0, MAX_RANDOM_DELAY)
                    time.sleep(sleep_time)
                    
                except KeyboardInterrupt:
                    # 程序退出前，最后保存一次当天数据
                    current_date_str = datetime.now().strftime("%Y-%m-%d")
                    save_yesterday_history(stock_states, funds_config, yesterday_close_cache, current_date_str)
                    break
                except Exception as e:
                    error_msg = str(e)
                    # 如果是限流错误，增加等待时间
                    if "429" in error_msg or "rate limit" in error_msg.lower() or "限流" in error_msg:
                        time.sleep(RETRY_DELAY * 2)
                    else:
                        time.sleep(RETRY_DELAY)
    except Exception as e:
        # 程序异常退出前，最后保存一次当天数据
        current_date_str = datetime.now().strftime("%Y-%m-%d")
        save_yesterday_history(stock_states, funds_config, yesterday_close_cache, current_date_str)
        raise


# -------------------------- 启动脚本 --------------------------
if __name__ == "__main__":
    # 股票代码现在从配置文件读取，不需要在这里检查
    listen_stocks()
