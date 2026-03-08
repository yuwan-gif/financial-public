import { useCallback, useEffect, useState } from 'react'
import type { Transaction, SavingsGoal } from '../types'
import { UPLOAD_TEMPLATE_HEADERS } from '../types'

const TRANSACTIONS_KEY = 'smart-finance-transactions'
const GOALS_KEY = 'smart-finance-goals'

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch (_) {}
  return fallback
}

function saveJson(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function useTransactions() {
  const [list, setList] = useState<Transaction[]>(() =>
    loadJson<Transaction[]>(TRANSACTIONS_KEY, [])
  )

  useEffect(() => {
    saveJson(TRANSACTIONS_KEY, list)
  }, [list])

  const add = useCallback((t: Omit<Transaction, 'id'>) => {
    const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    setList((prev) => [{ ...t, id }, ...prev])
  }, [])

  const addMany = useCallback((items: Omit<Transaction, 'id'>[]) => {
    const withIds = items.map((t) => ({
      ...t,
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    }))
    setList((prev) => [...withIds, ...prev])
  }, [])

  const remove = useCallback((id: string) => {
    setList((prev) => prev.filter((x) => x.id !== id))
  }, [])

  return { list, add, addMany, remove, setList }
}

export function useGoals() {
  const [goals, setGoals] = useState<SavingsGoal[]>(() =>
    loadJson<SavingsGoal[]>(GOALS_KEY, [])
  )

  useEffect(() => {
    saveJson(GOALS_KEY, goals)
  }, [goals])

  const add = useCallback((g: Omit<SavingsGoal, 'id' | 'createdAt'>) => {
    const id = `goal-${Date.now()}`
    setGoals((prev) => [
      { ...g, id, createdAt: new Date().toISOString().slice(0, 10) },
      ...prev,
    ])
  }, [])

  const updateCurrent = useCallback((id: string, currentAmount: number) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, currentAmount } : g))
    )
  }, [])

  const remove = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id))
  }, [])

  return { goals, add, updateCurrent, remove, setGoals }
}

/** 解析上传的 CSV（统一模板） */
export function parseUploadCsv(file: File): Promise<Omit<Transaction, 'id'>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result as string
        const lines = text.trim().split(/\r?\n/)
        if (lines.length < 2) {
          resolve([])
          return
        }
        const header = lines[0]
        const expected = UPLOAD_TEMPLATE_HEADERS.join(',')
        if (header.replace(/\s/g, '') !== expected.replace(/\s/g, '')) {
          reject(new Error('表头与统一模板不一致，请使用提供的模板填写后上传。'))
          return
        }
        const sourceMap = { 微信: 'wechat' as const, 支付宝: 'alipay' as const, 招商银行: 'cmb' as const, 手动: 'manual' as const }
        const typeMap = { 收入: 'income' as const, 支出: 'expense' as const }
        const result: Omit<Transaction, 'id'>[] = []
        for (let i = 1; i < lines.length; i++) {
          const cells = parseCsvLine(lines[i])
          if (cells.length < 6) continue
          const [time, typeStr, amountStr, category, counterparty, sourceStr] = cells
          const type = typeMap[typeStr as keyof typeof typeMap] || 'expense'
          const source = sourceMap[sourceStr as keyof typeof sourceMap] || 'manual'
          let amount = parseFloat(String(amountStr).replace(/[^\d.-]/g, '')) || 0
          if (type === 'expense' && amount > 0) amount = -amount
          if (type === 'income' && amount < 0) amount = -amount
          result.push({
            time: time.trim() || new Date().toISOString().slice(0, 16).replace('T', ' '),
            type,
            amount: Math.abs(amount),
            category: (category || '其他').trim(),
            counterparty: (counterparty || '').trim(),
            source,
          })
        }
        resolve(result)
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'UTF-8')
  })
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if ((c === ',' && !inQuotes) || c === '\t') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur.trim())
  return out
}
