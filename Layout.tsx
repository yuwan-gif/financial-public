import { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './Layout.module.css'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.logo}>
          <span className="mono">SmartFinance</span>
        </NavLink>
        <nav className={styles.nav}>
          <NavLink to="/" end className={styles.navLink}>概览</NavLink>
          <NavLink to="/goals" className={styles.navLink}>存款目标</NavLink>
          <NavLink to="/transactions" className={styles.navLink}>交易记录</NavLink>
          <NavLink to="/analysis" className={styles.navLink}>数据分析</NavLink>
        </nav>
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
