import { useState } from 'react'
import { useGoals } from '../store/useStore'
import styles from './Goals.module.css'

export default function Goals() {
  const { goals, add, updateCurrent, remove } = useGoals()
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const target = parseFloat(targetAmount)
    const current = parseFloat(currentAmount) || 0
    if (!name.trim() || !target || target <= 0 || !deadline) return
    add({ name: name.trim(), targetAmount: target, currentAmount: current, deadline })
    setName('')
    setTargetAmount('')
    setDeadline('')
    setCurrentAmount('')
  }

  const startEdit = (id: string, current: number) => {
    setEditingId(id)
    setEditValue(String(current))
  }

  const saveEdit = () => {
    if (editingId && editValue !== '') {
      const v = parseFloat(editValue)
      if (!Number.isNaN(v) && v >= 0) updateCurrent(editingId, v)
      setEditingId(null)
      setEditValue('')
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>存款目标</h1>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className={styles.sectionTitle}>新建目标</h2>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formRow}>
            <label className="label">目标名称</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：紧急备用金"
            />
          </div>
          <div className={styles.formGrid}>
            <div>
              <label className="label">目标金额（元）</label>
              <input
                type="number"
                className="input"
                min="0"
                step="0.01"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="10000"
              />
            </div>
            <div>
              <label className="label">当前已存（元）</label>
              <input
                type="number"
                className="input"
                min="0"
                step="0.01"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label">目标截止日</label>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">添加目标</button>
        </form>
      </div>

      <h2 className={styles.sectionTitle}>目标列表与达成情况</h2>
      {goals.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
          暂无存款目标，请先添加一个目标。
        </div>
      ) : (
        <div className={styles.goalList}>
          {goals.map((g) => {
            const progress = Math.min(100, (g.currentAmount / g.targetAmount) * 100)
            const isOverdue = new Date(g.deadline) < new Date()
            const isDone = g.currentAmount >= g.targetAmount
            return (
              <div key={g.id} className={`card ${styles.goalCard}`}>
                <div className={styles.goalHead}>
                  <span className={styles.goalName}>{g.name}</span>
                  <span className={styles.goalDeadline}>截止 {g.deadline}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => remove(g.id)}
                  >
                    删除
                  </button>
                </div>
                <div className={styles.progressWrap}>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{
                        width: `${progress}%`,
                        backgroundColor: isDone ? 'var(--income)' : isOverdue ? 'var(--expense)' : 'var(--accent)',
                      }}
                    />
                  </div>
                  <span className={`mono ${styles.progressText}`}>
                    ¥{g.currentAmount.toLocaleString('zh-CN')} / ¥{g.targetAmount.toLocaleString('zh-CN')}
                    {' '}({progress.toFixed(0)}%)
                  </span>
                </div>
                <div className={styles.currentEdit}>
                  {editingId === g.id ? (
                    <>
                      <input
                        type="number"
                        className="input"
                        style={{ maxWidth: '140px' }}
                        min="0"
                        step="0.01"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                      />
                      <button type="button" className="btn btn-primary" onClick={saveEdit}>保存</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>取消</button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => startEdit(g.id, g.currentAmount)}
                    >
                      更新当前金额
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
