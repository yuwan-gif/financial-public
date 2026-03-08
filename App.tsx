import { Routes, Route, NavLink } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Goals from './pages/Goals'
import Transactions from './pages/Transactions'
import Analysis from './pages/Analysis'

function App() {
  return (
    <>
      <div className="app-bg" />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/analysis" element={<Analysis />} />
        </Routes>
      </Layout>
    </>
  )
}

export default App
