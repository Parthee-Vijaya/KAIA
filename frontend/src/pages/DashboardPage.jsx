import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TrendingUp, AlertTriangle, Users, Scale, Sparkles, ArrowRight } from 'lucide-react'
import KPICard from '../components/KPICard'
import SearchBar from '../components/SearchBar'
import AlertBanner from '../components/AlertBanner'
import { COLORS } from '../utils/constants'
import { BUDGET_SUMMARY, BUDGET_2024 } from '../data/mockBudget'
import { formatCurrency, formatPercent } from '../utils/constants'

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
}

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

// Dashboard alerts
const DASHBOARD_ALERTS = [
  {
    type: 'warning',
    title: 'Ældreområdet over budget',
    message: 'Ældreområdet overskredet YTD med 8,2 mio. kr. Forecast viser en helårsafvigelse på +12,3 mio. kr. Primært drevet af stigende antal hjemmeplejemodtagere.',
    source: 'Budgetopfølgning september 2024',
  },
  {
    type: 'danger',
    title: '340 flere +80-årige',
    message: '340 flere borgere over 80 år end budgetteret - estimeret merudgift 42,5 mio. kr. årligt. Befolkningsprognosen bør opdateres.',
    source: 'DST Befolkningsdata Q3 2024',
  },
  {
    type: 'info',
    title: 'Nyt lovforslag L142',
    message: 'Nyt lovforslag L142 om minimumsnormeringer i daginstitutioner kan påvirke dagtilbudsbudgettet med estimeret +15-25 mio. kr./år.',
    source: 'Folketingets lovforslag 2024-25',
  },
  {
    type: 'warning',
    title: 'Specialundervisning +10,4%',
    message: 'Specialundervisningsbudgettet overskredet med 9,9 mio. kr. YTD. Prognosen peger mod 104,9 mio. kr. mod budget 95 mio. kr. Stigende visitationstal er primær driver.',
    source: 'Budgetopfølgning september 2024',
  },
  {
    type: 'warning',
    title: 'Likviditet under 150 mio. kr.',
    message: 'Kassebeholdningen er faldet til 148,5 mio. kr. Kommunens minimumsmål er 100 mio. kr. Nuværende trend viser at målet nås i marts 2025 uden handling.',
    source: 'Likviditetsrapport Q3 2024',
  },
  {
    type: 'info',
    title: 'OK24 implementering',
    message: 'Den nye overenskomst OK24 medfører merudgifter på 37 mio. kr. i 2024. Kompensation via bloktilskud forventes med 6-12 måneders forsinkelse.',
    source: 'KL OK24 beregninger',
  },
]

// Recent AI insights
const RECENT_INSIGHTS = [
  {
    title: 'Specialundervisning vokser hurtigere end forventet',
    summary: 'Udgifterne til specialundervisning er steget 10,5% YoY. Nuværende trend peger mod en overskridelse på 8-12 mio. kr.',
    timestamp: '2 timer siden',
    category: 'Budget',
  },
  {
    title: 'Demografisk pres accelererer',
    summary: 'Antallet af +80-årige borgere vokser hurtigere end alle prognoser. Kommunen bør revurdere ældreplejekapaciteten.',
    timestamp: '5 timer siden',
    category: 'Befolkning',
  },
  {
    title: 'L142 fremsat i Folketinget',
    summary: 'Lovforslag om minimumsnormeringer er fremsat. KL estimerer DUT-kompensation dækker 60-70% af merudgifterne.',
    timestamp: '1 dag siden',
    category: 'Lovgivning',
  },
  {
    title: 'Likviditet under pres i Q4',
    summary: 'Kassebeholdningen forventes at falde til 135 mio. kr. ultimo 2024. Minimumsgrænsen er 100 mio. kr.',
    timestamp: '2 dage siden',
    category: 'Økonomi',
  },
  {
    title: 'Botilbud § 107/108 presser socialbudget',
    summary: 'Udgifter til botilbud er steget 12% YoY. 8 nye borgere visiteret til § 108-tilbud i Q3 med en gennemsnitspris på 850.000 kr./år.',
    timestamp: '3 dage siden',
    category: 'Budget',
  },
  {
    title: 'Novo Nordisk melder 800 nye jobs i 2025',
    summary: 'Novo Nordisk udvider produktionen i Kalundborg med 800 nye stillinger. Forventes at øge tilflytning og skatteindtægter med 15-20 mio. kr.',
    timestamp: '4 dage siden',
    category: 'Befolkning',
  },
  {
    title: 'Rekrutteringskrise i ældrepleje',
    summary: 'Vakanceraten for SOSU-assistenter er steget til 8,4%. 42 ubesatte stillinger på tværs af de 4 plejehjem. Vikarudgifter stiger 25%.',
    timestamp: '5 dage siden',
    category: 'Personale',
  },
  {
    title: 'Klimatilpasning forsinket 3-6 måneder',
    summary: 'Regnvandsprojektet på Holbækvej afventer miljøgodkendelse. Budget 30 mio. kr. Forsinkelsen kan medføre merudgifter på 2-4 mio. kr.',
    timestamp: '1 uge siden',
    category: 'Anlæg',
  },
]

function DashboardPage() {
  const navigate = useNavigate()

  const handleSearch = (query) => {
    navigate(`/spoergsmaal?q=${encodeURIComponent(query)}`)
  }

  const budgetUtilization = BUDGET_SUMMARY.totalYTD / (BUDGET_SUMMARY.totalBudget * ((BUDGET_SUMMARY.currentMonth + 1) / 12)) * 100

  const getCategoryBadgeStyle = (category) => {
    switch (category) {
      case 'Budget':
      case 'Økonomi':
        return {
          background: 'rgba(59,130,246,0.12)',
          color: '#60a5fa',
          border: '1px solid rgba(59,130,246,0.2)',
        }
      case 'Befolkning':
        return {
          background: 'rgba(245,158,11,0.12)',
          color: '#fbbf24',
          border: '1px solid rgba(245,158,11,0.2)',
        }
      case 'Lovgivning':
        return {
          background: 'rgba(139,92,246,0.12)',
          color: '#a78bfa',
          border: '1px solid rgba(139,92,246,0.2)',
        }
      case 'Personale':
        return {
          background: 'rgba(20, 184, 166, 0.12)',
          color: '#2dd4bf',
          border: '1px solid rgba(20, 184, 166, 0.2)',
        }
      case 'Anlæg':
        return {
          background: 'rgba(251, 146, 60, 0.12)',
          color: '#fb923c',
          border: '1px solid rgba(251, 146, 60, 0.2)',
        }
      default:
        return {
          background: 'rgba(99, 102, 241, 0.15)',
          color: COLORS.primaryLight,
          border: '1px solid rgba(99, 102, 241, 0.2)',
        }
    }
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16"
    >
      {/* Hero Section */}
      <motion.div variants={staggerItem} className="text-center pt-8 pb-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
            <span className="text-gradient">BudgetIndsigt</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto">
            AI-drevet budgetrådgiver for kommunale ledere
          </p>
        </motion.div>
      </motion.div>

      {/* Search Bar */}
      <motion.div variants={staggerItem} className="mb-12">
        <SearchBar onSearch={handleSearch} />
      </motion.div>

      {/* KPI Cards */}
      <motion.div variants={staggerItem} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard
          title="Budget-udnyttelse"
          value={`${budgetUtilization.toFixed(1).replace('.', ',')}%`}
          subtitle={`${BUDGET_SUMMARY.currentMonthName} ${BUDGET_SUMMARY.year}`}
          trend={BUDGET_SUMMARY.growthVsLastYear}
          trendLabel={`${BUDGET_SUMMARY.growthVsLastYear > 0 ? '+' : ''}${BUDGET_SUMMARY.growthVsLastYear}% vs. sidste år`}
          icon={TrendingUp}
          status="green"
          index={0}
        />
        <KPICard
          title="Forecast-afvigelse"
          value={`${BUDGET_SUMMARY.totalDeviation > 0 ? '+' : ''}${BUDGET_SUMMARY.totalDeviation.toFixed(1).replace('.', ',')} mio. kr.`}
          subtitle={`Helår ${BUDGET_SUMMARY.year}`}
          trend={BUDGET_SUMMARY.totalDeviationPct}
          trendLabel="Over budget"
          icon={AlertTriangle}
          status="yellow"
          index={1}
        />
        <KPICard
          title="Befolkningsafvigelse"
          value="+340 (+80 år)"
          subtitle="Flere end forventet"
          trend={7.9}
          trendLabel="Stærkt stigende"
          icon={Users}
          status="red"
          index={2}
        />
        <KPICard
          title="Aktive lovforslag"
          value="7 relevante"
          subtitle="Folketingssamlingen 2024-25"
          trend={0}
          trendLabel="3 nye denne måned"
          icon={Scale}
          status="green"
          index={3}
        />
      </motion.div>

      {/* Alert Banner */}
      <motion.div variants={staggerItem} className="mb-10">
        <h2 className="overline mb-3">
          Aktive advarsler
        </h2>
        <AlertBanner alerts={DASHBOARD_ALERTS} />
      </motion.div>

      {/* Recent Insights */}
      <motion.div variants={staggerItem}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="overline">
            Seneste Indsigter
          </h2>
          <button
            onClick={() => navigate('/spoergsmaal')}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Se alle
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RECENT_INSIGHTS.map((insight, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.08 }}
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
              onClick={() => handleSearch(insight.title)}
              className="card-interactive rounded-xl p-5 cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors">
                  {insight.title}
                </h3>
                <span
                  className="shrink-0 px-2 py-0.5 text-[10px] font-medium rounded-full"
                  style={getCategoryBadgeStyle(insight.category)}
                >
                  {insight.category}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                {insight.summary}
              </p>
              <p className="caption">
                {insight.timestamp}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default DashboardPage
