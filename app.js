(function () {
  const PAGE_SIZE = 10;
  const FIRST_PAGES = 5;
  const LAST_PAGES = 3;
  const CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '住房', '医疗', '教育', '理财', '工资', '转账', '其他'];
  const PRODUCTS = [
    { name: '货币基金', desc: '流动性好、风险低，适合短期闲置资金', tag: '稳健' },
    { name: '债券基金', desc: '波动小于股票，适合 6 个月以上闲钱', tag: '稳健' },
    { name: '指数基金定投', desc: '长期平滑波动，适合坚持 3 年以上的储蓄', tag: '成长' },
    { name: '银行大额存单', desc: '保本保息，适合确定期限不用的资金', tag: '保本' }
  ];

  function api(path, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    if (method === 'GET') {
      var sep = path.indexOf('?') >= 0 ? '&' : '?';
      path = path + sep + '_=' + Date.now();
      opts = Object.assign({}, opts, { cache: 'no-store' });
    }
    return fetch('/api' + path, opts).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || '请求失败'); });
      return r.json();
    });
  }

  function getPageNumbers(totalPages) {
    if (totalPages <= 0) return [];
    var set = new Set();
    for (var i = 1; i <= Math.min(FIRST_PAGES, totalPages); i++) set.add(i);
    for (var i = totalPages - LAST_PAGES + 1; i <= totalPages; i++) if (i > 0) set.add(i);
    return Array.from(set).sort(function (a, b) { return a - b; });
  }

  function sourceLabel(s) {
    return { wechat: '微信', alipay: '支付宝', cmb: '招商银行', manual: '手动' }[s] || s;
  }

  function setActiveNav(page) {
    document.querySelectorAll('.nav a').forEach(function (a) {
      a.classList.toggle('active', (a.getAttribute('data-page') || '').replace('#/', '') === (page || 'dashboard'));
    });
  }

  function loadDashState() {
    try {
      var s = localStorage.getItem('dashState');
      if (s) { var d = JSON.parse(s); return { period: d.period || 'all', month: d.month || '', year: d.year || '' }; }
    } catch (e) {}
    return { period: 'all', month: '', year: '' };
  }
  function saveDashState(s) {
    try { localStorage.setItem('dashState', JSON.stringify(s)); } catch (e) {}
  }
  var dashState = loadDashState();
  function renderDashboard() {
    var now = new Date();
    var curMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    var curYear = String(now.getFullYear());
    if (!dashState.month) dashState.month = curMonth;
    if (!dashState.year) dashState.year = curYear;
    function load() {
      var q = '?period=' + dashState.period;
      if (dashState.period === 'month' && dashState.month) q += '&month=' + encodeURIComponent(dashState.month);
      if (dashState.period === 'year' && dashState.year) q += '&year=' + encodeURIComponent(dashState.year);
      Promise.all([api('/overview' + q), api('/duplicates'), api('/goals'), api('/recommendations'), api('/investments')]).then(function (res) {
        var ov = res[0];
        var dup = res[1];
        var goalsData = res[2];
        var recData = res[3];
        var investments = res[4] || [];
        var goals = goalsData.goals || [];
        var goalBreakdown = recData.goalBreakdown || [];
        var monthS = recData.monthSuggestion || {};
        var quarterS = recData.quarterSuggestion || {};
        var invActive = investments.filter(function (i) { return !i.transferredToFunds; });
        var invDone = investments.filter(function (i) { return i.transferredToFunds; });
        var breakdownHtml = goalBreakdown.length === 0 ? '<p class="no-data">暂无存款目标</p>' :
          goalBreakdown.slice(0, 3).map(function (b) {
            return '<div class="goal-breakdown-card" style="padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.85rem">' +
              '<div class="goal-breakdown-head" style="font-weight:600;margin-bottom:0.15rem">' + escapeHtml(b.name) + '</div>' +
              '<div class="goal-breakdown-row" style="color:var(--text-muted)">剩余 ¥' + (b.remaining || 0).toLocaleString('zh-CN') + '，月均需 ¥' + (b.monthlyRequired || 0).toLocaleString('zh-CN') + '</div>' +
              (b.riskNote ? '<p class="goal-risk" style="font-size:0.8rem;color:var(--expense);margin-top:0.15rem">' + escapeHtml(b.riskNote) + '</p>' : '') + '</div>';
          }).join('') + (goalBreakdown.length > 3 ? '<p class="no-data" style="font-size:0.8rem;margin-top:0.25rem">共 ' + goalBreakdown.length + ' 个目标，<a href="#/goals">查看全部</a></p>' : '');
        var monthTipsHtml = (monthS.riskTips && monthS.riskTips.length) ? '<ul class="suggestion-list" style="margin-top:0.35rem;font-size:0.85rem;padding-left:1rem">' + monthS.riskTips.slice(0, 2).map(function (t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('') + '</ul>' : '';
        var invHtml = investments.length === 0 ? '<p class="no-data">暂无理财记录</p>' :
          '<div style="font-size:0.9rem;line-height:1.6">' +
          '<div><span class="text-income">进行中</span> ' + invActive.length + ' 个 · ¥' + invActive.reduce(function (s, i) { return s + (parseFloat(i.totalAmount) || 0); }, 0).toLocaleString('zh-CN') + '</div>' +
          '<div style="color:var(--text-muted)">已赎出 ' + invDone.length + ' 个</div></div>';
        var dupBanner = (dup.showAlert && dup.groups && dup.groups.length) ?
          '<div class="dash-dup-banner">' +
          '<span><strong>可能存在重复记录</strong>：' + dup.groups.length + ' 组大额重复</span>' +
          '<span><a href="#/goals" class="btn btn-ghost" style="padding:0.3rem 0.6rem;font-size:0.85rem">去处理</a>' +
          '<button type="button" class="btn btn-ghost dup-dismiss" style="padding:0.3rem 0.6rem;font-size:0.85rem">3天内不再提示</button></span></div>' : '';
        var html = '<h1 class="page-title" style="margin-bottom:0.75rem">概览</h1>' +
          '<div class="dash-filter" style="margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
          '<label style="font-size:0.9rem;color:var(--text-muted)">时间</label>' +
          '<select class="input dash-period" style="max-width:110px;display:inline-block;padding:0.5rem 0.75rem">' +
          '<option value="all"' + (dashState.period === 'all' ? ' selected' : '') + '>历史全量</option>' +
          '<option value="month"' + (dashState.period === 'month' ? ' selected' : '') + '>月度</option>' +
          '<option value="year"' + (dashState.period === 'year' ? ' selected' : '') + '>年度</option></select>' +
          (dashState.period === 'month' ? '<input type="month" class="input dash-month" value="' + (dashState.month || curMonth) + '" style="max-width:130px;padding:0.5rem 0.75rem" />' : '') +
          (dashState.period === 'year' ? '<input type="number" class="input dash-year" value="' + (dashState.year || curYear) + '" min="2020" max="2030" style="max-width:70px;padding:0.5rem 0.75rem" />' : '') +
          '</div>' +
          dupBanner +
          '<div class="dash-grid">' +
          '<div class="dash-tile"><div class="card">' +
          '<div class="dash-tile-header">可流动资金</div>' +
          '<div class="dash-tile-body compact">' +
          '<span class="mono stat-value ' + (ov.availableFunds >= 0 ? 'text-income' : 'text-expense') + '">¥ ' + (ov.availableFunds || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</span>' +
          '<p class="stat-label" style="margin-top:0.35rem">收入 - 存款 - 理财本息 - 支出</p>' +
          '<div class="dash-drill-mini">' +
          '<span><span class="text-income">收入</span> ¥' + (ov.income || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0 }) + '</span>' +
          '<span><span class="text-expense">支出</span> ¥' + (ov.expense || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0 }) + '</span>' +
          '<span>存款 ¥' + (ov.depositActive || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0 }) + '</span>' +
          '<span>理财 ¥' + (ov.investmentActive || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0 }) + '</span>' +
          '</div></div></div></div>' +
          '<div class="dash-tile"><div class="card">' +
          '<div class="dash-tile-header">存款</div>' +
          '<div class="dash-tile-body">' + breakdownHtml +
          (monthS.suggestedSaving > 0 ? '<p style="margin-top:0.5rem;font-size:0.85rem;color:var(--text-muted)">建议结余 月 ¥' + (monthS.suggestedSaving || 0).toLocaleString('zh-CN') + ' / 季 ¥' + (quarterS.suggestedSaving || 0).toLocaleString('zh-CN') + '</p>' : '') +
          monthTipsHtml + '</div>' +
          '<div class="dash-tile-footer"><a href="#/goals" class="btn btn-primary" style="padding:0.4rem 0.8rem;font-size:0.85rem">查看交易记录 →</a></div></div></div>' +
          '<div class="dash-tile"><div class="card">' +
          '<div class="dash-tile-header">理财</div>' +
          '<div class="dash-tile-body">' + invHtml + '</div>' +
          '<div class="dash-tile-footer"><a href="#/goals" class="btn btn-primary" style="padding:0.4rem 0.8rem;font-size:0.85rem">查看理财记录 →</a></div></div></div>' +
          '<div class="dash-tile"><div class="card">' +
          '<div class="dash-tile-header">使用说明</div>' +
          '<div class="dash-tile-body">' +
          '<p style="font-size:0.85rem;margin-bottom:0.5rem">账单记录、存款目标、理财推荐</p>' +
          '<p style="font-size:0.85rem;margin-bottom:0.5rem;color:var(--text-muted)">可流动资金 = 收入 - 存款 - 理财本息 - 支出</p>' +
          '<details style="font-size:0.85rem"><summary style="cursor:pointer;color:var(--accent)">使用提示</summary>' +
          '<ul class="suggestion-list" style="margin-top:0.35rem;padding-left:1rem">' +
          '<li>收支选单一平台导入</li>' +
          '<li>存款/理财仅支持网页录入</li>' +
          '<li>类型：收入/支出/理财/存款</li></ul></details></div></div></div>' +
          '</div>';
        document.getElementById('app').innerHTML = html;
        setActiveNav('dashboard');
        document.querySelector('.dash-period') && document.querySelector('.dash-period').addEventListener('change', function () {
          dashState.period = this.value;
          dashState.month = document.querySelector('.dash-month') ? document.querySelector('.dash-month').value : curMonth;
          dashState.year = document.querySelector('.dash-year') ? document.querySelector('.dash-year').value : curYear;
          saveDashState(dashState);
          renderDashboard();
        });
        document.querySelector('.dash-month') && document.querySelector('.dash-month').addEventListener('change', function () { dashState.month = this.value; saveDashState(dashState); load(); });
        document.querySelector('.dash-year') && document.querySelector('.dash-year').addEventListener('change', function () { dashState.year = this.value; saveDashState(dashState); load(); });
        document.querySelector('.dup-dismiss') && document.querySelector('.dup-dismiss').addEventListener('click', function () {
          api('/duplicates/dismiss', { method: 'POST' }).then(function () { renderDashboard(); });
        });
      });
    }
    load();
  }

  function monthlySuggested(g) {
    var target = parseFloat(g.targetAmount) || 0;
    var current = parseFloat(g.currentAmount) || 0;
    var remaining = Math.max(0, target - current);
    var deadline = (g.deadline || '').slice(0, 10);
    if (!deadline || remaining <= 0) return 0;
    try {
      var end = new Date(deadline);
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var msLeft = Math.max(0, end - today);
      var monthsLeft = Math.max(0.5, msLeft / (30 * 24 * 60 * 60 * 1000));
      return Math.round((remaining / monthsLeft) * 100) / 100;
    } catch (e) { return 0; }
  }

  var INV_PAGE_SIZE = 5;

  function renderGoals() {
    Promise.all([api('/goals'), api('/transactions'), api('/investments'), api('/upload-meta')]).then(function (res) {
      var goalsData = res[0];
      var list = res[1];
      var investments = res[2] || [];
      var uploadMeta = res[3] || {};
      var currentPage = 1;
      var invPage = 1;
      var totalPages, safePage, start, pageList, pageNumbers;
      var goals = goalsData.goals || [];
      var hasActiveDepositPlan = goalsData.hasActiveDepositPlan !== false;
      var html = '<h1 class="page-title">交易记录</h1>' +
        '<div class="card merged-block" style="margin-bottom:1.5rem">' +
        '<h2 class="section-title">一、存款目标</h2>' +
        '<div style="margin-top:1rem">' +
        '<h3 class="card-title">新建目标</h3>' +
        '<form id="goal-form" class="form">' +
        '<div class="form-row"><label class="label">目标名称</label><input class="input" name="name" placeholder="如：紧急备用金" /></div>' +
        '<div class="form-grid">' +
        '<div><label class="label">目标金额（元）</label><input type="number" class="input" name="targetAmount" min="0" step="0.01" placeholder="10000" /></div>' +
        '<div><label class="label">当前已存（元）</label><input type="number" class="input" name="currentAmount" min="0" step="0.01" placeholder="0" /></div>' +
        '<div><label class="label">目标截止日</label><input type="date" class="input" name="deadline" /></div>' +
        '</div><button type="submit" class="btn btn-primary">添加目标</button></form></div>' +
        '<h3 class="card-title" style="margin-top:1.25rem">目标列表</h3>';
      if (goals.length === 0) {
        html += '<div class="hint-block" style="color:var(--text-muted);text-align:center;padding:1.5rem">暂无存款目标，请在上方表单添加。</div>';
      } else {
        html += '<div class="goal-list">';
        goals.forEach(function (g) {
          var progress = Math.min(100, ((g.currentAmount || 0) / (g.targetAmount || 1)) * 100);
          var isOverdue = new Date(g.deadline) < new Date();
          var isDone = (g.currentAmount || 0) >= (g.targetAmount || 0);
          var barColor = isDone ? 'var(--income)' : isOverdue ? 'var(--expense)' : 'var(--accent)';
          var monthlyRec = monthlySuggested(g);
          html += '<div class="card goal-card" data-goal-id="' + g.id + '">' +
            '<div class="goal-head">' +
            '<span class="goal-name">' + escapeHtml(g.name) + '</span>' +
            '<span class="goal-deadline">截止 ' + escapeHtml(g.deadline) + '</span>' +
            '<button type="button" class="btn btn-ghost goal-edit-btn">编辑</button>' +
            '<button type="button" class="btn btn-ghost btn-danger goal-delete">删除</button></div>' +
            '<div class="goal-view">' +
            '<div class="progress-wrap">' +
            '<div class="progress-bar"><div class="progress-fill" style="width:' + progress + '%;background:' + barColor + '"></div></div>' +
            '<span class="mono progress-text">¥' + (g.currentAmount || 0).toLocaleString('zh-CN') + ' / ¥' + (g.targetAmount || 0).toLocaleString('zh-CN') + ' (' + progress.toFixed(0) + '%)</span></div>' +
            (monthlyRec > 0 ? '<p class="goal-monthly-rec">推荐月存 <strong class="text-income">¥' + monthlyRec.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</strong></p>' : '') +
            '<label class="checkbox-row"><input type="checkbox" class="goal-transferred-cb" data-id="' + escapeHtml(g.id) + '" ' + (g.transferredToFunds ? 'checked' : '') + ' /> 已完成存款目标，转入可流动资金</label>' +
            '<div class="current-edit">' +
            '<input type="number" class="input goal-edit-input" style="max-width:140px;display:none" min="0" step="0.01" />' +
            '<button type="button" class="btn btn-primary goal-save" style="display:none">保存</button>' +
            '<button type="button" class="btn btn-ghost goal-cancel" style="display:none">取消</button>' +
            '<button type="button" class="btn btn-ghost goal-update">更新当前金额</button></div></div>' +
            '<div class="goal-edit-form" style="display:none">' +
            '<div class="form-grid" style="margin-top:0.5rem">' +
            '<div><label class="label">目标名称</label><input class="input goal-field-name" value="' + escapeHtml(g.name) + '" /></div>' +
            '<div><label class="label">目标金额（元）</label><input type="number" class="input goal-field-target" min="0" step="0.01" value="' + g.targetAmount + '" /></div>' +
            '<div><label class="label">当前已存（元）</label><input type="number" class="input goal-field-current" min="0" step="0.01" value="' + g.currentAmount + '" /></div>' +
            '<div><label class="label">截止日</label><input type="date" class="input goal-field-deadline" value="' + escapeHtml(g.deadline) + '" /></div>' +
            '<div><label class="checkbox-row"><input type="checkbox" class="goal-field-transferred" ' + (g.transferredToFunds ? 'checked' : '') + ' /> 已完成存款目标，转入可流动资金</label></div>' +
            '</div><div style="margin-top:0.75rem"><button type="button" class="btn btn-primary goal-save-edit">保存修改</button><button type="button" class="btn btn-ghost goal-cancel-edit">取消</button></div></div>' +
            '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
      html += '<div class="card merged-block" style="margin-top:1.5rem">' +
        '<h2 class="section-title">二、理财</h2>' +
        '<p class="hint">记录理财产品，支持本金、本息合计、开始/结束时间。</p>' +
        '<form id="inv-form" class="form" style="margin-bottom:1rem">' +
        '<div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +
        '<div><label class="label">产品名</label><input class="input" name="name" placeholder="如：XX理财产品" /></div>' +
        '<div><label class="label">购买平台</label><input class="input" name="platform" placeholder="支付宝/银行等" /></div>' +
        '<div><label class="label">投入本金（元）</label><input type="number" class="input" name="principal" min="0" step="0.01" placeholder="10000" /></div>' +
        '<div><label class="label">本息合计（元）</label><input type="number" class="input" name="totalAmount" min="0" step="0.01" placeholder="10500" /></div>' +
        '<div><label class="label">开始日期</label><input type="date" class="input" name="startDate" /></div>' +
        '<div><label class="label">结束日期</label><input type="date" class="input" name="endDate" /></div>' +
        '</div><button type="submit" class="btn btn-primary" style="margin-top:0.5rem">添加</button></form>' +
        '<div id="inv-list-block"></div></div>' +
        '<div class="card merged-block" style="margin-top:1.5rem">' +
        '<h2 class="section-title">三、交易记录</h2>' +
        '<p class="hint" id="upload-range-hint">' + (uploadMeta.lastUploadRange ? '上次导入：' + uploadMeta.lastUploadRange.min + ' 至 ' + uploadMeta.lastUploadRange.max + '（共' + uploadMeta.lastUploadRange.count + '条）' : '') + '</p>' +
        '<p class="hint">上传账单或手动添加收支记录。</p>' +
        '<div class="upload-row">' +
        '<a href="/template" class="btn btn-ghost" download>下载统一模板</a>' +
        '<input type="file" accept=".csv" class="file-input" id="csv-file" style="display:none" />' +
        '<button type="button" class="btn btn-primary" id="btn-upload">选择文件并上传</button>' +
        '<button type="button" class="btn btn-ghost" id="btn-manual">手动添加</button></div>' +
        '<div id="upload-msg"></div>' +
        '<div id="manual-form" style="display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">' +
        '<form id="manual-add-form" class="manual-form">' +
        '<div class="manual-grid">' +
        '<div><label class="label">时间</label><input type="datetime-local" class="input" name="time" id="manual-time" /></div>' +
        '<div><label class="label">类型</label><select class="input" name="type"><option value="income">收入</option><option value="expense" selected>支出</option></select></div>' +
        '<div><label class="label">金额（元）</label><input type="number" class="input" name="amount" min="0" step="0.01" required /></div>' +
        '<div><label class="label">分类</label><select class="input" name="category">' +
        CATEGORIES.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') +
        '</select></div>' +
        '<div><label class="label">对方/备注</label><input class="input" name="counterparty" placeholder="选填" /></div>' +
        '</div><button type="submit" class="btn btn-primary">添加</button></form></div>' +
        '<div id="tx-block"></div></div>';
      document.getElementById('app').innerHTML = html;
      setActiveNav('goals');

      function renderTxBlock() {
        totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        safePage = Math.min(currentPage, totalPages);
        start = (safePage - 1) * PAGE_SIZE;
        pageList = list.slice(start, start + PAGE_SIZE);
        pageNumbers = getPageNumbers(totalPages);
        var tableRows = pageList.map(function (t) {
          var timeVal = (t.time || '').replace(' ', 'T').slice(0, 16);
          return '<tr data-tx-id="' + escapeHtml(t.id) + '"><td class="mono">' + escapeHtml(t.time) + '</td>' +
            '<td><span class="' + (t.type === 'income' ? 'text-income' : 'text-expense') + '">' + (t.type === 'income' ? '收入' : '支出') + '</span></td>' +
            '<td class="mono ' + (t.type === 'income' ? 'text-income' : 'text-expense') + '">' + (t.type === 'income' ? '+' : '-') + '¥' + t.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</td>' +
            '<td>' + escapeHtml(t.category) + '</td><td>' + escapeHtml(t.counterparty) + '</td><td>' + sourceLabel(t.source) + '</td>' +
            '<td>' + escapeHtml(t.remark || '') + '</td>' +
            '<td><button type="button" class="btn btn-ghost tx-edit" data-id="' + escapeHtml(t.id) + '">编辑</button> <button type="button" class="btn btn-danger tx-delete" data-id="' + escapeHtml(t.id) + '">删除</button></td></tr>' +
            '<tr class="tx-edit-row" data-tx-id="' + escapeHtml(t.id) + '" style="display:none"><td colspan="8" style="background:var(--bg-elevated);padding:1rem">' +
            '<div class="tx-edit-form"><div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +
            '<div><label class="label">时间</label><input type="datetime-local" class="input tx-edit-time" value="' + escapeHtml(timeVal) + '" /></div>' +
            '<div><label class="label">类型</label><select class="input tx-edit-type"><option value="income"' + (t.type === 'income' ? ' selected' : '') + '>收入</option><option value="expense"' + (t.type === 'expense' ? ' selected' : '') + '>支出</option></select></div>' +
            '<div><label class="label">金额</label><input type="number" class="input tx-edit-amount" min="0" step="0.01" value="' + (t.amount || 0) + '" /></div>' +
            '<div><label class="label">分类</label><select class="input tx-edit-category">' +
            CATEGORIES.map(function (c) { return '<option value="' + c + '"' + (t.category === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
            '</select></div>' +
            '<div><label class="label">对方/备注</label><input class="input tx-edit-counterparty" value="' + escapeHtml(t.counterparty || '') + '" /></div>' +
            '<div><label class="label">备注</label><input class="input tx-edit-remark" value="' + escapeHtml(t.remark || '') + '" placeholder="存款转入/理财转入等" /></div>' +
            '</div><div style="margin-top:0.5rem"><button type="button" class="btn btn-primary tx-save-edit">保存</button> <button type="button" class="btn btn-ghost tx-cancel-edit">取消</button></div></div></td></tr>';
        }).join('');
        var paginationHtml = list.length > 0 ? '<div class="pagination">' +
          '<button type="button" class="btn btn-ghost page-prev" ' + (safePage <= 1 ? 'disabled' : '') + '>上一页</button>' +
          '<div class="page-nums">' + pageNumbers.map(function (n) {
            return '<button type="button" class="btn ' + (safePage === n ? 'page-active' : 'btn-ghost') + ' page-num" data-page="' + n + '">' + n + '</button>';
          }).join('') + '</div>' +
          '<button type="button" class="btn btn-ghost page-next" ' + (safePage >= totalPages ? 'disabled' : '') + '>下一页</button></div>' : '';
        var txBlock = document.getElementById('tx-block');
        if (txBlock) {
          if (list.length === 0) {
            txBlock.innerHTML = '<p class="no-data" style="padding:1rem 0;color:var(--text-muted)">暂无记录。</p>';
          } else {
            txBlock.innerHTML = '<div class="table-wrap" style="margin-top:1rem"><table class="table">' +
              '<thead><tr><th>时间</th><th>类型</th><th>金额</th><th>分类</th><th>对方/备注</th><th>来源</th><th>备注</th><th></th></tr></thead>' +
              '<tbody id="tx-tbody">' + tableRows + '</tbody></table></div>' + paginationHtml;
          }
        }
        var block = document.getElementById('tx-block');
        if (block) block.querySelectorAll('.page-prev, .page-next, .page-num, .tx-delete, .tx-edit, .tx-save-edit, .tx-cancel-edit').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (btn.classList.contains('tx-delete')) {
              if (!confirm('确定删除？')) return;
              api('/transactions/' + btn.getAttribute('data-id'), { method: 'DELETE' }).then(function () {
                api('/transactions').then(function (l) { list = l; currentPage = 1; renderTxBlock(); });
              });
            } else if (btn.classList.contains('tx-edit')) {
              block.querySelectorAll('.tx-edit-row').forEach(function (r) { r.style.display = 'none'; });
              var id = btn.getAttribute('data-id');
              var editRow = block.querySelector('.tx-edit-row[data-tx-id="' + id + '"]');
              if (editRow) editRow.style.display = 'table-row';
            } else if (btn.classList.contains('tx-cancel-edit')) {
              btn.closest('.tx-edit-row').style.display = 'none';
            } else if (btn.classList.contains('tx-save-edit')) {
              var row = btn.closest('.tx-edit-row');
              var id = row.getAttribute('data-tx-id');
              var timeVal = row.querySelector('.tx-edit-time').value;
              var timeStr = timeVal ? timeVal.replace('T', ' ').slice(0, 16) : '';
              api('/transactions/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  time: timeStr,
                  type: row.querySelector('.tx-edit-type').value,
                  amount: parseFloat(row.querySelector('.tx-edit-amount').value) || 0,
                  category: row.querySelector('.tx-edit-category').value,
                  counterparty: row.querySelector('.tx-edit-counterparty').value || '',
                  remark: row.querySelector('.tx-edit-remark').value || ''
                })
              }).then(function () {
                api('/transactions').then(function (l) { list = l; renderTxBlock(); });
              }).catch(function (err) { alert(err.message || '保存失败'); });
            } else if (btn.classList.contains('page-prev')) { currentPage = Math.max(1, currentPage - 1); renderTxBlock(); }
            else if (btn.classList.contains('page-next')) { currentPage = Math.min(totalPages, currentPage + 1); renderTxBlock(); }
            else if (btn.classList.contains('page-num')) { currentPage = parseInt(btn.getAttribute('data-page'), 10); renderTxBlock(); }
          });
        });
      }
      function renderInvBlock() {
        var invTotalPages = Math.max(1, Math.ceil(investments.length / INV_PAGE_SIZE));
        var invSafePage = Math.min(invPage, invTotalPages);
        var invStart = (invSafePage - 1) * INV_PAGE_SIZE;
        var invPageList = investments.slice(invStart, invStart + INV_PAGE_SIZE);
        var invPageNumbers = getPageNumbers(invTotalPages);
        var invRows = invPageList.map(function (inv) {
          return '<div class="inv-card" data-inv-id="' + escapeHtml(inv.id) + '">' +
            '<div class="inv-row">' +
            '<span class="inv-name">' + escapeHtml(inv.name) + '</span>' +
            '<span class="inv-platform">' + escapeHtml(inv.platform) + '</span>' +
            '<span class="mono">本金 ¥' + (inv.principal || 0).toLocaleString('zh-CN') + '</span>' +
            '<span class="mono text-income">本息 ¥' + (inv.totalAmount || 0).toLocaleString('zh-CN') + '</span>' +
            '<span class="mono">' + (inv.startDate || '') + ' ~ ' + (inv.endDate || '') + '</span>' +
            '<label class="checkbox-row"><input type="checkbox" class="inv-transferred-cb" data-id="' + escapeHtml(inv.id) + '" ' + (inv.transferredToFunds ? 'checked' : '') + ' /> 已赎出（理财已结束）</label>' +
            '<button type="button" class="btn btn-ghost inv-edit-btn">编辑</button>' +
            '<button type="button" class="btn btn-danger inv-delete">删除</button></div>' +
            '<div class="inv-edit-form" style="display:none;padding-top:0.75rem;border-top:1px solid var(--border);margin-top:0.5rem">' +
            '<input class="input inv-edit-name" placeholder="产品名" value="' + escapeHtml(inv.name) + '" style="margin-bottom:0.5rem;display:block" />' +
            '<input class="input inv-edit-platform" placeholder="平台" value="' + escapeHtml(inv.platform) + '" style="margin-bottom:0.5rem;display:block" />' +
            '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">' +
            '<input type="number" class="input inv-edit-principal" placeholder="本金" value="' + (inv.principal || '') + '" style="max-width:100px" />' +
            '<input type="number" class="input inv-edit-total" placeholder="本息" value="' + (inv.totalAmount || '') + '" style="max-width:100px" />' +
            '<input type="date" class="input inv-edit-start" value="' + (inv.startDate || '') + '" />' +
            '<input type="date" class="input inv-edit-end" value="' + (inv.endDate || '') + '" />' +
            '<button type="button" class="btn btn-primary inv-save-edit">保存</button>' +
            '<button type="button" class="btn btn-ghost inv-cancel-edit">取消</button></div></div></div>';
        }).join('');
        var invPagination = investments.length > 0 ? '<div class="pagination" style="margin-top:0.75rem">' +
          '<button type="button" class="btn btn-ghost inv-page-prev" ' + (invSafePage <= 1 ? 'disabled' : '') + '>上一页</button>' +
          '<div class="page-nums">' + invPageNumbers.map(function (n) {
            return '<button type="button" class="btn ' + (invSafePage === n ? 'page-active' : 'btn-ghost') + ' inv-page-num" data-page="' + n + '">' + n + '</button>';
          }).join('') + '</div>' +
          '<button type="button" class="btn btn-ghost inv-page-next" ' + (invSafePage >= invTotalPages ? 'disabled' : '') + '>下一页</button></div>' : '';
        var invBlock = document.getElementById('inv-list-block');
        if (invBlock) {
          if (investments.length === 0) {
            invBlock.innerHTML = '<p class="no-data" style="color:var(--text-muted);padding:1rem 0">暂无理财记录。</p>';
          } else {
            invBlock.innerHTML = '<div class="inv-list">' + invRows + '</div>' + invPagination;
          }
        }
        var invBlockEl = document.getElementById('inv-list-block');
        if (invBlockEl) {
          invBlockEl.querySelectorAll('.inv-transferred-cb, .inv-edit-btn, .inv-delete, .inv-save-edit, .inv-cancel-edit, .inv-page-prev, .inv-page-next, .inv-page-num').forEach(function (btn) {
            btn.onclick = function () {
              var card = btn.closest('.inv-card');
              if (btn.classList.contains('inv-transferred-cb')) {
                api('/investments/' + btn.getAttribute('data-id'), {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ transferredToFunds: btn.checked })
                }).then(function () { api('/investments').then(function (l) { investments = l; renderInvBlock(); }); });
              } else if (btn.classList.contains('inv-edit-btn') && card) {
                card.querySelector('.inv-row').style.display = 'none';
                card.querySelector('.inv-edit-form').style.display = 'block';
              } else if (btn.classList.contains('inv-cancel-edit') && card) {
                card.querySelector('.inv-row').style.display = '';
                card.querySelector('.inv-edit-form').style.display = 'none';
              } else if (btn.classList.contains('inv-save-edit') && card) {
                var id = card.getAttribute('data-inv-id');
                api('/investments/' + id, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: card.querySelector('.inv-edit-name').value,
                    platform: card.querySelector('.inv-edit-platform').value,
                    principal: parseFloat(card.querySelector('.inv-edit-principal').value) || 0,
                    totalAmount: parseFloat(card.querySelector('.inv-edit-total').value) || 0,
                    startDate: card.querySelector('.inv-edit-start').value,
                    endDate: card.querySelector('.inv-edit-end').value
                  })
                }).then(function () { api('/investments').then(function (l) { investments = l; renderInvBlock(); }); });
              } else if (btn.classList.contains('inv-delete')) {
                if (!confirm('确定删除？')) return;
                api('/investments/' + (card && card.getAttribute('data-inv-id')), { method: 'DELETE' })
                  .then(function () { api('/investments').then(function (l) { investments = l; invPage = 1; renderInvBlock(); }); });
              } else if (btn.classList.contains('inv-page-prev')) { invPage = Math.max(1, invPage - 1); renderInvBlock(); }
              else if (btn.classList.contains('inv-page-next')) { invPage = Math.min(invTotalPages, invPage + 1); renderInvBlock(); }
              else if (btn.classList.contains('inv-page-num')) { invPage = parseInt(btn.getAttribute('data-page'), 10); renderInvBlock(); }
            };
          });
        }
      }
      renderInvBlock();

      document.getElementById('inv-form') && document.getElementById('inv-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        api('/investments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fd.get('name') || '', platform: fd.get('platform') || '',
            principal: parseFloat(fd.get('principal')) || 0, totalAmount: parseFloat(fd.get('totalAmount')) || 0,
            startDate: fd.get('startDate') || '', endDate: fd.get('endDate') || ''
          })
        }).then(function () { api('/investments').then(function (l) { investments = l; invPage = 1; renderInvBlock(); e.target.reset(); }); });
      });

      document.querySelectorAll('.goal-transferred-cb').forEach(function (cb) {
        cb.addEventListener('change', function () {
          api('/goals/' + cb.getAttribute('data-id'), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transferredToFunds: cb.checked })
          }).then(function () { api('/goals').then(function (g) { goalsData = g; goals = g.goals || []; }); });
        });
      });

      renderTxBlock();

      var manualTimeEl = document.getElementById('manual-time');
      if (manualTimeEl) {
        var now = new Date();
        manualTimeEl.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + 'T' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      }
      document.getElementById('btn-upload') && document.getElementById('btn-upload').addEventListener('click', function () { document.getElementById('csv-file').click(); });
      document.getElementById('csv-file') && document.getElementById('csv-file').addEventListener('change', function () {
        var file = this.files[0]; this.value = '';
        var msg = document.getElementById('upload-msg'); msg.innerHTML = ''; msg.className = '';
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.csv')) { msg.className = 'msg-error'; msg.textContent = '请上传 CSV 文件'; return; }
        var fd = new FormData(); fd.append('file', file);
        fetch('/api/transactions/upload', { method: 'POST', body: fd }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
          .then(function (j) {
            msg.className = 'msg-success'; msg.textContent = j.message || '成功导入 ' + j.count + ' 条';
              api('/transactions').then(function (l) { list = l; currentPage = 1; renderTxBlock(); });
              api('/upload-meta').then(function (m) {
                var h = document.getElementById('upload-range-hint');
                if (h && m.lastUploadRange) h.textContent = '上次导入：' + m.lastUploadRange.min + ' 至 ' + m.lastUploadRange.max + '（共' + m.lastUploadRange.count + '条）';
              });
          }).catch(function (err) { msg.className = 'msg-error'; msg.textContent = err.message || '上传失败'; });
      });
      document.getElementById('btn-manual') && document.getElementById('btn-manual').addEventListener('click', function () {
        var fm = document.getElementById('manual-form'); fm.style.display = fm.style.display === 'none' ? 'block' : 'none';
      });
      document.getElementById('manual-add-form') && document.getElementById('manual-add-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var f = e.target;
        var fd = new FormData(f);
        var t = fd.get('time') || ''; if (t.length > 16) t = t.slice(0, 16); t = t.replace('T', ' ');
        fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            time: t, type: fd.get('type') || 'expense', amount: parseFloat(fd.get('amount')) || 0,
            category: fd.get('category') || '其他', counterparty: fd.get('counterparty') || '', source: 'manual'
          })
        }).then(function (r) { return r.json(); }).then(function () {
          api('/transactions').then(function (l) { list = l; document.getElementById('manual-form').style.display = 'none'; renderTxBlock(); });
        });
      });

      var planCb = document.getElementById('has-deposit-plan');
      if (planCb) {
        planCb.addEventListener('change', function () {
          api('/goals/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hasActiveDepositPlan: planCb.checked })
          }).catch(function () {});
        });
      }

      if (goals.length > 0) {
        (function bindGoalClicks() {
          var app = document.getElementById('app');
          if (app._goalClicksBound) return;
          app._goalClicksBound = true;
          app.addEventListener('click', function goalClickDelegated(e) {
            var card = e.target.closest('.goal-card');
            if (!card) return;
            var id = card.getAttribute('data-goal-id');
            if (e.target.classList.contains('goal-delete')) {
              if (!confirm('确定删除该目标？')) return;
              api('/goals/' + id, { method: 'DELETE' }).then(renderGoals).catch(function (err) { alert(err.message || '删除失败'); });
            } else if (e.target.classList.contains('goal-edit-btn')) {
            card.querySelector('.goal-view').style.display = 'none';
            card.querySelector('.goal-edit-form').style.display = 'block';
          } else if (e.target.classList.contains('goal-cancel-edit')) {
            card.querySelector('.goal-view').style.display = 'block';
            card.querySelector('.goal-edit-form').style.display = 'none';
          } else if (e.target.classList.contains('goal-save-edit')) {
            var name = (card.querySelector('.goal-field-name').value || '').trim();
            var targetAmount = parseFloat(card.querySelector('.goal-field-target').value);
            var currentAmount = parseFloat(card.querySelector('.goal-field-current').value) || 0;
            var deadline = (card.querySelector('.goal-field-deadline').value || '').trim();
            if (!name || !targetAmount || targetAmount <= 0 || !deadline) { alert('请填写完整且有效的目标信息'); return; }
            var transferred = !!card.querySelector('.goal-field-transferred:checked');
            api('/goals/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: name, targetAmount: targetAmount, currentAmount: currentAmount, deadline: deadline, transferredToFunds: transferred })
            }).then(function () { renderGoals(); }).catch(function (err) { alert(err.message || '保存失败'); });
          } else if (e.target.classList.contains('goal-update')) {
            var wrap = card.querySelector('.current-edit');
            var input = wrap.querySelector('.goal-edit-input');
            var saveBtn = wrap.querySelector('.goal-save');
            var cancelBtn = wrap.querySelector('.goal-cancel');
            var updateBtn = wrap.querySelector('.goal-update');
            var current = parseFloat(card.querySelector('.progress-text').textContent.replace(/[^\d.]/g, '').split('/')[0]) || 0;
            input.value = current;
            input.style.display = 'inline-block';
            saveBtn.style.display = 'inline-flex';
            cancelBtn.style.display = 'inline-flex';
            updateBtn.style.display = 'none';
            input.focus();
          } else if (e.target.classList.contains('goal-save')) {
            var inp = card.querySelector('.goal-edit-input');
            var v = parseFloat(inp.value);
            if (isNaN(v) || v < 0) return;
            api('/goals/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ currentAmount: v })
            }).then(function () {
              card.querySelector('.goal-edit-input').style.display = 'none';
              card.querySelector('.goal-save').style.display = 'none';
              card.querySelector('.goal-cancel').style.display = 'none';
              card.querySelector('.goal-update').style.display = 'inline-flex';
              renderGoals();
            });
          } else if (e.target.classList.contains('goal-cancel')) {
            card.querySelector('.goal-edit-input').style.display = 'none';
            card.querySelector('.goal-save').style.display = 'none';
            card.querySelector('.goal-cancel').style.display = 'none';
            card.querySelector('.goal-update').style.display = 'inline-flex';
          }
          });
        })();
      }
    }).catch(function (err) {
      document.getElementById('app').innerHTML = '<h1 class="page-title">存款目标</h1><div class="card"><p class="no-data">加载失败：' + escapeHtml(err.message || '') + '</p></div>';
      setActiveNav('goals');
    });
  }

  function renderTransactions() {
    api('/transactions').then(function (list) {
      var currentPage = 1;
      var txListenerAdded = false;

      function renderTransactionsContent() {
        totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        safePage = Math.min(currentPage, totalPages);
        start = (safePage - 1) * PAGE_SIZE;
        pageList = list.slice(start, start + PAGE_SIZE);
        pageNumbers = getPageNumbers(totalPages);

        var tableRows = pageList.map(function (t) {
          return '<tr>' +
            '<td class="mono">' + escapeHtml(t.time) + '</td>' +
            '<td><span class="' + (t.type === 'income' ? 'text-income' : 'text-expense') + '">' + (t.type === 'income' ? '收入' : '支出') + '</span></td>' +
            '<td class="mono ' + (t.type === 'income' ? 'text-income' : 'text-expense') + '">' + (t.type === 'income' ? '+' : '-') + '¥' + t.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</td>' +
            '<td>' + escapeHtml(t.category) + '</td>' +
            '<td>' + escapeHtml(t.counterparty) + '</td>' +
            '<td>' + sourceLabel(t.source) + '</td>' +
            '<td><button type="button" class="btn btn-danger tx-delete" data-id="' + escapeHtml(t.id) + '">删除</button></td></tr>';
        }).join('');

        var paginationHtml = '';
        if (list.length > 0) {
          paginationHtml = '<div class="pagination">' +
            '<button type="button" class="btn btn-ghost page-prev" ' + (safePage <= 1 ? 'disabled' : '') + '>上一页</button>' +
            '<div class="page-nums">' +
            pageNumbers.map(function (n) {
              return '<button type="button" class="btn ' + (safePage === n ? 'page-active' : 'btn-ghost') + ' page-num" data-page="' + n + '">' + n + '</button>';
            }).join('') +
            '</div>' +
            '<button type="button" class="btn btn-ghost page-next" ' + (safePage >= totalPages ? 'disabled' : '') + '>下一页</button></div>';
        }

        var mainHtml = '<h1 class="page-title">交易记录</h1>' +
          '<div class="card" style="margin-bottom:1.5rem">' +
          '<h2 class="section-title">上传账单（统一入口）</h2>' +
          '<p class="hint">支持微信、支付宝、招商银行等账单，请先下载统一模板，按表头填写后上传 CSV。</p>' +
          '<div class="upload-row">' +
          '<a href="/template" class="btn btn-ghost" download>下载统一模板</a>' +
          '<input type="file" accept=".csv" class="file-input" id="csv-file" />' +
          '<button type="button" class="btn btn-primary" id="btn-upload">选择文件并上传</button>' +
          '<button type="button" class="btn btn-ghost" id="btn-manual">手动添加一条</button></div>' +
          '<div id="upload-msg"></div>' +
          '<div id="manual-form" style="display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)">' +
          '<form id="manual-add-form" class="manual-form" style="margin-top:0">' +
          '<div class="manual-grid">' +
          '<div><label class="label">时间</label><input type="datetime-local" class="input" name="time" id="manual-time" /></div>' +
          '<div><label class="label">类型</label><select class="input" name="type"><option value="income">收入</option><option value="expense" selected>支出</option></select></div>' +
          '<div><label class="label">金额（元）</label><input type="number" class="input" name="amount" min="0" step="0.01" required /></div>' +
          '<div><label class="label">分类</label><select class="input" name="category">' +
          CATEGORIES.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') +
          '</select></div>' +
          '<div><label class="label">对方/备注</label><input class="input" name="counterparty" placeholder="选填" /></div>' +
          '</div><button type="submit" class="btn btn-primary">添加</button></form></div></div>' +
          '<h2 class="section-title">收支记录</h2>';

        if (list.length === 0) {
          mainHtml += '<div class="card" style="color:var(--text-muted);text-align:center;padding:2rem">暂无记录，请上传账单或手动添加。</div>';
        } else {
          mainHtml += '<div class="card table-wrap"><table class="table">' +
            '<thead><tr><th>时间</th><th>类型</th><th>金额</th><th>分类</th><th>对方/备注</th><th>来源</th><th></th></tr></thead>' +
            '<tbody id="tx-tbody">' + tableRows + '</tbody></table></div>' + paginationHtml;
        }

        document.getElementById('app').innerHTML = mainHtml;
        setActiveNav('transactions');

        var manualTime = document.getElementById('manual-time');
        if (manualTime) {
          var now = new Date();
          manualTime.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + 'T' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        }

        document.getElementById('btn-upload').addEventListener('click', function () { document.getElementById('csv-file').click(); });
        document.getElementById('csv-file').addEventListener('change', function () {
          var file = this.files[0];
          this.value = '';
          var msg = document.getElementById('upload-msg');
          msg.innerHTML = '';
          msg.className = '';
          if (!file) return;
          if (!file.name.toLowerCase().endsWith('.csv')) {
            msg.className = 'msg-error';
            msg.textContent = '请上传 CSV 文件（与统一模板格式一致）';
            return;
          }
          var fd = new FormData();
          fd.append('file', file);
          fetch('/api/transactions/upload', { method: 'POST', body: fd })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
            .then(function (j) {
              msg.className = 'msg-success';
              msg.textContent = j.message || '成功导入 ' + j.count + ' 条记录';
              api('/transactions').then(function (l) { list = l; currentPage = 1; renderTransactionsContent(); });
            })
            .catch(function (err) {
              msg.className = 'msg-error';
              msg.textContent = err.message || '解析失败';
            });
        });

        document.getElementById('btn-manual').addEventListener('click', function () {
          var el = document.getElementById('manual-form');
          el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });
        var manualForm = document.getElementById('manual-add-form');
        if (manualForm) {
          manualForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(e.target);
            var time = fd.get('time').toString().replace('T', ' ');
            api('/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                time: time,
                type: fd.get('type'),
                amount: parseFloat(fd.get('amount')),
                category: fd.get('category'),
                counterparty: (fd.get('counterparty') || '').trim(),
                source: 'manual'
              })
            }).then(function () {
              api('/transactions').then(function (l) { list = l; currentPage = 1; document.getElementById('manual-form').style.display = 'none'; renderTransactionsContent(); });
              e.target.reset();
            });
          });
        }

        if (!txListenerAdded) {
          txListenerAdded = true;
          document.getElementById('app').addEventListener('click', function (e) {
            if (e.target.classList.contains('tx-delete')) {
              if (!confirm('确定删除这条记录？')) return;
              var id = e.target.getAttribute('data-id');
              api('/transactions/' + id, { method: 'DELETE' }).then(function () {
                list = list.filter(function (t) { return t.id !== id; });
                var totalP = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
                if (currentPage > totalP) currentPage = totalP;
                renderTransactionsContent();
              });
            } else if (e.target.classList.contains('page-prev') && currentPage > 1) {
              currentPage--;
              renderTransactionsContent();
            } else if (e.target.classList.contains('page-next') && currentPage < totalPages) {
              currentPage++;
              renderTransactionsContent();
            } else if (e.target.classList.contains('page-num')) {
              currentPage = parseInt(e.target.getAttribute('data-page'), 10);
              renderTransactionsContent();
            }
          });
        }
      }

      renderTransactionsContent();
    });
  }

  function renderAnalysis() {
    var now = new Date();
    function loadAnalysisState() {
      try {
        var s = localStorage.getItem('analysisState');
        if (s) { var d = JSON.parse(s); return { period: d.period || 'month', month: d.month || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')), quarterYear: d.quarterYear || now.getFullYear(), quarterNum: d.quarterNum || (Math.floor(now.getMonth() / 3) + 1), yearOnly: d.yearOnly || now.getFullYear(), customStart: d.customStart || '', customEnd: d.customEnd || '' }; }
      } catch (e) {}
      return { period: 'month', month: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), quarterYear: now.getFullYear(), quarterNum: Math.floor(now.getMonth() / 3) + 1, yearOnly: now.getFullYear(), customStart: '', customEnd: '' };
    }
    function saveAnalysisState(st) {
      try { localStorage.setItem('analysisState', JSON.stringify(st)); } catch (e) {}
    }
    var aState = loadAnalysisState();
    var period = aState.period;
    var month = aState.month;
    var quarterYear = aState.quarterYear;
    var quarterNum = aState.quarterNum;
    var yearOnly = aState.yearOnly;
    var customStart = aState.customStart;
    var customEnd = aState.customEnd;

    function getMonthParam() {
      if (period === 'month') return month;
      if (period === 'quarter') return quarterYear + '-' + ['01', '04', '07', '10'][quarterNum - 1];
      if (period === 'year') return yearOnly + '-01';
      return month;
    }

    function load() {
      var monthParam = getMonthParam();
      var q = '?period=' + encodeURIComponent(period) + '&month=' + encodeURIComponent(monthParam) + '&custom_start=' + encodeURIComponent(customStart) + '&custom_end=' + encodeURIComponent(customEnd);
      api('/analysis' + q).then(function (data) {
        var total = data.income + data.expense;
        var incomeRatio = total > 0 ? (data.income / total) * 100 : 0;
        var expenseRatio = total > 0 ? (data.expense / total) * 100 : 0;
        var catHtml = '';
        if (data.categoryExpenseList && data.categoryExpenseList.length > 0) {
          data.categoryExpenseList.forEach(function (c) {
            var pct = data.expense > 0 ? (c.amount / data.expense) * 100 : 0;
            catHtml += '<div class="category-row">' +
              '<span class="cat-name">' + escapeHtml(c.name) + '</span>' +
              '<div class="cat-bar-wrap"><div class="cat-bar" style="width:' + pct + '%"></div></div>' +
              '<span class="mono cat-amount">¥' + c.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + ' (' + pct.toFixed(1) + '%)</span></div>';
          });
        } else {
          catHtml = '<p class="no-data">该周期暂无支出记录</p>';
        }
        var suggestionHtml = '';
        if (data.suggestions && data.suggestions.length > 0) {
          suggestionHtml = '<ul class="suggestion-list">' + data.suggestions.map(function (s) { return '<li>' + escapeHtml(s) + '</li>'; }).join('') + '</ul>';
        } else {
          suggestionHtml = '<p class="no-data">当前周期数据下暂无特别建议，保持良好习惯即可。</p>';
        }
        var productHtml = PRODUCTS.map(function (p) {
          return '<div class="product-card">' +
            '<span class="product-tag">' + escapeHtml(p.tag) + '</span>' +
            '<span class="product-name">' + escapeHtml(p.name) + '</span>' +
            '<p class="product-desc">' + escapeHtml(p.desc) + '</p></div>';
        }).join('');

        var html = '<h1 class="page-title">消费数据分析</h1>' +
          '<div class="card" style="margin-bottom:1.5rem">' +
          '<h2 class="section-title">选择周期</h2>' +
          '<p class="hint" style="margin-bottom:0.75rem">选择时间范围后点击「查询」查看该周期内的账单分析。若看不到数据，请确认所选周期与账单中的交易时间一致。</p>' +
          '<div class="period-row">' +
          '<select class="input" id="analysis-period" style="width:auto;min-width:120px">' +
          '<option value="month"' + (period === 'month' ? ' selected' : '') + '>月度</option>' +
          '<option value="quarter"' + (period === 'quarter' ? ' selected' : '') + '>季度</option>' +
          '<option value="year"' + (period === 'year' ? ' selected' : '') + '>年度</option>' +
          '<option value="custom"' + (period === 'custom' ? ' selected' : '') + '>自定义</option></select>' +
          '<span id="analysis-month-wrap"><input type="month" class="input" id="analysis-month" style="width:160px" value="' + month + '" /></span>' +
          '<span id="analysis-quarter-wrap" style="display:none">' +
          '<select class="input" id="analysis-quarter-year" style="width:100px">' + (function(){ var y=now.getFullYear(); var opts=[]; for(var i=y-2;i<=y+2;i++) opts.push('<option value="'+i+'"'+(i===quarterYear?' selected':'')+'>'+i+'年</option>'); return opts.join(''); })() + '</select>' +
          '<select class="input" id="analysis-quarter-num" style="width:90px"><option value="1"'+(quarterNum===1?' selected':'')+'>第1季度</option><option value="2"'+(quarterNum===2?' selected':'')+'>第2季度</option><option value="3"'+(quarterNum===3?' selected':'')+'>第3季度</option><option value="4"'+(quarterNum===4?' selected':'')+'>第4季度</option></select>' +
          '</span>' +
          '<span id="analysis-year-wrap" style="display:none"><select class="input" id="analysis-year" style="width:120px">' + (function(){ var y=now.getFullYear(); var opts=[]; for(var i=y-2;i<=y+2;i++) opts.push('<option value="'+i+'"'+(i===yearOnly?' selected':'')+'>'+i+'年</option>'); return opts.join(''); })() + '</select></span>' +
          '<span id="analysis-custom-wrap" style="display:none">' +
          '<input type="date" class="input" id="custom-start" style="width:150px" placeholder="开始" />' +
          '<span class="range-label">至</span>' +
          '<input type="date" class="input" id="custom-end" style="width:150px" placeholder="结束" />' +
          '</span>' +
          '<button type="button" class="btn btn-primary" id="analysis-query-btn">查询</button>' +
          '</div><p class="range-label">当前分析范围：' + escapeHtml(data.label) + '</p></div>' +
          '<div class="analysis-cards">' +
          '<div class="card">' +
          '<h3 class="card-title">收支占比</h3>' +
          '<div class="ratio-bar">' +
          '<div class="ratio-income" style="width:' + incomeRatio + '%"></div>' +
          '<div class="ratio-expense" style="width:' + expenseRatio + '%"></div></div>' +
          '<div class="ratio-legend">' +
          '<span class="text-income">收入 ¥' + data.income.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</span>' +
          '<span class="text-expense">支出 ¥' + data.expense.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</span></div></div>' +
          '<div class="card">' +
          '<h3 class="card-title">日均金额</h3>' +
          '<div class="daily">' +
          '<div><span class="label">日均收入</span><span class="mono text-income daily-val">¥' + data.dailyIncome.toFixed(2) + '</span></div>' +
          '<div><span class="label">日均支出</span><span class="mono text-expense daily-val">¥' + data.dailyExpense.toFixed(2) + '</span></div></div>' +
          '<p class="daily-hint">统计天数：' + data.daysInRange + ' 天</p></div></div>' +
          '<div class="card" style="margin-top:1.5rem">' +
          '<h3 class="card-title">支出分类占比</h3>' + catHtml + '</div>' +
          '<div class="card" style="margin-top:1.5rem">' +
          '<h3 class="card-title">花销调节建议</h3>' + suggestionHtml + '</div>' +
          '<div class="card" style="margin-top:1.5rem">' +
          '<h3 class="card-title">理财产品方向建议</h3>' +
          '<p class="hint">根据风险偏好与资金期限选择合适的配置，以下为常见方向参考。</p>' +
          '<div class="product-grid">' + productHtml + '</div></div>';
        document.getElementById('app').innerHTML = html;
        setActiveNav('analysis');

        var periodEl = document.getElementById('analysis-period');
        var monthEl = document.getElementById('analysis-month');
        var quarterYearEl = document.getElementById('analysis-quarter-year');
        var quarterNumEl = document.getElementById('analysis-quarter-num');
        var yearEl = document.getElementById('analysis-year');
        var customStartEl = document.getElementById('custom-start');
        var customEndEl = document.getElementById('custom-end');
        var monthWrap = document.getElementById('analysis-month-wrap');
        var quarterWrap = document.getElementById('analysis-quarter-wrap');
        var yearWrap = document.getElementById('analysis-year-wrap');
        var customWrap = document.getElementById('analysis-custom-wrap');
        function togglePeriodInputs() {
          var p = periodEl.value;
          monthWrap.style.display = p === 'month' ? 'inline' : 'none';
          quarterWrap.style.display = p === 'quarter' ? 'inline' : 'none';
          yearWrap.style.display = p === 'year' ? 'inline' : 'none';
          customWrap.style.display = p === 'custom' ? 'inline' : 'none';
        }
        periodEl.value = period;
        monthEl.value = month;
        if (quarterYearEl) quarterYearEl.value = quarterYear;
        if (quarterNumEl) quarterNumEl.value = quarterNum;
        if (yearEl) yearEl.value = yearOnly;
        customStartEl.value = customStart;
        customEndEl.value = customEnd;
        togglePeriodInputs();
        periodEl.addEventListener('change', function () {
          period = periodEl.value;
          togglePeriodInputs();
        });
        monthEl.addEventListener('change', function () { month = monthEl.value; });
        if (quarterYearEl) quarterYearEl.addEventListener('change', function () { quarterYear = parseInt(quarterYearEl.value, 10); });
        if (quarterNumEl) quarterNumEl.addEventListener('change', function () { quarterNum = parseInt(quarterNumEl.value, 10); });
        if (yearEl) yearEl.addEventListener('change', function () { yearOnly = parseInt(yearEl.value, 10); });
        customStartEl.addEventListener('change', function () { customStart = customStartEl.value; });
        customEndEl.addEventListener('change', function () { customEnd = customEndEl.value; });
        document.getElementById('analysis-query-btn').addEventListener('click', function () {
          period = periodEl.value;
          month = monthEl.value;
          quarterYear = quarterYearEl ? parseInt(quarterYearEl.value, 10) : quarterYear;
          quarterNum = quarterNumEl ? parseInt(quarterNumEl.value, 10) : quarterNum;
          yearOnly = yearEl ? parseInt(yearEl.value, 10) : yearOnly;
          customStart = customStartEl.value;
          customEnd = customEndEl.value;
          if (period === 'custom' && (!customStart || !customEnd)) {
            alert('请选择开始日期和结束日期后再查询。');
            return;
          }
          saveAnalysisState({ period: period, month: month, quarterYear: quarterYear, quarterNum: quarterNum, yearOnly: yearOnly, customStart: customStart, customEnd: customEnd });
          load();
        });
      });
    }

    load();
  }

  function loadRecDailyCount() {
    try {
      var s = localStorage.getItem('recDaily');
      if (!s) return { date: '', count: 0 };
      var d = JSON.parse(s);
      var today = new Date().toISOString().slice(0, 10);
      return d.date === today ? d : { date: '', count: 0 };
    } catch (e) { return { date: '', count: 0 }; }
  }
  function incRecDailyCount() {
    var today = new Date().toISOString().slice(0, 10);
    var d = loadRecDailyCount();
    var count = (d.date === today ? d.count : 0) + 1;
    try { localStorage.setItem('recDaily', JSON.stringify({ date: today, count: count })); } catch (e) {}
    return count;
  }

  function renderRecommendations() {
    Promise.all([api('/recommendations'), api('/preferences')]).then(function (results) {
      var data = results[0];
      var prefs = results[1] || {};
      var gb = data.goalBreakdown || [];
      var monthS = data.monthSuggestion || {};
      var quarterS = data.quarterSuggestion || {};
      var invList = data.investmentRecommendations || [];
      var mFetch = data.monthlyFetchCount;
      var mMax = data.monthlyFetchMax || 3;

      var ruleHint = '<p class="rec-rule-hint">修改推荐依据后立即刷新推荐。每日最多 2 次；产品数据每月最多拉取 ' + mMax + ' 次。</p>';
      var prefFormHtml = '<div class="pref-form-block rec-form-section">' +
        '<h3 class="card-title">推荐依据</h3>' +
        ruleHint +
        '<form id="pref-form" class="form">' +
        '<div class="form-grid" style="grid-template-columns:repeat(3,1fr)">' +
        '<div><label class="label">资金使用时间</label><select class="input" name="fundAvailability">' +
        '<option value="随时要用"' + (prefs.fundAvailability === '随时要用' ? ' selected' : '') + '>随时要用</option>' +
        '<option value="3-6个月不用"' + (prefs.fundAvailability === '3-6个月不用' ? ' selected' : '') + '>3-6个月不用</option>' +
        '<option value="1年以上不用"' + (prefs.fundAvailability === '1年以上不用' ? ' selected' : '') + '>1年以上不用</option>' +
        '<option value="3年以上不用"' + (prefs.fundAvailability === '3年以上不用' ? ' selected' : '') + '>3年以上不用</option>' +
        '</select></div>' +
        '<div><label class="label">单笔起购门槛（元）</label><select class="input" name="minPurchaseThreshold">' +
        '<option value="5000"' + (Number(prefs.minPurchaseThreshold) === 5000 ? ' selected' : '') + '>5000</option>' +
        '<option value="10000"' + (Number(prefs.minPurchaseThreshold) === 10000 ? ' selected' : '') + '>1万</option>' +
        '<option value="20000"' + (Number(prefs.minPurchaseThreshold) === 20000 ? ' selected' : '') + '>2万</option>' +
        '<option value="50000"' + (Number(prefs.minPurchaseThreshold) === 50000 ? ' selected' : '') + '>5万</option>' +
        '</select></div>' +
        '<div><label class="label">风险偏好</label><select class="input" name="riskPreference">' +
        '<option value="保守型"' + (prefs.riskPreference === '保守型' ? ' selected' : '') + '>保守型</option>' +
        '<option value="稳健型"' + (prefs.riskPreference === '稳健型' ? ' selected' : '') + '>稳健型</option>' +
        '<option value="进取型"' + (prefs.riskPreference === '进取型' ? ' selected' : '') + '>进取型</option>' +
        '</select></div>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary">保存并刷新推荐</button>' +
        '</form></div>';

      var invHtml = '<div class="product-grid">' + invList.map(function (inv) {
        var title = inv.name ? escapeHtml(inv.name) : escapeHtml(inv.type);
        var titleEl = inv.url ? '<a href="' + escapeHtml(inv.url) + '" target="_blank" rel="noopener" class="product-name-link">' + title + '</a>' : '<span class="product-name">' + title + '</span>';
        var meta = [];
        if (inv.code) meta.push('代码 ' + escapeHtml(inv.code));
        if (inv.company) meta.push(escapeHtml(inv.company));
        var minP = inv.minPurchase;
        var minPStr = minP >= 10000 ? (minP / 10000) + '万' : String(minP);
        var termStr = inv.term || '—';
        var yieldLabel = '近6月年化 ';
        var yieldVal = inv.yield ? (inv.yield + '%') : '—';
        return '<div class="product-card">' +
          '<span class="product-type-label">' + escapeHtml(inv.type) + ' · ' + escapeHtml(inv.riskLevel || '') + '</span>' +
          '<div class="product-yield-row"><span class="product-yield-label">' + yieldLabel + '</span><span class="product-yield-value text-income">' + escapeHtml(yieldVal) + '</span></div>' +
          '<div class="product-extra-row"><span>起购 ' + escapeHtml(minPStr) + ' 元</span><span>期限 ' + escapeHtml(termStr) + '</span></div>' +
          titleEl +
          (meta.length ? '<p class="product-meta">' + meta.join(' · ') + '</p>' : '') +
          '<p class="product-desc">' + escapeHtml(inv.reason) + '</p>' +
          '<p class="product-desc" style="margin-top:0.5rem;font-size:0.8rem">' + escapeHtml(inv.platforms || '天天基金、支付宝、微信理财通') + '</p></div>';
      }).join('') + '</div>';
      var fundFooter = '';
      if (data.fundSource || data.fundUpdatedAt || mFetch !== undefined) {
        var parts = [escapeHtml(data.fundSource || '东方财富/天天基金')];
        if (data.fundUpdatedAt) parts.push('上次更新 ' + escapeHtml(data.fundUpdatedAt));
        if (mFetch !== undefined && mMax) parts.push('产品数据本月 ' + mFetch + '/' + mMax + ' 次');
        fundFooter = '<p class="fund-footer">' + parts.join(' · ') + '</p>';
      }

      var html = '<h1 class="page-title">理财产品智能推荐</h1>' +
        '<div class="card">' +
        '<h2 class="section-title">理财产品推荐</h2>' +
        prefFormHtml +
        '<p class="hint rec-desc">按资金时间、起购门槛、风险偏好筛选，符合条件产品按近6月年化排序，每类最多 3 只、共 ≤ 7 只。</p>' +
        invHtml +
        fundFooter +
        '</div>';
      document.getElementById('app').innerHTML = html;
      setActiveNav('recommendations');
      var form = document.getElementById('pref-form');
      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var daily = loadRecDailyCount();
          if (daily.count >= 2) {
            alert('今日推荐次数已用完（每日最多 2 次），请明天再试。');
            return;
          }
          var fd = new FormData(form);
          api('/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fundAvailability: fd.get('fundAvailability') || '随时要用',
              minPurchaseThreshold: parseInt(fd.get('minPurchaseThreshold'), 10) || 5000,
              riskPreference: fd.get('riskPreference') || '稳健型'
            })
          }).then(function () {
            incRecDailyCount();
            renderRecommendations();
          }).catch(function (err) {
            alert('保存失败：' + (err.message || '请稍后重试'));
          });
        });
      }
    }).catch(function (err) {
      document.getElementById('app').innerHTML = '<h1 class="page-title">理财产品智能推荐</h1><div class="card"><p class="no-data">加载失败：' + escapeHtml(err.message || '请稍后重试') + '</p></div>';
      setActiveNav('recommendations');
    });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function route() {
    var hash = (location.hash || '#/').slice(1) || '/';
    var page = hash === '/' ? 'dashboard' : hash.slice(1);
    if (page === 'dashboard') renderDashboard();
    else if (page === 'goals' || page === 'transactions') renderGoals();
    else if (page === 'analysis') renderAnalysis();
    else if (page === 'recommendations') renderRecommendations();
    else renderDashboard();
  }

  document.getElementById('app').addEventListener('submit', function (e) {
    if (e.target.id !== 'goal-form') return;
    e.preventDefault();
    var fd = new FormData(e.target);
    var name = (fd.get('name') || '').trim();
    var targetAmount = parseFloat(fd.get('targetAmount'));
    var currentAmount = parseFloat(fd.get('currentAmount')) || 0;
    var deadline = fd.get('deadline');
    if (!name || !targetAmount || targetAmount <= 0 || !deadline) {
      alert('请填写完整：目标名称、目标金额（大于0）、截止日期');
      return;
    }
    api('/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, targetAmount: targetAmount, currentAmount: currentAmount, deadline: deadline })
    }).then(function () { renderGoals(); e.target.reset(); }).catch(function (err) { alert(err.message || '添加失败'); });
  });

  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      var page = (location.hash || '#/').slice(1) || '/';
      if (page === 'dashboard' || page === '') renderDashboard();
    }
  });
  route();
})();
