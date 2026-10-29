import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Building2, ChevronDown, Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FAGOMRAADER, NAV_LINKS, COLORS } from '../utils/constants'

const STORAGE_KEY = 'budgetindsigt-fagomraade'

function Navigation() {
  const location = useLocation()
  const [selectedFagomraade, setSelectedFagomraade] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || FAGOMRAADER[0]?.id || 'skole'
    } catch {
      return FAGOMRAADER[0]?.id || 'skole'
    }
  })
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, selectedFagomraade)
    } catch {
      // localStorage not available
    }
  }, [selectedFagomraade])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownOpen && !e.target.closest('[data-fagomraade-dropdown]')) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const currentLabel =
    FAGOMRAADER.find((f) => f.id === selectedFagomraade)?.label || FAGOMRAADER[0]?.label

  const handleSelectFagomraade = (id) => {
    setSelectedFagomraade(id)
    setDropdownOpen(false)
  }

  const glassStyle = {
    background: COLORS.bgSurface,
    borderBottom: '1px solid ' + COLORS.borderSubtle,
  }

  const dropdownGlassStyle = {
    background: COLORS.bgRaised,
    border: `1px solid ${COLORS.borderDefault}`,
  }

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 z-50 flex items-center" style={glassStyle}>
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Left: Logo */}
        <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(99, 102, 241, 0.2)' }}
          >
            <Building2 className="w-5 h-5" style={{ color: COLORS.primaryLight }} />
          </div>
          <span
            className="text-lg font-semibold tracking-tight hidden sm:block"
            style={{ color: COLORS.textPrimary }}
          >
            BudgetIndsigt
          </span>
        </NavLink>

        {/* Center: Nav links (desktop) */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.path === '/'}
              className={({ isActive }) =>
                `relative px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
                  isActive
                    ? ''
                    : 'hover:bg-white/5'
                }`
              }
              style={({ isActive }) => ({
                color: isActive ? COLORS.textPrimary : COLORS.textSecondary,
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute inset-0 rounded-md z-0"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{link.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Right: Fagomr\u00e5de dropdown + mobile menu */}
        <div className="flex items-center gap-3">
          {/* Fagomr\u00e5de dropdown */}
          <div className="relative" data-fagomraade-dropdown>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg
                         transition-all duration-200 hover:bg-white/5"
              style={{
                color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <span className="max-w-[140px] truncate">{currentLabel}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
                style={{ color: COLORS.textSecondary }}
              />
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 rounded-xl py-1.5 shadow-2xl shadow-black/40"
                  style={dropdownGlassStyle}
                >
                  {FAGOMRAADER.map((fag) => (
                    <button
                      key={fag.id}
                      onClick={() => handleSelectFagomraade(fag.id)}
                      className="w-full text-left px-4 py-2 text-sm transition-colors duration-150 hover:bg-white/5"
                      style={{
                        color:
                          selectedFagomraade === fag.id
                            ? COLORS.primaryLight
                            : COLORS.textSecondary,
                        background:
                          selectedFagomraade === fag.id
                            ? 'rgba(99, 102, 241, 0.1)'
                            : 'transparent',
                      }}
                    >
                      {fag.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: COLORS.textSecondary }}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-16 left-0 right-0 md:hidden overflow-hidden"
            style={{
              background: COLORS.bgSurface,
              borderBottom: `1px solid ${COLORS.borderSubtle}`,
            }}
          >
            <div className="px-4 py-3 flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.path}
                  to={link.path}
                  end={link.path === '/'}
                  className="px-4 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200"
                  style={({ isActive }) => ({
                    color: isActive ? COLORS.primaryLight : COLORS.textSecondary,
                    background: isActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  })}
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}

export default Navigation
