import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navigation from './components/Navigation'
import DashboardPage from './pages/DashboardPage'
import BudgetPage from './pages/BudgetPage'
import BefolkningPage from './pages/BefolkningPage'
import LovgivningPage from './pages/LovgivningPage'
import QuestionPage from './pages/QuestionPage'

function App() {
  return (
    <Router>
      {/* Fixed navigation bar */}
      <Navigation />

      {/* Main content area with padding for fixed nav */}
      <main className="pt-20 min-h-screen">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/befolkning" element={<BefolkningPage />} />
          <Route path="/lovgivning" element={<LovgivningPage />} />
          <Route path="/spoergsmaal" element={<QuestionPage />} />
        </Routes>
      </main>
    </Router>
  )
}

export default App
