# -*- coding: utf-8 -*-
"""
智能理财 - Flask 后端
仅需 Python 运行，无需 npm/node。
"""
import json
import os
import csv
import io
import re
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, send_file

app = Flask(__name__, static_folder='static')
DATA_DIR = Path(__file__).resolve().parent / 'data'
DATA_DIR.mkdir(exist_ok=True)
TRANSACTIONS_FILE = DATA_DIR / 'transactions.json'
GOALS_FILE = DATA_DIR / 'goals.json'
INVESTMENTS_FILE = DATA_DIR / 'investments.json'
PREFERENCES_FILE = DATA_DIR / 'user_preferences.json'
UPLOAD_META_FILE = DATA_DIR / 'upload_meta.json'
DUPLICATE_ALERT_FILE = DATA_DIR / 'duplicate_alert.json'

TEMPLATE_HEADERS = ['交易时间', '类型', '金额', '分类', '对方/备注', '来源']
SOURCE_MAP = {'微信': 'wechat', '支付宝': 'alipay', '招商银行': 'cmb', '手动': 'manual'}
TYPE_MAP = {'收入': 'income', '支出': 'expense', '存款': 'deposit', '理财': 'investment'}


def load_json(path, default):
    if path.exists():
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return default


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def parse_csv_line(line, delimiter=None):
    """解析一行 CSV，支持逗号、制表符、分号（Excel 部分地区用分号）。"""
    if delimiter is not None:
        # 指定分隔符时简单按分隔符拆，引号内不拆
        out = []
        cur = ''
        in_quotes = False
        for c in line:
            if c == '"':
                in_quotes = not in_quotes
            elif c == delimiter and not in_quotes:
                out.append(cur.strip())
                cur = ''
            else:
                cur += c
        out.append(cur.strip())
        return out
    # 自动：逗号、制表符、分号都当作分隔符
    out = []
    cur = ''
    in_quotes = False
    for c in line:
        if c == '"':
            in_quotes = not in_quotes
        elif (c in ',;\t') and not in_quotes:
            out.append(cur.strip())
            cur = ''
        else:
            cur += c
    out.append(cur.strip())
    return out


def parse_upload_csv(content):
    """解析统一模板 CSV，返回交易列表（无 id）。"""
    # 去掉 UTF-8 BOM（Excel 另存为 UTF-8 时可能带 BOM）
    if content.startswith('\ufeff'):
        content = content[1:]
    lines = content.strip().replace('\r\n', '\n').replace('\r', '\n').split('\n')
    lines = [ln.strip() for ln in lines if ln.strip()]
    if len(lines) < 2:
        return []
    header = lines[0]
    expected = ','.join(TEMPLATE_HEADERS)
    # 比较时忽略空格和 BOM，且允许表头用分号或逗号分隔
    header_normalized = header.replace(' ', '').replace('\ufeff', '').replace(';', ',')
    expected_normalized = expected.replace(' ', '')
    if header_normalized != expected_normalized:
        raise ValueError('表头与统一模板不一致，请使用提供的模板填写后上传。')
    result = []
    for i in range(1, len(lines)):
        cells = parse_csv_line(lines[i])
        if len(cells) < 6:
            continue
        time_str, type_str, amount_str, category, counterparty, source_str = cells[:6]
        type_str = type_str.strip()
        if type_str in ('存款', '理财'):
            continue  # 不导入存款、理财，避免与网页录入重复
        tx_type = TYPE_MAP.get(type_str, 'expense')
        source = SOURCE_MAP.get(source_str.strip(), 'manual')
        amount = float(re.sub(r'[^\d.-]', '', amount_str)) if amount_str else 0
        amount = abs(amount)
        time_str = (time_str or '').strip().replace('\t', ' ').replace('T', ' ')
        if time_str:
            parts = time_str[:19].split(None, 1)
            dp = parts[0].replace('/', '-')
            segs = dp.split('-')
            if len(segs) >= 3:
                dp = segs[0] + '-' + segs[1].zfill(2) + '-' + segs[2].zfill(2)
            time_str = dp + (' ' + parts[1][:5] if len(parts) > 1 else '')
        time_str = time_str or datetime.now().strftime('%Y-%m-%d %H:%M')
        result.append({
            'time': time_str,
            'type': tx_type,
            'amount': amount,
            'category': (category or '其他').strip(),
            'counterparty': (counterparty or '').strip(),
            'source': source,
        })
    return result


@app.route('/')
def index():
    return send_file(Path(__file__).resolve().parent / 'templates' / 'index.html')


@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    data = load_json(TRANSACTIONS_FILE, [])
    return jsonify(data)


@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    data = load_json(TRANSACTIONS_FILE, [])
    body = request.get_json() or {}
    tid = 'tx-{}-{}'.format(int(datetime.now().timestamp() * 1000), os.urandom(4).hex())
    item = {
        'id': tid,
        'time': body.get('time', datetime.now().strftime('%Y-%m-%d %H:%M')),
        'type': body.get('type', 'expense'),
        'amount': float(body.get('amount', 0)),
        'category': body.get('category', '其他'),
        'counterparty': body.get('counterparty', ''),
        'source': body.get('source', 'manual'),
        'remark': body.get('remark', ''),
    }
    data.insert(0, item)
    save_json(TRANSACTIONS_FILE, data)
    return jsonify(item)


@app.route('/api/transactions/upload', methods=['POST'])
def upload_transactions():
    f = request.files.get('file')
    if not f:
        return jsonify({'error': '请选择文件'}), 400
    if not f.filename.lower().endswith('.csv'):
        return jsonify({'error': '请上传 CSV 文件（与统一模板格式一致）'}), 400
    try:
        content = f.read().decode('utf-8')
    except UnicodeDecodeError:
        try:
            content = f.read().decode('gbk')
        except Exception:
            return jsonify({'error': '文件编码无法识别，请保存为 UTF-8'}), 400
    try:
        rows = parse_upload_csv(content)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    if not rows:
        return jsonify({
            'error': '文件中没有有效数据行。请检查：① 表头下方至少有一行数据；② 用英文逗号或分号分隔各列；③ 若用 Excel 编辑，请“另存为”选择“CSV (逗号分隔)(*.csv)”并保存为 UTF-8 编码。'
        }), 400
    data = load_json(TRANSACTIONS_FILE, [])
    for r in rows:
        r['id'] = 'tx-{}-{}'.format(int(datetime.now().timestamp() * 1000), os.urandom(4).hex())
        data.insert(0, r)
    save_json(TRANSACTIONS_FILE, data)
    dates = [r.get('time', '')[:10] for r in rows if r.get('time')]
    if dates:
        meta = load_json(UPLOAD_META_FILE, {})
        meta['lastUploadRange'] = {'min': min(dates), 'max': max(dates), 'count': len(rows)}
        meta['lastUploadAt'] = datetime.now().strftime('%Y-%m-%d %H:%M')
        save_json(UPLOAD_META_FILE, meta)
    return jsonify({'count': len(rows), 'message': '成功导入 {} 条记录'.format(len(rows))})


@app.route('/api/investments', methods=['GET'])
def get_investments():
    data = load_json(INVESTMENTS_FILE, [])
    return jsonify(data)


@app.route('/api/investments', methods=['POST'])
def add_investment():
    data = load_json(INVESTMENTS_FILE, [])
    body = request.get_json() or {}
    iid = 'inv-{}'.format(int(datetime.now().timestamp() * 1000))
    item = {
        'id': iid,
        'name': body.get('name', ''),
        'platform': body.get('platform', ''),
        'principal': float(body.get('principal', 0)),
        'totalAmount': float(body.get('totalAmount', 0)),
        'startDate': body.get('startDate', ''),
        'endDate': body.get('endDate', ''),
        'transferredToFunds': bool(body.get('transferredToFunds', False)),
    }
    data.insert(0, item)
    save_json(INVESTMENTS_FILE, data)
    return jsonify(item)


@app.route('/api/investments/<iid>', methods=['PUT'])
def update_investment(iid):
    data = load_json(INVESTMENTS_FILE, [])
    body = request.get_json() or {}
    for inv in data:
        if inv.get('id') == iid:
            for k in ['name', 'platform', 'principal', 'totalAmount', 'startDate', 'endDate']:
                if k in body and body[k] is not None:
                    if k in ('principal', 'totalAmount'):
                        inv[k] = float(body[k])
                    else:
                        inv[k] = str(body[k]).strip()
            old_tf = inv.get('transferredToFunds', False)
            if 'transferredToFunds' in body:
                inv['transferredToFunds'] = bool(body['transferredToFunds'])
            if inv.get('transferredToFunds') and not old_tf:
                _add_income_from_investment(inv.get('name', ''), float(inv.get('totalAmount', 0)), inv.get('id'))
            save_json(INVESTMENTS_FILE, data)
            return jsonify(inv)
    return jsonify({'error': '未找到'}), 404


@app.route('/api/investments/<iid>', methods=['DELETE'])
def delete_investment(iid):
    data = load_json(INVESTMENTS_FILE, [])
    iid_str = str(iid).strip()
    inv_name = None
    for x in data:
        if str(x.get('id', '')).strip() == iid_str:
            inv_name = x.get('name', '')
            break
    _remove_transactions_linked_to_investment(iid, inv_name)
    data = [x for x in data if str(x.get('id', '')).strip() != iid_str]
    save_json(INVESTMENTS_FILE, data)
    return jsonify({'ok': True})


@app.route('/api/transactions/<tid>', methods=['PUT'])
def update_transaction(tid):
    data = load_json(TRANSACTIONS_FILE, [])
    body = request.get_json() or {}
    for t in data:
        if t.get('id') == tid:
            if 'time' in body and body['time'] is not None:
                t['time'] = str(body['time']).strip()
            if 'type' in body and body['type'] is not None:
                t['type'] = str(body['type']).strip() if body['type'] in ('income', 'expense') else t['type']
            if 'amount' in body and body['amount'] is not None:
                t['amount'] = float(body['amount'])
            if 'category' in body and body['category'] is not None:
                t['category'] = str(body['category']).strip()
            if 'counterparty' in body and body['counterparty'] is not None:
                t['counterparty'] = str(body['counterparty']).strip()
            if 'remark' in body:
                t['remark'] = str(body['remark']).strip()
            save_json(TRANSACTIONS_FILE, data)
            return jsonify(t)
    return jsonify({'error': '未找到记录'}), 404


@app.route('/api/transactions/<tid>', methods=['DELETE'])
def delete_transaction(tid):
    data = load_json(TRANSACTIONS_FILE, [])
    tid_str = str(tid).strip()
    data = [x for x in data if str(x.get('id', '')).strip() != tid_str]
    save_json(TRANSACTIONS_FILE, data)
    return jsonify({'ok': True})


def _load_goals_data():
    """加载目标数据，兼容旧格式（纯数组）与新格式（含 hasActiveDepositPlan）"""
    raw = load_json(GOALS_FILE, [])
    if isinstance(raw, list):
        return {'hasActiveDepositPlan': True, 'goals': raw}
    return {
        'hasActiveDepositPlan': raw.get('hasActiveDepositPlan', True),
        'goals': raw.get('goals', raw.get('items', [])),
    }


def _save_goals_data(data):
    save_json(GOALS_FILE, data)


def _remove_transactions_linked_to_goal(gid, goal_name=None):
    """删除与存款目标关联的交易记录（存款转入）"""
    data = load_json(TRANSACTIONS_FILE, [])
    gid_str = str(gid).strip()
    name = (goal_name or '').strip()
    before = len(data)
    data = [t for t in data if not (
        t.get('category') == '存款转入' and (
            str(t.get('linkedGoalId', '')).strip() == gid_str or
            (not t.get('linkedGoalId') and name and (t.get('remark') or '').strip() == '存款转入（{}）'.format(name))
        )
    )]
    if len(data) < before:
        save_json(TRANSACTIONS_FILE, data)


def _remove_transactions_linked_to_investment(iid, inv_name=None):
    """删除与理财记录关联的交易记录（理财转入）"""
    data = load_json(TRANSACTIONS_FILE, [])
    iid_str = str(iid).strip()
    name = (inv_name or '').strip()
    before = len(data)
    data = [t for t in data if not (
        t.get('category') == '理财转入' and (
            str(t.get('linkedInvId', '')).strip() == iid_str or
            (not t.get('linkedInvId') and name and (t.get('remark') or '').strip() == '理财转入（{}）'.format(name))
        )
    )]
    if len(data) < before:
        save_json(TRANSACTIONS_FILE, data)


def _add_income_from_deposit(goal_name, amount, goal_id=None):
    """存款转入：新增一条收入记录，可关联目标ID便于删除时同步清理"""
    data = load_json(TRANSACTIONS_FILE, [])
    tid = 'tx-{}-{}'.format(int(datetime.now().timestamp() * 1000), os.urandom(4).hex())
    item = {
        'id': tid, 'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'type': 'income', 'amount': amount, 'category': '存款转入',
        'counterparty': '', 'source': 'manual', 'remark': '存款转入（{}）'.format(goal_name or '存款目标'),
    }
    if goal_id:
        item['linkedGoalId'] = str(goal_id)
    data.insert(0, item)
    save_json(TRANSACTIONS_FILE, data)


def _add_income_from_investment(inv_name, amount, inv_id=None):
    """理财转入：新增一条收入记录，可关联理财ID便于删除时同步清理"""
    data = load_json(TRANSACTIONS_FILE, [])
    tid = 'tx-{}-{}'.format(int(datetime.now().timestamp() * 1000), os.urandom(4).hex())
    item = {
        'id': tid, 'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'type': 'income', 'amount': amount, 'category': '理财转入',
        'counterparty': '', 'source': 'manual', 'remark': '理财转入（{}）'.format(inv_name or '理财'),
    }
    if inv_id:
        item['linkedInvId'] = str(inv_id)
    data.insert(0, item)
    save_json(TRANSACTIONS_FILE, data)


@app.route('/api/goals', methods=['GET'])
def get_goals():
    data = _load_goals_data()
    return jsonify(data)


@app.route('/api/goals/settings', methods=['PUT'])
def update_goals_settings():
    """更新存款目标页设置：hasActiveDepositPlan（是否已完成存款目标，false=已完成）"""
    body = request.get_json() or {}
    data = _load_goals_data()
    if 'hasActiveDepositPlan' in body:
        data['hasActiveDepositPlan'] = bool(body['hasActiveDepositPlan'])
    _save_goals_data(data)
    return jsonify(data)


@app.route('/api/goals', methods=['POST'])
def add_goal():
    data = _load_goals_data()
    goals = data['goals']
    body = request.get_json() or {}
    gid = 'goal-{}'.format(int(datetime.now().timestamp() * 1000))
    item = {
        'id': gid,
        'name': body.get('name', ''),
        'targetAmount': float(body.get('targetAmount', 0)),
        'currentAmount': float(body.get('currentAmount', 0)),
        'deadline': body.get('deadline', ''),
        'transferredToFunds': bool(body.get('transferredToFunds', False)),
        'createdAt': datetime.now().strftime('%Y-%m-%d'),
    }
    goals.insert(0, item)
    _save_goals_data(data)
    return jsonify(item)


@app.route('/api/goals/<gid>', methods=['PUT'])
def update_goal(gid):
    data = _load_goals_data()
    goals = data['goals']
    body = request.get_json() or {}
    for g in goals:
        if g.get('id') == gid:
            old_transferred = g.get('transferredToFunds', False)
            if 'name' in body and body['name'] is not None:
                g['name'] = str(body['name']).strip()
            if 'targetAmount' in body and body['targetAmount'] is not None:
                g['targetAmount'] = float(body['targetAmount'])
            if 'currentAmount' in body and body['currentAmount'] is not None:
                g['currentAmount'] = float(body['currentAmount'])
            if 'deadline' in body and body['deadline'] is not None:
                g['deadline'] = str(body['deadline']).strip()
            if 'transferredToFunds' in body:
                g['transferredToFunds'] = bool(body['transferredToFunds'])
            if g.get('transferredToFunds') and not old_transferred:
                _add_income_from_deposit(g.get('name', ''), float(g.get('currentAmount', 0)), g.get('id'))
            _save_goals_data(data)
            return jsonify(g)
    return jsonify({'error': '未找到目标'}), 404


@app.route('/api/goals/<gid>', methods=['DELETE'])
def delete_goal(gid):
    data = _load_goals_data()
    gid_str = str(gid).strip()
    goal_name = None
    for g in data['goals']:
        if str(g.get('id', '')).strip() == gid_str:
            goal_name = g.get('name', '')
            break
    _remove_transactions_linked_to_goal(gid, goal_name)
    data['goals'] = [g for g in data['goals'] if str(g.get('id', '')).strip() != gid_str]
    _save_goals_data(data)
    return jsonify({'ok': True})


DEFAULT_PREFERENCES = {
    'fundAvailability': '随时要用',      # 随时要用 | 3-6个月不用 | 1年以上不用 | 3年以上不用
    'minPurchaseThreshold': 5000,        # 5000 | 10000 | 20000 | 50000
    'riskPreference': '稳健型',          # 保守型 | 稳健型 | 进取型
}

# 资金使用时间 → 允许的期限
TERM_ALLOWED = {
    '随时要用': ['T+0', 'T+1'],
    '3-6个月不用': ['T+0', 'T+1', '定开3月', '定开6月'],
    '1年以上不用': ['T+0', 'T+1', '定开3月', '定开6月', '定开1年', '开放'],
    '3年以上不用': ['T+0', 'T+1', '定开3月', '定开6月', '定开1年', '开放'],
}

# 风险偏好 → 允许的风险等级
RISK_ALLOWED = {
    '保守型': ['R1'],
    '稳健型': ['R1', 'R2'],
    '进取型': ['R1', 'R2', 'R3'],
}


def _ts_from_str(s):
    try:
        s = (s or '')[:19].replace('T', ' ')
        if len(s) <= 10:
            return datetime.strptime(s, '%Y-%m-%d').timestamp()
        return datetime.strptime(s[:16], '%Y-%m-%d %H:%M').timestamp()
    except Exception:
        return 0


@app.route('/api/overview')
def overview():
    """可流动资金及下钻：时间筛选(month/year/all)、类型分解"""
    period = request.args.get('period', 'all')  # month, year, all
    month = request.args.get('month', '')  # YYYY-MM
    year = request.args.get('year', '')   # YYYY
    now = datetime.now()
    transactions = load_json(TRANSACTIONS_FILE, [])
    goals_data = _load_goals_data()
    goals = goals_data.get('goals', [])
    investments = load_json(INVESTMENTS_FILE, [])

    start_ts, end_ts, label = 0, float('inf'), '历史全量'
    if period == 'month' and month:
        try:
            y, m = int(month[:4]), int(month[5:7])
            start_dt = datetime(y, m, 1)
            if m == 12:
                end_dt = datetime(y, 12, 31, 23, 59, 59)
            else:
                end_dt = datetime(y, m + 1, 1)
            from datetime import timedelta
            end_dt = end_dt - timedelta(seconds=1)
            start_ts, end_ts = start_dt.timestamp(), end_dt.timestamp()
            label = '{}年{}月'.format(y, m)
        except Exception:
            pass
    elif period == 'year' and year:
        try:
            y = int(year[:4])
            start_ts = datetime(y, 1, 1).timestamp()
            end_ts = datetime(y, 12, 31, 23, 59, 59).timestamp()
            label = '{}年'.format(y)
        except Exception:
            pass

    def in_range(t):
        ts = _ts_from_str(t.get('time'))
        return start_ts <= ts <= end_ts

    filtered = [t for t in transactions if in_range(t)] if period != 'all' else transactions

    income = sum(t['amount'] for t in filtered if t.get('type') == 'income')
    expense = sum(t['amount'] for t in filtered if t.get('type') == 'expense')

    deposit_active = sum(float(g.get('currentAmount', 0)) for g in goals if not g.get('transferredToFunds'))
    deposit_transferred = sum(float(g.get('currentAmount', 0)) for g in goals if g.get('transferredToFunds'))
    deposit_total_hist = sum(float(g.get('currentAmount', 0)) for g in goals)

    inv_active = sum(float(i.get('totalAmount', 0)) for i in investments if not i.get('transferredToFunds'))
    inv_transferred = sum(float(i.get('totalAmount', 0)) for i in investments if i.get('transferredToFunds'))
    inv_total_hist = sum(float(i.get('totalAmount', 0)) for i in investments)

    available = income - deposit_active - inv_active - expense

    return jsonify({
        'label': label,
        'availableFunds': round(available, 2),
        'income': round(income, 2),
        'expense': round(expense, 2),
        'depositActive': round(deposit_active, 2),
        'depositTransferred': round(deposit_transferred, 2),
        'depositTotal': round(deposit_total_hist, 2),
        'investmentActive': round(inv_active, 2),
        'investmentTransferred': round(inv_transferred, 2),
        'investmentTotal': round(inv_total_hist, 2),
    })


@app.route('/api/upload-meta')
def get_upload_meta():
    meta = load_json(UPLOAD_META_FILE, {})
    return jsonify(meta)


@app.route('/api/duplicates')
def get_duplicates():
    """检测5000+可能重复的大额记录"""
    data = load_json(TRANSACTIONS_FILE, [])
    big = [t for t in data if float(t.get('amount', 0)) >= 5000 and t.get('type') in ('income', 'expense')]
    seen = {}
    dup_groups = []
    for t in big:
        key = (t.get('type'), round(float(t.get('amount', 0)), 2), (t.get('time', '')[:10]))
        if key not in seen:
            seen[key] = []
        seen[key].append(t)
    for k, items in seen.items():
        if len(items) > 1:
            dup_groups.append(items)
    alert = load_json(DUPLICATE_ALERT_FILE, {})
    dismissed_at = alert.get('dismissedAt', '')
    show_alert = len(dup_groups) > 0
    if dismissed_at and show_alert:
        try:
            d = datetime.strptime(dismissed_at[:10], '%Y-%m-%d')
            if (datetime.now() - d).days < 3:
                show_alert = False
        except Exception:
            pass
    return jsonify({'groups': dup_groups, 'showAlert': show_alert})


@app.route('/api/duplicates/dismiss', methods=['POST'])
def dismiss_duplicates():
    meta = load_json(DUPLICATE_ALERT_FILE, {})
    meta['dismissedAt'] = datetime.now().strftime('%Y-%m-%d %H:%M')
    save_json(DUPLICATE_ALERT_FILE, meta)
    return jsonify({'ok': True})


@app.route('/api/preferences', methods=['GET'])
def get_preferences():
    data = load_json(PREFERENCES_FILE, DEFAULT_PREFERENCES)
    # 兼容旧字段
    merged = {**DEFAULT_PREFERENCES, **data}
    if 'minPurchaseThreshold' in data and isinstance(merged.get('minPurchaseThreshold'), str):
        try:
            merged['minPurchaseThreshold'] = int(merged['minPurchaseThreshold'])
        except (ValueError, TypeError):
            merged['minPurchaseThreshold'] = 5000
    return jsonify(merged)


@app.route('/api/preferences', methods=['PUT'])
def update_preferences():
    body = request.get_json() or {}
    current = load_json(PREFERENCES_FILE, DEFAULT_PREFERENCES)
    for k in DEFAULT_PREFERENCES:
        if k in body and body[k] is not None:
            if k == 'minPurchaseThreshold':
                try:
                    current[k] = int(body[k])
                except (ValueError, TypeError):
                    current[k] = 5000
            else:
                current[k] = str(body[k]).strip()
    current['updatedAt'] = datetime.now().strftime('%Y-%m-%d %H:%M')
    save_json(PREFERENCES_FILE, current)
    return jsonify(current)


@app.route('/api/analysis')
def analysis():
    """周期内收支、分类、日均等。"""
    period = request.args.get('period', 'month')
    month = request.args.get('month', '')
    custom_start = request.args.get('custom_start', '')
    custom_end = request.args.get('custom_end', '')
    now = datetime.now()
    if period == 'month' and month:
        y, m = int(month[:4]), int(month[5:7])
        start = datetime(y, m, 1)
        if m == 12:
            end = datetime(y, 12, 31, 23, 59, 59)
        else:
            end = datetime(y, m + 1, 1)
        from datetime import timedelta
        end = end - timedelta(seconds=1)
        label = '{}年{}月'.format(y, m)
    elif period == 'quarter' and month:
        y, m = int(month[:4]), int(month[5:7])
        q = (m - 1) // 3 + 1
        start = datetime(y, (q - 1) * 3 + 1, 1)
        end = datetime(y, q * 3, 1)
        from datetime import timedelta
        end = end - timedelta(seconds=1)
        label = '{}年Q{}'.format(y, q)
    elif period == 'year' and month:
        y = int(month[:4])
        start = datetime(y, 1, 1)
        end = datetime(y, 12, 31, 23, 59, 59)
        label = '{}年'.format(y)
    elif period == 'custom' and custom_start and custom_end:
        start = datetime.strptime(custom_start[:10], '%Y-%m-%d')
        end = datetime.strptime(custom_end[:10], '%Y-%m-%d')
        end = end.replace(hour=23, minute=59, second=59)
        label = '{} 至 {}'.format(custom_start[:10], custom_end[:10])
    else:
        start = datetime(now.year, now.month, 1)
        end = now
        label = '本月'
    transactions = load_json(TRANSACTIONS_FILE, [])
    start_ts = start.timestamp()
    end_ts = end.timestamp()

    def normalize_time_str(s):
        """支持 2026/2/10 19:18、2026-02-10 19:18 等格式，统一为 2026-02-10 19:18"""
        s = (s or '').strip().replace('\t', ' ').replace('T', ' ')
        s = s[:19]  # 最多取到 年-月-日 时:分
        if not s:
            return ''
        parts = s.split(None, 1)  # 按空白拆成 [日期, 时间]
        date_part = parts[0].replace('/', '-')
        # 把 2026-2-10 补零为 2026-02-10
        date_segs = date_part.split('-')
        if len(date_segs) >= 3:
            y, m, d = date_segs[0], date_segs[1].zfill(2), date_segs[2].zfill(2)
            date_part = y + '-' + m + '-' + d
        if len(parts) == 1:
            return date_part
        return date_part + ' ' + parts[1][:5]  # 时间只取 时:分

    def parse_time(t):
        s = normalize_time_str(t.get('time') or '')
        if not s:
            return 0
        try:
            if len(s) <= 10:
                d = datetime.strptime(s, '%Y-%m-%d')
            else:
                d = datetime.strptime(s[:16], '%Y-%m-%d %H:%M')
            return d.timestamp()
        except Exception:
            return 0

    filtered = [t for t in transactions if start_ts <= parse_time(t) <= end_ts]
    income = sum(t['amount'] for t in filtered if t.get('type') == 'income')
    expense = sum(t['amount'] for t in filtered if t.get('type') == 'expense')
    by_category = {}
    for t in filtered:
        cat = t.get('category') or '其他'
        if cat not in by_category:
            by_category[cat] = {'income': 0, 'expense': 0}
        if t.get('type') == 'income':
            by_category[cat]['income'] += t['amount']
        else:
            by_category[cat]['expense'] += t['amount']
    days = max(1, (end - start).days + 1)
    daily_income = income / days
    daily_expense = expense / days
    category_expense = [{'name': k, 'amount': v['expense']} for k, v in by_category.items() if v['expense'] > 0]
    category_expense.sort(key=lambda x: -x['amount'])
    suggestions = []
    if income > 0 and expense > 0:
        save_rate = (income - expense) / income * 100
        if save_rate < 0:
            suggestions.append('该周期支出大于收入，建议减少非必要消费或增加收入来源。')
        elif save_rate < 20:
            suggestions.append('储蓄率偏低，建议将月收入的至少 20% 用于储蓄或投资。')
        elif save_rate >= 30:
            suggestions.append('储蓄率良好，可考虑将部分结余配置到稳健型理财产品。')
    if category_expense and expense > 0:
        top = category_expense[0]
        pct = top['amount'] / expense * 100
        if pct > 40:
            suggestions.append('「{}」占比过高（{:.0f}%），可适当控制该类支出。'.format(top['name'], pct))
    return jsonify({
        'label': label,
        'income': income,
        'expense': expense,
        'daysInRange': days,
        'dailyIncome': daily_income,
        'dailyExpense': daily_expense,
        'byCategory': by_category,
        'categoryExpenseList': category_expense,
        'suggestions': suggestions,
    })


def _normalize_time_str(s):
    s = (s or '').strip().replace('\t', ' ').replace('T', ' ')
    s = s[:19]
    if not s:
        return ''
    parts = s.split(None, 1)
    date_part = parts[0].replace('/', '-')
    date_segs = date_part.split('-')
    if len(date_segs) >= 3:
        y, m, d = date_segs[0], date_segs[1].zfill(2), date_segs[2].zfill(2)
        date_part = y + '-' + m + '-' + d
    if len(parts) == 1:
        return date_part
    return date_part + ' ' + parts[1][:5]


def _parse_ts(t):
    s = _normalize_time_str(t.get('time') or '')
    if not s:
        return 0
    try:
        if len(s) <= 10:
            d = datetime.strptime(s, '%Y-%m-%d')
        else:
            d = datetime.strptime(s[:16], '%Y-%m-%d %H:%M')
        return d.timestamp()
    except Exception:
        return 0


@app.route('/api/recommendations')
def get_recommendations():
    """智能推荐：目标拆解、当月/当季收支建议与风险、稳健投资推荐"""
    from datetime import timedelta
    goals_data = _load_goals_data()
    goals = goals_data.get('goals', [])
    transactions = load_json(TRANSACTIONS_FILE, [])
    now = datetime.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # 当月范围
    month_start = datetime(now.year, now.month, 1)
    month_end = now
    month_start_ts = month_start.timestamp()
    month_end_ts = month_end.timestamp()
    # 当季范围
    q = (now.month - 1) // 3 + 1
    quarter_start = datetime(now.year, (q - 1) * 3 + 1, 1)
    quarter_end_ts = month_end_ts
    quarter_start_ts = quarter_start.timestamp()

    def in_month(t):
        ts = _parse_ts(t)
        return month_start_ts <= ts <= month_end_ts

    def in_quarter(t):
        ts = _parse_ts(t)
        return quarter_start_ts <= ts <= quarter_end_ts

    month_income = sum(t['amount'] for t in transactions if t.get('type') == 'income' and in_month(t))
    month_expense = sum(t['amount'] for t in transactions if t.get('type') == 'expense' and in_month(t))
    quarter_income = sum(t['amount'] for t in transactions if t.get('type') == 'income' and in_quarter(t))
    quarter_expense = sum(t['amount'] for t in transactions if t.get('type') == 'expense' and in_quarter(t))

    # 1. 目标按月拆解 + 当月/当季建议
    goal_breakdown = []
    total_monthly_required = 0
    for g in goals:
        target = float(g.get('targetAmount', 0))
        current = float(g.get('currentAmount', 0))
        remaining = max(0, target - current)
        deadline_s = (g.get('deadline') or '')[:10]
        try:
            end_date = datetime.strptime(deadline_s, '%Y-%m-%d')
        except Exception:
            end_date = today + timedelta(days=365)
        days_left = max(0, (end_date - today).days)
        months_left = max(1, days_left / 30.0)
        monthly_required = remaining / months_left
        total_monthly_required += monthly_required
        risk_note = None
        if months_left < 1 and remaining > 0:
            risk_note = '已过截止日，目标未达成，建议调整截止日或目标额。'
        elif remaining > 0 and monthly_required > 0:
            if current >= target:
                risk_note = '已完成'
            else:
                risk_note = '若当月结余不足 {:.0f} 元，可能影响目标达成。'.format(monthly_required)
        goal_breakdown.append({
            'name': g.get('name', ''),
            'targetAmount': target,
            'currentAmount': current,
            'remaining': remaining,
            'deadline': deadline_s,
            'monthsLeft': round(months_left, 1),
            'monthlyRequired': round(monthly_required, 2),
            'riskNote': risk_note,
        })

    # 当月建议：建议结余 >= 各目标月均需求之和；建议支出 <= 预计收入 - 建议结余
    suggested_monthly_saving = total_monthly_required
    # 预计当月收入：用本月已收入 + 简单估算（若本月才几天则用上月日均*本月天数估算）
    days_in_month = (datetime(now.year, now.month + 1, 1) - timedelta(days=1)).day if now.month < 12 else 31
    estimated_month_income = month_income  # 已发生收入
    if days_in_month > 0 and now.day < days_in_month:
        # 可选用上月收入做参考补足估算，这里简化为：若本月收入尚少则用“上月整月”参考
        pass
    estimated_month_income = max(estimated_month_income, 0)
    suggested_max_expense_month = max(0, estimated_month_income - suggested_monthly_saving)
    month_risk_tips = []
    if suggested_monthly_saving > 0 and month_expense > suggested_max_expense_month and suggested_max_expense_month > 0:
        month_risk_tips.append('当月已支出 {:.0f} 元，超过建议上限 {:.0f} 元，存在无法达成当月储蓄目标的风险。'.format(month_expense, suggested_max_expense_month))
    elif suggested_monthly_saving > 0 and estimated_month_income < suggested_monthly_saving:
        month_risk_tips.append('当月预计收入可能不足以覆盖建议储蓄额，建议增收或调整目标/截止日。')
    if not goal_breakdown:
        month_risk_tips = []

    # 当季建议：季度建议结余 >= 月均需求 * 3
    suggested_quarter_saving = total_monthly_required * 3
    suggested_max_expense_quarter = max(0, quarter_income - suggested_quarter_saving)
    quarter_risk_tips = []
    if suggested_quarter_saving > 0 and quarter_expense > suggested_max_expense_quarter and suggested_max_expense_quarter > 0:
        quarter_risk_tips.append('当季已支出 {:.0f} 元，超过建议上限 {:.0f} 元。'.format(quarter_expense, suggested_max_expense_quarter))
    if not goal_breakdown:
        quarter_risk_tips = []

    # 2. 理财推荐：锁风险、卡期限、卡起购、排收益（每类最多3个，总共≤7个）
    preferences = load_json(PREFERENCES_FILE, DEFAULT_PREFERENCES)
    fund_availability = str(preferences.get('fundAvailability') or '随时要用').strip()
    min_threshold = int(preferences.get('minPurchaseThreshold') or 5000)
    risk_pref = str(preferences.get('riskPreference') or '稳健型').strip()
    allowed_terms = TERM_ALLOWED.get(fund_availability, TERM_ALLOWED['随时要用'])
    allowed_risks = RISK_ALLOWED.get(risk_pref, RISK_ALLOWED['稳健型'])

    investment_list = []
    fund_updated_at = ''
    fund_source = ''
    monthly_fetch = {'count': 0, 'max': 3}
    try:
        from fetch_funds import get_fund_products, get_monthly_fetch_status
        cache = get_fund_products()
        monthly_fetch = get_monthly_fetch_status()
        fund_updated_at = cache.get('updatedAt', '')
        fund_source = cache.get('source', '东方财富/天天基金')
        products = cache.get('products', [])
        if products:
            type_reasons = {
                '货币型': '流动性高、风险极低，适合短期闲置及应急金。可在支付宝、微信、天天基金购买。',
                '债券型': '波动较小，持有数月体验较稳，收益略高于货币基金。可在天天基金、支付宝购买。',
                '混合型': '股债配置，波动适中，适合中长期持有。',
            }
            for p in products:
                inv = {
                    'type': p.get('type', ''),
                    'name': p.get('name', ''),
                    'code': p.get('code', ''),
                    'url': p.get('url', ''),
                    'yield': str(p.get('yield', '') or ''),
                    'yieldNum': float(p.get('yieldNum', 0) or 0),
                    'riskLevel': p.get('riskLevel', 'R2'),
                    'term': p.get('term', '开放'),
                    'minPurchase': int(p.get('minPurchase', 100)),
                    'company': p.get('company', ''),
                    'reason': type_reasons.get(p.get('type', ''), '稳健型产品。'),
                    'platforms': '天天基金、支付宝、微信理财通',
                }
                investment_list.append(inv)
    except Exception:
        pass
    if not investment_list:
        # 无缓存或拉取失败时使用内置产品池
        fund_source = '东方财富/天天基金'
        fallback = [
            {'type': '货币型', 'name': '易方达天天理财货币A', 'code': '000009', 'url': 'https://fund.eastmoney.com/000009.html', 'yield': '2.45', 'yieldNum': 2.45, 'riskLevel': 'R1', 'term': 'T+0', 'minPurchase': 1, 'company': '易方达', 'reason': '流动性高、风险极低，适合短期闲置及应急金。', 'platforms': '天天基金、支付宝、微信理财通'},
            {'type': '货币型', 'name': '华夏现金增利货币A', 'code': '003003', 'url': 'https://fund.eastmoney.com/003003.html', 'yield': '2.62', 'yieldNum': 2.62, 'riskLevel': 'R1', 'term': 'T+1', 'minPurchase': 1, 'company': '华夏', 'reason': '流动性高、风险极低，适合短期闲置及应急金。', 'platforms': '天天基金、支付宝'},
            {'type': '货币型', 'name': '博时现金收益货币A', 'code': '050003', 'url': 'https://fund.eastmoney.com/050003.html', 'yield': '2.38', 'yieldNum': 2.38, 'riskLevel': 'R1', 'term': 'T+0', 'minPurchase': 100, 'company': '博时', 'reason': '流动性高、风险极低，适合短期闲置及应急金。', 'platforms': '天天基金、支付宝'},
            {'type': '债券型', 'name': '易方达稳健收益债券A', 'code': '110007', 'url': 'https://fund.eastmoney.com/110007.html', 'yield': '4.12', 'yieldNum': 4.12, 'riskLevel': 'R2', 'term': '开放', 'minPurchase': 100, 'company': '易方达', 'reason': '波动较小，持有数月体验较稳，收益略高于货币基金。', 'platforms': '天天基金、支付宝'},
            {'type': '债券型', 'name': '招商安本增利债券', 'code': '217008', 'url': 'https://fund.eastmoney.com/217008.html', 'yield': '3.85', 'yieldNum': 3.85, 'riskLevel': 'R2', 'term': '定开6月', 'minPurchase': 1000, 'company': '招商', 'reason': '波动较小，持有数月体验较稳，收益略高于货币基金。', 'platforms': '天天基金、支付宝'},
            {'type': '债券型', 'name': '广发聚财信用债券A', 'code': '270029', 'url': 'https://fund.eastmoney.com/270029.html', 'yield': '4.28', 'yieldNum': 4.28, 'riskLevel': 'R2', 'term': '定开6月', 'minPurchase': 10, 'company': '广发', 'reason': '波动较小，持有数月体验较稳，收益略高于货币基金。', 'platforms': '天天基金、支付宝'},
            {'type': '混合型', 'name': '易方达安心回报债券A', 'code': '110027', 'url': 'https://fund.eastmoney.com/110027.html', 'yield': '5.2', 'yieldNum': 5.2, 'riskLevel': 'R3', 'term': '开放', 'minPurchase': 100, 'company': '易方达', 'reason': '股债配置，波动适中，适合中长期持有。', 'platforms': '天天基金、支付宝'},
            {'type': '混合型', 'name': '广发稳健增长混合A', 'code': '270002', 'url': 'https://fund.eastmoney.com/270002.html', 'yield': '4.8', 'yieldNum': 4.8, 'riskLevel': 'R3', 'term': '开放', 'minPurchase': 1, 'company': '广发', 'reason': '股债配置，波动适中，适合中长期持有。', 'platforms': '天天基金、支付宝'},
        ]
        investment_list = fallback

    # 锁风险：仅保留允许的风险等级
    investment_list = [p for p in investment_list if p.get('riskLevel') in allowed_risks]
    # 卡期限：仅保留与资金使用时间匹配的期限
    investment_list = [p for p in investment_list if p.get('term', '') in allowed_terms]
    # 卡起购：产品起购金额 ≤ 用户能接受的门槛
    investment_list = [p for p in investment_list if p.get('minPurchase', 0) <= min_threshold]
    # 排收益：按近6月年化从高到低排序
    investment_list.sort(key=lambda x: -float(x.get('yieldNum', 0) or 0))
    # 每类最多3个，总共不超过7个
    by_risk = {'R1': [], 'R2': [], 'R3': []}
    for p in investment_list:
        r = p.get('riskLevel', 'R2')
        if r in by_risk and len(by_risk[r]) < 3:
            by_risk[r].append(p)
    investment_list = by_risk['R1'][:3] + by_risk['R2'][:3] + by_risk['R3'][:3]
    investment_list = investment_list[:7]

    # 次月1日生效说明
    next_month = (now.month % 12) + 1
    next_year = now.year if now.month < 12 else now.year + 1
    preferences_effective_date = '{}-{:02d}-01'.format(next_year, next_month)

    return jsonify({
        'preferences': preferences,
        'preferencesEffectiveNote': '您对推荐依据的修改将于 {} 生效（与产品数据更新周期一致）。'.format(preferences_effective_date),
        'goalBreakdown': goal_breakdown,
        'monthSuggestion': {
            'suggestedSaving': round(suggested_monthly_saving, 2),
            'suggestedMaxExpense': round(suggested_max_expense_month, 2),
            'incomeSoFar': round(month_income, 2),
            'expenseSoFar': round(month_expense, 2),
            'estimatedMonthIncome': round(estimated_month_income, 2),
            'riskTips': month_risk_tips,
        },
        'quarterSuggestion': {
            'suggestedSaving': round(suggested_quarter_saving, 2),
            'suggestedMaxExpense': round(suggested_max_expense_quarter, 2),
            'incomeSoFar': round(quarter_income, 2),
            'expenseSoFar': round(quarter_expense, 2),
            'riskTips': quarter_risk_tips,
        },
        'investmentRecommendations': investment_list,
        'fundUpdatedAt': fund_updated_at,
        'fundSource': fund_source or '东方财富/天天基金',
        'monthlyFetchCount': monthly_fetch.get('count', 0),
        'monthlyFetchMax': monthly_fetch.get('max', 3),
    })


@app.route('/template')
def download_template():
    """下载统一上传模板 CSV"""
    return send_from_directory(app.static_folder, '账单上传模板.csv', as_attachment=True, download_name='账单上传模板.csv')


if __name__ == '__main__':
    port = 8080
    print('')
    print('  智能理财 已启动')
    print('  在浏览器中打开:  http://127.0.0.1:%s' % port)
    print('  关闭本窗口即停止服务')
    print('')
    app.run(host='127.0.0.1', port=port, debug=True)
