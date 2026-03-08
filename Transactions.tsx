import { useState, useRef } from 'react'
import { useTransactions, parseUploadCsv } from '../store/useStore'
import type { Transaction } from '../types'
import styles from './Transactions.module.css'

const CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '住房', '医疗', '教育', '理财', '工资', '转账', '其他']

const PAGE_SIZE = 10
const FIRST_PAGES = 5
const LAST_PAGES = 3

/** 只显示前5页与后3页的页码，中间页用“上一页”“下一页”控制 */
function getPageNumbers(totalPages: number): number[] {
  if (totalPages <= 0) return []
  const set = new Set<number>()
  for (let i = 1; i <= Math.min(FIRST_PAGES, totalPages); i++) set.add(i)
  for (let i = totalPages - LAST_PAGES + 1; i <= totalPages; i++) if (i > 0) set.add(i)
  return Array.from(set).sort((a, b) => a - b)
}

export default function Transactions() {
  const { list, addMany, add, remove } = useTransactions()
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showManual, setShowManual] = useState(false)
  const [manualTime, setManualTime] = useState(() => new Date().toISOString().slice(0, 16).replace('T', ' '))
  const [manualType, setManualType] = useState<'income' | 'expense'>('expense')
  const [manualAmount, setManualAmount] = useState('')
  const [manualCategory, setManualCategory] = useState('餐饮')
  const [manualCounterparty, setManualCounterparty] = useState('')

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const pageList = list.slice(start, start + PAGE_SIZE)
  const pageNumbers = getPageNumbers(totalPages)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setUploadError('')
    setUploadSuccess('')
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setUploadError('请上传 CSV 文件（与统一模板格式一致）')
      return
    }
    try {
      const rows = await parseUploadCsv(file)
      if (rows.length === 0) {
        setUploadError('文件中没有有效数据行')
        return
      }
      addMany(rows)
      setUploadSuccess(`成功导入 ${rows.length} 条记录`)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '解析失败，请检查模板格式')
    }
  }

  const handleDelete = (t: Transaction) => {
    if (window.confirm('确定删除这条记录？')) remove(t.id)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = parseFloat(manualAmount)
    if (Number.isNaN(amount) || amount <= 0) return
    add({
      time: manualTime,
      type: manualType,
      amount,
      category: manualCategory,
      counterparty: manualCounterparty.trim(),
      source: 'manual',
    })
    setManualAmount('')
    setManualCounterparty('')
    setShowManual(false)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>交易记录</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className={styles.sectionTitle}>上传账单（统一入口）</h2>
        <p className={styles.hint}>
          支持微信、支付宝、招商银行等账单，请先下载统一模板，按表头填写后上传 CSV。
        </p>
        <div className={styles.uploadRow}>
          <a
            href="/账单上传模板.csv"
            download="账单上传模板.csv"
            className="btn btn-ghost"
          >
            下载统一模板
          </a>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className={styles.fileInput}
            onChange={handleFile}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
          >
            选择文件并上传
          </button>
        </div>
        {uploadError && <p className={styles.error}>{uploadError}</p>}
        {uploadSuccess && <p className={styles.success}>{uploadSuccess}</p>}
        <div className={styles.uploadRow} style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-ghost" onClick={() => setShowManual(!showManual)}>
            {showManual ? '取消' : '手动添加一条'}
          </button>
        </div>
        {showManual && (
          <form onSubmit={handleManualSubmit} className={styles.manualForm}>
            <div className={styles.manualGrid}>
              <div>
                <label className="label">时间</label>
                <input type="datetime-local" className="input" value={manualTime.slice(0, 16).replace(' ', 'T')} onChange={(e) => setManualTime(e.target.value.replace('T', ' '))} />
              </div>
              <div>
                <label className="label">类型</label>
                <select className="input" value={manualType} onChange={(e) => setManualType(e.target.value as 'income' | 'expense')}>
                  <option value="income">收入</option>
                  <option value="expense">支出</option>
                </select>
              </div>
              <div>
                <label className="label">金额（元）</label>
                <input type="number" className="input" min="0" step="0.01" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} required />
              </div>
              <div>
                <label className="label">分类</label>
                <select className="input" value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">对方/备注</label>
                <input className="input" value={manualCounterparty} onChange={(e) => setManualCounterparty(e.target.value)} placeholder="选填" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">添加</button>
          </form>
        )}
      </div>

      <h2 className={styles.sectionTitle}>收支记录</h2>
      {list.length === 0 ? (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
          暂无记录，请上传账单或手动添加。
        </div>
      ) : (
        <>
          <div className={`card ${styles.tableWrap}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>金额</th>
                  <th>分类</th>
                  <th>对方/备注</th>
                  <th>来源</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageList.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.time}</td>
                    <td>
                      <span className={t.type === 'income' ? 'text-income' : 'text-expense'}>
                        {t.type === 'income' ? '收入' : '支出'}
                      </span>
                    </td>
                    <td className={`mono ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {t.type === 'income' ? '+' : '-'}¥{t.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </td>
                    <td>{t.category}</td>
                    <td>{t.counterparty}</td>
                    <td>{t.source === 'wechat' ? '微信' : t.source === 'alipay' ? '支付宝' : t.source === 'cmb' ? '招商银行' : '手动'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDelete(t)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.pagination}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <div className={styles.pageNums}>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn ${safePage === n ? styles.pageActive : 'btn-ghost'}`}
                  onClick={() => setCurrentPage(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  )
}
