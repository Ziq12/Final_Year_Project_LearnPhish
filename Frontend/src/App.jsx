import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage    from './pages/HomePage'
import Result2Page from './pages/Result2Page'
import DatasetPage from './pages/DatasetPage'
import LearnPage   from './pages/LearnPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"        element={<HomePage />}    />
        <Route path="/result"  element={<Result2Page />} />
        <Route path="/result1" element={<Result2Page />} />
        <Route path="/result2" element={<Result2Page />} />
        <Route path="/result3" element={<Result2Page />} />
        <Route path="/dataset" element={<DatasetPage />} />
        <Route path="/learn"   element={<LearnPage />} />
      </Routes>
    </BrowserRouter>
  )
}
