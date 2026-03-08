import { useState, useMemo } from 'react'
import { useTransactions } from '../store/useStore'
import type { Transaction } from '../types'
import styles from './Analysis.module.css'

type PeriodType = 'month' | 'quarter' | 'year' | 'custom'

function parseDate(t: Transaction): Date {
  const s = t.time.replace(/\s.*$/, '').trim()
  const d = new Date(s)
  return isNaN(d.getTime()) ? new Date(0) : d
}

function inRange(d: Date, start: Date, end: Date): boolean {
  const t = d.getTime()
  return t >= start.getTime() && t <= end.getTime()
}

function getRange(period: PeriodType, month: string, customStart: string, customEnd: string): { start: Date; end: Date; label: string } {
  const now = new Date()
  let start: Date
  let end: Date
  let label: string
  if (period === 'month' && month) {
    const [y, m] = month.split('-').map(Number)
    start = new Date(y, m - 1, 1)
    end = new Date(y, m, 0, 23, 59, 59)
    label = `${y}年${m}月`
  } else if (period === 'quarter' && month) {
    const [y, m] = month.split('-').map(Number)
    const q = Math.floor((m - 1) / 3) + 1
    start = new Date(y, (q - 1) * 3, 1)
    end = new Date(y, q * 3, 0, 23, 59, 59)
    label = `${y}年Q${q}`
  } else if (period === 'year' && month) {
    const y = parseInt(month.slice(0, 4), 10)
    start = new Date(y, 0, 1)
    end = new Date(y, 11, 31, 23, 59, 59)
    label = `${y}年`
  } else if (period === 'custom' && customStart && customEnd) {
    start = new Date(customStart)
    end = new Date(customEnd)
    end.setHours(23, 59, 59, 999)
    label = `${customStart} 至 ${customEnd}`
  } else {
    const y = now.getFullYear()
    const m = now.getMonth()
    start = new Date(y, m, 1)
    end = new Date()
    label = '本月'
  }
  return { start, end, label }
}

export default function Analysis() {
  const { list } = useTransactions()
  const [period, setPeriod] = useState<PeriodType>('month')
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const range = useMemo(
    () => getRange(period, month, customStart, customEnd),
    [period, month, customStart, customEnd]
  )

  const { filtered, income, expense, byCategory, daysInRange } = useMemo(() => {
    const filtered = list.filter((t) => inRange(parseDate(t), range.start, range.end))
    const income = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const byCategory: Record<string, { income: number; expense: number }> = {}
    filtered.forEach((t) => {
      const cat = t.category || '其他'
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 }
      if (t.type === 'income') byCategory[cat].income += t.amount
      else byCategory[cat].expense += t.amount
    })
    const daysInRange = Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)) + 1)
    return { filtered, income, expense, byCategory, daysInRange }
  }, [list, range])

  const total = income + expense
  const incomeRatio = total > 0 ? (income / total) * 100 : 0
  const expenseRatio = total > 0 ? (expense / total) * 100 : 0
  const dailyExpense = daysInRange > 0 ? expense / daysInRange : 0
  const dailyIncome = daysInRange > 0 ? income / daysInRange : 0

  const categoryExpenseList = Object.entries(byCategory)
    .map(([name, v]) => ({ name, amount: v.expense }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const suggestions = useMemo(() => {
    const tips: string[] = []
    if (expense > 0 && income > 0) {
      const saveRate = ((income - expense) / income) * 100
      if (saveRate < 0) tips.push('该周期支出大于收入，建议减少非必要消费或增加收入来源。')
      else if (saveRate < 20) tips.push('储蓄率偏低，建议将月收入的至少 20% 用于储蓄或投资。')
      else if (saveRate >= 30) tips.push('储蓄率良好，可考虑将部分结余配置到稳健型理财产品。')
    }
    if (categoryExpenseList.length > 0) {
      const top = categoryExpenseList[0]
      const pct = (top.amount / expense) * 100
      if (pct > 40) tips.push(`「${top.name}」占比过高（${pct.toFixed(0)}%），可适当控制该类支出。`)
    }
    return tips
  }, [income, expense, categoryExpenseList])

  const productSuggestions = [
    { name: '货币基金', desc: '流动性好、风险低，适合短期闲置资金', tag: '稳健' },
    { name: '债券基金', desc: '波动小于股票，适合 6 个月以上闲钱', tag: '稳健' },
    { name: '指数基金定投', desc: '长期平滑波动，适合坚持 3 年以上的储蓄', tag: '成长' },
    { name: '银行大额存单', desc: '保本保息，适合确定期限不用的资金', tag: '保本' },
  ]

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>数据分析与建议</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className={styles.sectionTitle}>选择周期</h2>
        <div className={styles.periodRow}>
          <select
            className="input"
            style={{ width: 'auto', minWidth: '120px' }}
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodType)}
          >
            <option value="month">月度</option>
            <option value="quarter">季度</option>
            <option value="year">年度</option>
            <option value="custom">自定义</option>
          </select>
          {(period === 'month' || period === 'quarter' || period === 'year') && (
            <input
              type="month"
              className="input"
              style={{ width: '160px' }}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          )}
          {period === 'custom' && (
            <>
              <input
                type="date"
                className="input"
                style={{ width: '150px' }}
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                placeholder="开始日期"
              />
              <span className={styles.to}>至</span>
              <input
                type="date"
                className="input"
                style={{ width: '150px' }}
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                placeholder="结束日期"
              />
            </>
          )}
        </div>
        <p className={styles.rangeLabel}>当前分析范围：{range.label}</p>
      </div>

      <div className={styles.cards}>
        <div className="card">
          <h3 className={styles.cardTitle}>收支占比</h3>
          <div className={styles.ratioBar}>
            <div
              className={styles.ratioIncome}
              style={{ width: `${incomeRatio}%` }}
            />
            <div
              className={styles.ratioExpense}
              style={{ width: `${expenseRatio}%` }}
            />
          </div>
          <div className={styles.ratioLegend}>
            <span className="text-income">收入 ¥{income.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
            <span className="text-expense">支出 ¥{expense.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <div className="card">
          <h3 className={styles.cardTitle}>日均金额</h3>
          <div className={styles.daily}>
            <div>
              <span className="label">日均收入</span>
              <span className={`mono text-income ${styles.dailyVal}`}>¥{dailyIncome.toFixed(2)}</span>
            </div>
            <div>
              <span className="label">日均支出</span>
              <span className={`mono text-expense ${styles.dailyVal}`}>¥{dailyExpense.toFixed(2)}</span>
            </div>
          </div>
          <p className={styles.dailyHint}>统计天数：{daysInRange} 天</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className={styles.cardTitle}>支出分类占比</h3>
        {categoryExpenseList.length === 0 ? (
          <p className={styles.noData}>该周期暂无支出记录</p>
        ) : (
          <div className={styles.categoryList}>
            {categoryExpenseList.map(({ name, amount }) => {
              const pct = expense > 0 ? (amount / expense) * 100 : 0
              return (
                <div key={name} className={styles.categoryRow}>
                  <span className={styles.catName}>{name}</span>
                  <div className={styles.catBarWrap}>
                    <div
                      className={styles.catBar}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`mono ${styles.catAmount}`}>
                    ¥{amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} ({pct.toFixed(1)}%)
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className={styles.cardTitle}>花销调节建议</h3>
        {suggestions.length === 0 ? (
          <p className={styles.noData}>当前周期数据下暂无特别建议，保持良好习惯即可。</p>
        ) : (
          <ul className={styles.suggestionList}>
            {suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className={styles.cardTitle}>理财产品方向建议</h3>
        <p className={styles.hint}>根据风险偏好与资金期限选择合适的配置，以下为常见方向参考。</p>
        <div className={styles.productGrid}>
          {productSuggestions.map((p) => (
            <div key={p.name} className={styles.productCard}>
              <span className={styles.productTag}>{p.tag}</span>
              <span className={styles.productName}>{p.name}</span>
              <p className={styles.productDesc}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
