/** 统一账单记录（微信/支付宝/招商银行等合并格式） */
export interface Transaction {
  id: string
  /** 交易时间 YYYY-MM-DD HH:mm 或 YYYY-MM-DD */
  time: string
  /** 类型：收入 / 支出 */
  type: 'income' | 'expense'
  /** 金额（元，正数） */
  amount: number
  /** 分类：餐饮/交通/购物/理财/工资/转账 等 */
  category: string
  /** 对方/备注 */
  counterparty: string
  /** 来源：wechat | alipay | cmb | manual */
  source: 'wechat' | 'alipay' | 'cmb' | 'manual'
}

/** 存款目标 */
export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string // YYYY-MM-DD
  createdAt: string
}

/** 分析周期 */
export type AnalysisPeriod = 'month' | 'quarter' | 'year' | 'custom'

/** 统一上传模板表头（CSV） */
export const UPLOAD_TEMPLATE_HEADERS = [
  '交易时间',
  '类型',
  '金额',
  '分类',
  '对方/备注',
  '来源',
] as const

export type UploadTemplateRow = Record<(typeof UPLOAD_TEMPLATE_HEADERS)[number], string>
