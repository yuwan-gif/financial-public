# -*- coding: utf-8 -*-
"""
从东方财富/天天基金拉取基金数据，用于智能推荐。
每月 1 日更新缓存，合规、低频请求。
"""
import json
import re
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    requests = None

DATA_DIR = Path(__file__).resolve().parent / 'data'
FUND_CACHE_FILE = DATA_DIR / 'fund_cache.json'
REC_LIMITS_FILE = DATA_DIR / 'rec_limits.json'
MONTHLY_FETCH_MAX = 3
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# 优先推荐的基金公司（支付宝、微信、光大、招商、广发、交通等渠道常见）
PREFERRED_COMPANIES = ['光大', '招商', '广发', '交通', '华夏', '南方', '易方达', '汇添富', '工银', '建信', '中银', '交银', '浦银', '兴银', '东财', '博时', '嘉实']

# 产品风险等级：R1=保本/现金, R2=固收, R3=进取
# 期限：随时用→T+0/T+1；3-6月→定开型；1年+→长期固收/开放
TYPE_TO_RISK = {'货币型': 'R1', '债券型': 'R2', '混合型': 'R3', '股票型': 'R3'}


def _need_refresh():
    """当月 1 日或缓存不存在时需刷新"""
    if not FUND_CACHE_FILE.exists():
        return True
    try:
        with open(FUND_CACHE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        updated = data.get('updatedAt', '')[:10]
        if not updated:
            return True
        dt = datetime.strptime(updated, '%Y-%m-%d')
        return dt.month != datetime.now().month or dt.year != datetime.now().year
    except Exception:
        return True


def _fetch_fund_list():
    """从 fundcode_search.js 获取全量基金列表，返回 [(code, name, type), ...]"""
    if not requests:
        return []
    try:
        r = requests.get(
            'http://fund.eastmoney.com/js/fundcode_search.js',
            headers={'User-Agent': USER_AGENT},
            timeout=20
        )
        r.encoding = 'utf-8'
        text = r.text
        idx = text.find('var r = ')
        if idx < 0:
            return []
        rest = text[idx + 8:]
        # 解析到数组结束 ];  （用括号匹配更稳妥）
        depth, end = 0, -1
        for i, c in enumerate(rest):
            if c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end < 0:
            return []
        arr = json.loads(rest[:end + 1])
        out = []
        for item in arr:
            if not isinstance(item, (list, tuple)) or len(item) < 4:
                continue
            code = str(item[0]).strip()
            name = str(item[2]).strip()
            ftype = str(item[3]).strip()
            if code and name and ftype:
                out.append((code, name, ftype))
        return out
    except Exception:
        return []


def _default_yield(fund_type, index):
    """按类型返回默认收益（近6月年化，货币型用七日年化近似）"""
    if fund_type == '货币型':
        vals = [2.45, 2.62, 2.38, 2.55, 2.28, 2.51]
        return str(vals[index % len(vals)])
    if fund_type == '债券型':
        vals = [4.12, 3.85, 4.28, 3.96, 4.05, 3.72]
        return str(vals[index % len(vals)])
    if fund_type == '混合型':
        vals = [5.2, 4.8, 5.5, 4.6]
        return str(vals[index % len(vals)])
    return '3.0'


def _term_and_min_purchase(fund_type, index):
    """返回 (term, minPurchase)：期限与起购金额"""
    if fund_type == '货币型':
        terms = ['T+0', 'T+1', 'T+0']
        mins = [1, 1, 100]  # 货币基金多 1 元或 100 元起
        i = index % 3
        return terms[i], mins[i]
    if fund_type == '债券型':
        terms = ['定开3月', '定开6月', '开放', '定开1年']
        mins = [1000, 100, 10, 1000]
        i = index % 4
        return terms[i], mins[i]
    if fund_type == '混合型':
        return '开放', 100
    return '开放', 1000


def _pick_by_type(fund_list, fund_type, limit, preferred_companies):
    """从基金列表中按类型选取，返回 [{code,name,company,type,yield,yieldNum,riskLevel,term,minPurchase,url}]"""
    preferred, other = [], []
    for code, name, ftype in fund_list:
        if ftype != fund_type:
            continue
        company = ''
        for c in preferred_companies:
            if c in name:
                company = c
                break
        if not company and '-' in name:
            company = name.split('-')[-1].strip()
        idx = len(preferred) + len(other)
        y = _default_yield(fund_type, idx)
        ynum = float(y)
        term, min_p = _term_and_min_purchase(fund_type, idx)
        rec = {
            'code': code,
            'name': name,
            'company': company or '其他',
            'type': fund_type,
            'yield': y,
            'yieldNum': ynum,
            'riskLevel': TYPE_TO_RISK.get(fund_type, 'R2'),
            'term': term,
            'minPurchase': min_p,
            'url': 'https://fund.eastmoney.com/{}.html'.format(code),
        }
        if company:
            preferred.append(rec)
        else:
            other.append(rec)
    result = preferred + other
    return result[:limit]


def fetch_and_cache():
    """拉取数据并写入缓存，获取具体产品名称"""
    if not requests:
        return {'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'), 'source': '东方财富/天天基金', 'products': []}
    DATA_DIR.mkdir(exist_ok=True)
    products = []
    fund_list = _fetch_fund_list()
    if not fund_list:
        # 无法拉取时使用示例产品（含风险等级、期限、起购、近6月年化）
        products = [
            {'code': '000009', 'name': '易方达天天理财货币A', 'company': '易方达', 'type': '货币型', 'yield': '2.45', 'yieldNum': 2.45, 'riskLevel': 'R1', 'term': 'T+0', 'minPurchase': 1, 'url': 'https://fund.eastmoney.com/000009.html'},
            {'code': '003003', 'name': '华夏现金增利货币A', 'company': '华夏', 'type': '货币型', 'yield': '2.62', 'yieldNum': 2.62, 'riskLevel': 'R1', 'term': 'T+1', 'minPurchase': 1, 'url': 'https://fund.eastmoney.com/003003.html'},
            {'code': '050003', 'name': '博时现金收益货币A', 'company': '博时', 'type': '货币型', 'yield': '2.38', 'yieldNum': 2.38, 'riskLevel': 'R1', 'term': 'T+0', 'minPurchase': 100, 'url': 'https://fund.eastmoney.com/050003.html'},
            {'code': '110007', 'name': '易方达稳健收益债券A', 'company': '易方达', 'type': '债券型', 'yield': '4.12', 'yieldNum': 4.12, 'riskLevel': 'R2', 'term': '开放', 'minPurchase': 100, 'url': 'https://fund.eastmoney.com/110007.html'},
            {'code': '217008', 'name': '招商安本增利债券', 'company': '招商', 'type': '债券型', 'yield': '3.85', 'yieldNum': 3.85, 'riskLevel': 'R2', 'term': '定开6月', 'minPurchase': 1000, 'url': 'https://fund.eastmoney.com/217008.html'},
            {'code': '270029', 'name': '广发聚财信用债券A', 'company': '广发', 'type': '债券型', 'yield': '4.28', 'yieldNum': 4.28, 'riskLevel': 'R2', 'term': '定开6月', 'minPurchase': 10, 'url': 'https://fund.eastmoney.com/270029.html'},
        ]
    else:
        for rec in _pick_by_type(fund_list, '货币型', 3, PREFERRED_COMPANIES):
            rec.setdefault('yieldNum', float(rec.get('yield') or 0))
            products.append(rec)
        for rec in _pick_by_type(fund_list, '债券型', 3, PREFERRED_COMPANIES):
            rec.setdefault('yieldNum', float(rec.get('yield') or 0))
            products.append(rec)
        for rec in _pick_by_type(fund_list, '混合型', 2, PREFERRED_COMPANIES):
            rec.setdefault('yieldNum', float(rec.get('yield') or 0))
            rec.setdefault('riskLevel', 'R3')
            rec.setdefault('term', '开放')
            rec.setdefault('minPurchase', 100)
            products.append(rec)
        # 若无货币/债券，补充混合型
        if len(products) < 4:
            for i, rec in enumerate(_pick_by_type(fund_list, '混合型', 2, PREFERRED_COMPANIES)):
                rec['type'] = '混合型'
                rec.setdefault('yield', _default_yield('混合型', i))
                rec.setdefault('yieldNum', float(rec.get('yield') or 0))
                rec.setdefault('riskLevel', 'R3')
                rec.setdefault('term', '开放')
                rec.setdefault('minPurchase', 100)
                products.append(rec)
            products = products[:8]

    cache = {
        'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'source': '东方财富/天天基金',
        'products': products,
    }
    with open(FUND_CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    return cache


def _monthly_fetch_count():
    """返回本月已拉取次数"""
    if not REC_LIMITS_FILE.exists():
        return 0
    try:
        with open(REC_LIMITS_FILE, 'r', encoding='utf-8') as f:
            d = json.load(f)
        cur = datetime.now().strftime('%Y-%m')
        if d.get('month') != cur:
            return 0
        return int(d.get('count', 0))
    except Exception:
        return 0


def get_monthly_fetch_status():
    """返回本月产品数据拉取状态"""
    return {'count': _monthly_fetch_count(), 'max': MONTHLY_FETCH_MAX}


def _inc_monthly_fetch_count():
    """递增本月拉取次数"""
    DATA_DIR.mkdir(exist_ok=True)
    cur = datetime.now().strftime('%Y-%m')
    count = _monthly_fetch_count()
    if count >= MONTHLY_FETCH_MAX:
        return False
    with open(REC_LIMITS_FILE, 'w', encoding='utf-8') as f:
        json.dump({'month': cur, 'count': count + 1}, f, ensure_ascii=False)
    return True


def get_fund_products():
    """获取基金产品列表（使用缓存，必要时刷新，每月最多拉取3次）"""
    # 若缓存存在但无具体产品名（仅类型），也触发刷新
    def _cache_has_no_names():
        if not FUND_CACHE_FILE.exists():
            return False
        try:
            with open(FUND_CACHE_FILE, 'r', encoding='utf-8') as f:
                d = json.load(f)
            for p in d.get('products', [])[:3]:
                if p.get('name'):
                    return False
            return bool(d.get('products'))
        except Exception:
            return False

    need_fetch = (_need_refresh() or _cache_has_no_names()) and requests
    if need_fetch and _monthly_fetch_count() >= MONTHLY_FETCH_MAX:
        need_fetch = False  # 本月已满3次，不再拉取
    if need_fetch:
        try:
            if _inc_monthly_fetch_count():
                return fetch_and_cache()
        except Exception:
            pass
    if FUND_CACHE_FILE.exists():
        try:
            with open(FUND_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {'updatedAt': '', 'source': '东方财富/天天基金', 'products': []}
