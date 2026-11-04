import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ImportPage } from './pages/ImportPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden />
            Apontamento
          </Link>
          <nav className="nav" aria-label="Principal">
            <NavLink to="/" end>
              Importações
            </NavLink>
            <NavLink to="/configuracoes">Configurações</NavLink>
          </nav>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/importacoes/:id" element={<ImportPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <main className="page">
              <h1>Página não encontrada</h1>
              <p>
                <Link to="/">Voltar para as importações</Link>
              </p>
            </main>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
