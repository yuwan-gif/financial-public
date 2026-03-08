import { Link } from 'react-router-dom'
import { useTransactions } from '../store/useStore'
import { useGoals } from '../store/useStore'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { list } = useTransactions()
  const { goals } = useGoals()

  const totalIncome = list
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0)
  const totalExpense = list
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0)
  const balance = totalIncome - totalExpense

  const onTrack = goals.filter(
    (g) => g.currentAmount < g.targetAmount && new Date(g.deadline) >= new Date()
  )

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>概览</h1>
      <div className={styles.cards}>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>当前结余</span>
          <span className={`mono ${styles.statValue} ${balance >= 0 ? 'text-income' : 'text-expense'}`}>
            ¥ {balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </span>
          <div className={styles.miniRow}>
            <span className="text-income">收入 ¥{totalIncome.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
            <span className="text-expense">支出 ¥{totalExpense.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>进行中目标</span>
          <span className={`mono ${styles.statValue}`}>{onTrack.length} 个</span>
          <Link to="/goals" className={styles.link}>管理存款目标 →</Link>
        </div>
      </div>
      <div className="card">
        <h2 className={styles.sectionTitle}>快捷入口</h2>
        <div className={styles.actions}>
          <Link to="/goals" className="btn btn-primary">设置存款目标</Link>
          <Link to="/transactions" className="btn btn-ghost">上传账单 / 查看记录</Link>
          <Link to="/analysis" className="btn btn-ghost">数据分析与建议</Link>
        </div>
      </div>
    </div>
  )
}
