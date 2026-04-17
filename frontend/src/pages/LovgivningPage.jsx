import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Scale, ExternalLink, Clock, CheckCircle2, Search } from 'lucide-react'
import { COLORS } from '../utils/constants'

const LOVFORSLAG = [
  {
    id: 'L134',
    titel: 'Forslag til lov om ændring af lov om social service (Ny ældrereform)',
    resume: 'Lovforslaget indeholder en grundlæggende reform af ældreområdet med fokus på frit valg, helhedsplaner og kvalitetsstandarder. Kommunerne forpligtes til at udarbejde individuelle helhedsplaner for alle borgere over 75 år.',
    status: 'Vedtaget',
    statusColor: '#22c55e',
    type: 'Lovforslag',
    dato: '2024-06-15',
    budgetEffekt: '+35-45 mio. kr./år',
    effektType: 'danger',
    fagomraade: 'Ældre & Sundhed',
    dut: 'DUT-kompensation: 60-70% af merudgifter',
    url: 'https://www.ft.dk/samling/20231/lovforslag/L134/index.htm',
  },
  {
    id: 'L142',
    titel: 'Forslag til lov om minimumsnormeringer i daginstitutioner',
    resume: 'Lovforslaget fastsætter bindende minimumsnormeringer i alle kommunale og private daginstitutioner.',
    status: 'Under behandling',
    statusColor: '#eab308',
    type: 'Lovforslag',
    dato: '2024-10-01',
    budgetEffekt: '+15-25 mio. kr./år',
    effektType: 'warning',
    fagomraade: 'Dagtilbud',
    dut: 'DUT-forhandling igangsat',
    url: 'https://www.ft.dk/samling/20241/lovforslag/L142/index.htm',
  },
  {
    id: 'L155',
    titel: 'Forslag til lov om specialundervisningsgaranti',
    resume: 'Nye visitationskrav og dokumentationspligt for specialundervisning. Kommunerne skal sikre at alle visiterede elever modtager tilbud inden for 4 uger.',
    status: 'Under behandling',
    statusColor: '#eab308',
    type: 'Lovforslag',
    dato: '2024-09-15',
    budgetEffekt: '+10-18 mio. kr./år',
    effektType: 'warning',
    fagomraade: 'Folkeskole',
    dut: 'KL estimerer delvis DUT',
    url: 'https://www.ft.dk/samling/20241/lovforslag/L155/index.htm',
  },
  {
    id: 'L67',
    titel: 'Forslag til lov om klimatilpasning i kommunerne',
    resume: 'Kommunerne pålægges at udarbejde klimatilpasningsplaner med bindende mål for regnvandshåndtering og kystbeskyttelse.',
    status: 'Fremsat',
    statusColor: '#6366f1',
    type: 'Lovforslag',
    dato: '2024-10-10',
    budgetEffekt: '+20-35 mio. kr./år',
    effektType: 'danger',
    fagomraade: 'Teknik & Miljø',
    dut: 'Ingen DUT forventet (anlæg)',
    url: 'https://www.ft.dk/samling/20241/lovforslag/L67/index.htm',
  },
  {
    id: 'L87',
    titel: 'Forslag til lov om ændring af beskæftigelsesindsatsen',
    resume: 'Forenkling af beskæftigelsesindsatsen med færre proceskrav og øget kommunal frihed.',
    status: 'Under behandling',
    statusColor: '#eab308',
    type: 'Lovforslag',
    dato: '2024-09-20',
    budgetEffekt: '-5-10 mio. kr./år',
    effektType: 'success',
    fagomraade: 'Beskæftigelse',
    dut: 'Forventes budgetneutralt',
    url: 'https://www.ft.dk/samling/20231/lovforslag/L87/index.htm',
  },
  {
    id: 'L98',
    titel: 'Forslag til lov om barnets lov (følgelovgivning)',
    resume: 'Følgeregulering til barnets lov med skærpede krav til forebyggende indsatser og underretningspligt.',
    status: 'Vedtaget',
    statusColor: '#22c55e',
    type: 'Lovforslag',
    dato: '2024-04-10',
    budgetEffekt: '+8-12 mio. kr./år',
    effektType: 'warning',
    fagomraade: 'Social & Handicap',
    dut: 'DUT-kompensation modtaget',
    url: 'https://www.ft.dk/samling/20231/lovforslag/L98/index.htm',
  },
  {
    id: 'L178',
    titel: 'Forslag til lov om sundhedsklynger og nært sundhedsvæsen',
    resume: 'Lovforslaget etablerer formelle sundhedsklynger mellem kommuner og regioner med fokus på sammenhængende patientforløb, fælles data og shared care-modeller. Kommunerne får medfinansieringsansvar for forebyggende indsatser.',
    status: 'Under behandling',
    statusColor: '#eab308',
    type: 'Lovforslag',
    dato: '2025-01-15',
    budgetEffekt: '+12-18 mio. kr./år',
    effektType: 'warning',
    fagomraade: 'Ældre & Sundhed',
    dut: 'DUT-forhandling påbegyndt',
    url: 'https://www.ft.dk/samling/20241/lovforslag/L178/index.htm',
  },
  {
    id: 'L192',
    titel: 'Forslag til lov om kommunal grøn omstilling og energiplanlægning',
    resume: 'Kommunerne pålægges at udarbejde bindende klimahandleplaner med årlige CO2-reduktionsmål. Krav om energirenovering af kommunale bygninger og grøn indkøbspolitik inden 2030.',
    status: 'Fremsat',
    statusColor: '#6366f1',
    type: 'Lovforslag',
    dato: '2025-02-05',
    budgetEffekt: '+15-30 mio. kr./år',
    effektType: 'danger',
    fagomraade: 'Teknik & Miljø',
    dut: 'Ingen DUT forventet (anlæg + drift)',
    url: 'https://www.ft.dk/samling/20241/lovforslag/L192/index.htm',
  },
  {
    id: 'L205',
    titel: 'Forslag til lov om digital borgerservice og automatiseret sagsbehandling',
    resume: 'Lovforslaget etablerer rammer for automatiseret sagsbehandling i kommunerne med krav om transparens, forklarbarhed og klagemulighed. Nye krav til digital tilgængelighed for borgere.',
    status: 'Under behandling',
    statusColor: '#eab308',
    type: 'Lovforslag',
    dato: '2025-03-01',
    budgetEffekt: '-3-8 mio. kr./år',
    effektType: 'success',
    fagomraade: 'Administration',
    dut: 'Forventes delvist DUT-kompenseret',
    url: 'https://www.ft.dk/samling/20241/lovforslag/L205/index.htm',
  },
  {
    id: 'L210',
    titel: 'Forslag til lov om forebyggende børneindsats og tidlig opsporing',
    resume: 'Nye krav til systematisk tidlig opsporing af udsatte børn og familier. Kommunerne skal etablere tværfaglige teams og anvende standardiserede screeningsredskaber i dagtilbud og skoler.',
    status: 'Fremsat',
    statusColor: '#6366f1',
    type: 'Lovforslag',
    dato: '2025-03-15',
    budgetEffekt: '+5-10 mio. kr./år',
    effektType: 'warning',
    fagomraade: 'Social & Handicap',
    dut: 'KL forhandler DUT-kompensation',
    url: 'https://www.ft.dk/samling/20241/lovforslag/L210/index.htm',
  },
]

const FILTER_OPTIONS = ['Alle', 'Under behandling', 'Vedtaget', 'Fremsat']

const glassCard = {
  background: '#111118',
  border: '1px solid rgba(255,255,255,0.06)',
}

function LovgivningPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Alle')
  const [expandedId, setExpandedId] = useState(null)

  const filtered = LOVFORSLAG.filter((l) => {
    const matchSearch = !search || l.titel.toLowerCase().includes(search.toLowerCase()) ||
      l.fagomraade.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'Alle' || l.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalMinEffect = LOVFORSLAG.reduce((sum, l) => {
    const match = l.budgetEffekt.match(/[+-]?(\d+)/)
    if (!match) return sum
    return sum + (l.budgetEffekt.startsWith('-') ? -parseInt(match[1]) : parseInt(match[1]))
  }, 0)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="pt-4 mb-6"
      >
        <div className="flex items-center gap-3 mb-1">
          <Scale className="w-6 h-6 text-violet-400" />
          <h1 className="text-2xl font-bold text-white">Lovgivning & Regulering</h1>
        </div>
        <p className="text-sm text-slate-400">
          Aktive lovforslag med potentiel budgetpåvirkning for Kalundborg Kommune
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {[
          { label: 'Aktive lovforslag', value: LOVFORSLAG.length, color: COLORS.primary },
          { label: 'Under behandling', value: LOVFORSLAG.filter(l => l.status === 'Under behandling').length, color: COLORS.warning },
          { label: 'Vedtaget', value: LOVFORSLAG.filter(l => l.status === 'Vedtaget').length, color: COLORS.success },
          { label: 'Est. samlet påvirkning', value: `${totalMinEffect > 0 ? '+' : ''}${totalMinEffect} mio. kr.`, color: COLORS.danger },
        ].map((kpi, i) => (
          <div key={i} className="rounded-xl p-4" style={glassCard}>
            <p className="overline mb-1">{kpi.label}</p>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="flex flex-col sm:flex-row gap-3 mb-6"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Søg i lovforslag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10
                       outline-none focus:border-indigo-500/40 transition-colors placeholder-slate-600"
          />
        </div>
        <div className="flex gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                statusFilter === opt
                  ? 'text-white bg-indigo-500/20 border border-indigo-500/30'
                  : 'chip-interactive text-slate-400'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="space-y-4">
        <AnimatePresence>
          {filtered.map((lov, i) => (
            <motion.div
              key={lov.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="rounded-xl overflow-hidden cursor-pointer group card-interactive"
              style={glassCard}
              onClick={() => setExpandedId(expandedId === lov.id ? null : lov.id)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-bold text-indigo-400">{lov.id}</span>
                      <span
                        className="px-2 py-0.5 text-[10px] font-semibold rounded-full"
                        style={{ background: `${lov.statusColor}20`, color: lov.statusColor }}
                      >
                        {lov.status}
                      </span>
                      <span className="caption">{lov.fagomraade}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors leading-snug">
                      {lov.titel}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${
                      lov.effektType === 'danger' ? 'text-red-400' :
                      lov.effektType === 'success' ? 'text-green-400' : 'text-amber-400'
                    }`}>
                      {lov.budgetEffekt}
                    </p>
                    <p className="caption">Estimeret effekt</p>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedId === lov.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                        <p className="text-xs text-slate-400 leading-relaxed mb-3">{lov.resume}</p>
                        <div className="flex flex-wrap gap-3 caption">
                          <span className="flex items-center gap-1 text-slate-500">
                            <Clock className="w-3 h-3" /> {lov.dato}
                          </span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <CheckCircle2 className="w-3 h-3" /> {lov.dut}
                          </span>
                          <a
                            href={lov.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                          >
                            <ExternalLink className="w-3 h-3" /> Se på ft.dk
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Scale className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Ingen lovforslag matcher din søgning</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default LovgivningPage
