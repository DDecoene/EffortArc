import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ActivityDetail from './pages/ActivityDetail'
import Goals from './pages/Goals'
import Progress from './pages/Progress'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="activities/:id" element={<ActivityDetail />} />
        <Route path="goals" element={<Goals />} />
        <Route path="progress" element={<Progress />} />
      </Route>
    </Routes>
  )
}
