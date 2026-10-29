'use client';
import type { AnalysisTrace } from '@/domain/trace';
import { MOBILITY_QUESTION } from '@/domain/mobility-question';
import { canUseDetailedData } from '@/domain/policy';
import { AnalysisFlow } from './analysis-flow';
import { MobilityExplorer } from './mobility-explorer';
import { MobilityPanel } from './mobility-panel';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  MessageSquare,
  Bookmark,
  SlidersHorizontal,
  Settings2,
  Clock3,
  ChevronDown,
  ChevronRight,
  Database,
  Check,
  LoaderCircle,
  Square,
  RotateCcw,
  Download,
  LogOut,
  Search,
  Info,
  BookOpen,
  ShieldCheck,
} from './icon';
import type {
  AccessContext,
  Analysis,
  AnalysisContext,
  Area,
  ChartSpec,
  Conversation,
  DemoDocument,
  PublicEntity,
  InsightSuggestion,
  ProviderPublic,
  SavedInsight,
  SavedScenario,
  ScenarioAssumptions,
  SourceRef,
} from '@/domain/types';
import { metricValue, money } from '@/domain/format';
import { preparedScenarios, demonstrationQuestions, suggestions } from '@/domain/questions';
import { Brand, Mark } from './brand';
import {
  filtersForAnalysis,
  selectedEntityIds,
  MULTI_SELECTION,
  snapshotInitialFilters,
} from './workspace-state';
import { Dashboard } from './dashboard';
import { useDashboard } from './use-dashboard';
import { Dialog } from './dialog';
import { AnalysisChart } from './chart';
import { ScenarioEditor } from './scenario';
import { StreamingAnswer } from './analysis-motion';
import { AnswerText as EvidenceText } from './answer-text';
import { AnalysisBasis } from './analysis-basis';
import { AnalysisBasisEditor } from './analysis-basis-editor';
import { displayText } from './display-text';
import { sourceLabel } from './source-label';
import { DataStatusBadge } from './data-status-badge';
import {
  createAnalysisAttempt,
  cancelAnalysisAttempt,
  type AnalysisAttempt,
} from './analysis-request';
import { Settings, api, providerNames } from './settings';
import './workspace-dashboard.css';
interface WorkspaceData {
  user: AccessContext;
  entities: PublicEntity[];
  suggestions: InsightSuggestion[];
  conversations: Conversation[];
  insights: SavedInsight[];
  scenarios: SavedScenario[];
  providers: ProviderPublic[];
  dataset: {
    version: string;
    referenceDate: string;
    rowCount: number;
    documentCount: number;
    coverage?: { fromYear: number; toYear: number };
  };
  setup?: { authMode?: 'demo' | 'entra' };
}
interface AnalysisRequest {
  question: string;
  conversationId?: string;
  datasetVersion?: string;
  context: AnalysisContext;
  scenario?: ScenarioAssumptions;
}
const areaNames: Record<Area, string> = {
  schools: 'Skoleområdet',
  facilities: 'Kultur & fritid',
  social: 'Social & beskæftigelse',
  health: 'Ældre & sundhed',
  environment: 'Teknik & miljø',
  administration: 'Administration',
  preparedness: 'Beredskab',
};
const roleNames: Record<string, string> = {
  'KAIA.Admin': 'Administrator',
  'KAIA.Executive': 'Direktion',
  'KAIA.Finance': 'Økonomikonsulent',
  'KAIA.DepartmentHead': 'Fagchef',
  'KAIA.Council': 'Kommunalbestyrelsesmedlem',
};
const scenarioPrompts = preparedScenarios;
const examples = demonstrationQuestions;
export function Workspace() {
  const [data, setData] = useState<WorkspaceData>();
  const [error, setError] = useState('');
  const [view, setView] = useState<'chat' | 'history' | 'insights' | 'scenarios'>('chat');
  const [modal, setModal] = useState<'settings' | 'scenario' | 'examples' | 'access' | null>(null);
  const [scenarioBasis, setScenarioBasis] = useState<Analysis>();
  const [savingScenario, setSavingScenario] = useState<Analysis>();
  const [scenarioTitle, setScenarioTitle] = useState('');
  const [source, setSource] = useState<SourceRef>();
  const [document, setDocument] = useState<DemoDocument>();
  const [expanded, setExpanded] = useState<ChartSpec>();
  const [expandedVersion, setExpandedVersion] = useState<string>();
  const [expandedAnalysis, setExpandedAnalysis] = useState<Analysis>();
  const [explanation, setExplanation] = useState<Analysis>();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState('');
  const [stage, setStage] = useState('');
  const [reviewAnalysisId, setReviewAnalysisId] = useState<string>();
  const [liveTrace, setLiveTrace] = useState<AnalysisTrace>();
  const [pendingKind, setPendingKind] = useState<'analysis' | 'simulation'>('analysis');
  const [liveText, setLiveText] = useState('');
  const [toast, setToast] = useState('');
  const [reduced, setReduced] = useState(false);
  const [year, setYear] = useState(2026);
  const [toMonth, setToMonth] = useState(9);
  const [area, setArea] = useState<Area>('schools');
  const [unit, setUnit] = useState('');
  const [retry, setRetry] = useState<AnalysisRequest>();
  const [resumeInput, setResumeInput] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const activeAttempt = useRef<AnalysisAttempt | null>(null);
  const sourceRequest = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const latestAnswer = useRef<HTMLElement>(null);
  const pendingRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const last = analyses.at(-1);
  const provider = data?.providers.find((p) => p.active);
  const activeArea = data?.user.areas.includes(area) ? area : (data?.user.areas[0] ?? 'schools');
  const landing = view === 'chat' && !analyses.length && !pending;
  const dashboardContext = {
    area: activeArea,
    period: { year, fromMonth: 1, toMonth },
    entityIds: selectedEntityIds(unit, last),
  };
  const dashboard = useDashboard({
    enabled: !!data && landing,
    context: dashboardContext,
    version: data?.dataset.version,
    access: data?.user,
  });
  function applyAnalysisContext(a: Analysis, entities = data?.entities ?? []) {
    const values = filtersForAnalysis(a, entities);
    setYear(values.year);
    setToMonth(values.toMonth);
    setArea(values.area);
    setUnit(values.unit);
  }
  function stopCurrent() {
    if (activeAttempt.current) void cancelAnalysisAttempt(activeAttempt.current);
    controller.current?.abort();
    controller.current = null;
    activeAttempt.current = null;
    setBusy(false);
    setPending('');
    setLiveText('');
    setRetry(undefined);
    setResumeInput(false);
    setExplanation(undefined);
    setExpanded(undefined);
  }
  function stopReply() {
    if (activeAttempt.current) {
      void cancelAnalysisAttempt(activeAttempt.current);
      setStage('Stopper svaret');
      activeAttempt.current.controller.abort();
    }
  }
  function restoreSnapshot(a: Analysis) {
    stopCurrent();
    setAnalyses([a]);
    setConversationId(a.conversationId);
    applyAnalysisContext(a);
    setView('chat');
    if (a.conversationId) localStorage.setItem('kaia.conversation', a.conversationId);
    else localStorage.removeItem('kaia.conversation');
  }
  async function refresh() {
    try {
      const workspace = await api<WorkspaceData>('/api/workspace');
      setData(workspace);
      setError('');
      return workspace;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Arbejdsfladen kunne ikke hentes.');
    }
  }
  useEffect(() => {
    void refresh().then(async (workspace) => {
      if (!workspace) return;
      const initial = snapshotInitialFilters(workspace.dataset.referenceDate);
      setYear(initial.year);
      setToMonth(initial.toMonth);
      setArea(workspace.user.areas.includes('schools') ? 'schools' : workspace.user.areas[0]);
      const remembered = localStorage.getItem('kaia.conversation');
      if (remembered && workspace.conversations.some((c) => c.id === remembered)) {
        try {
          const result = await api<Conversation | { conversation: Conversation }>(
            `/api/conversations/${remembered}`,
          );
          const c = 'conversation' in result ? result.conversation : result;
          setConversationId(c.id);
          setAnalyses(c.analyses);
          const previous = c.analyses.at(-1);
          if (previous) applyAnalysisContext(previous, workspace.entities);
        } catch {
          localStorage.removeItem('kaia.conversation');
        }
      }
    });
    setReduced(localStorage.getItem('kaia.reduceMotion') === 'true');
    return () => {
      if (activeAttempt.current) void cancelAnalysisAttempt(activeAttempt.current);
      const requestController = controller.current;
      activeAttempt.current = null;
      controller.current = null;
      requestController?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Initial session hydration runs once; the returned workspace supplies its own entities.
  }, []);
  useEffect(() => {
    if (analyses.length)
      latestAnswer.current?.scrollIntoView({
        behavior:
          reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        block: 'start',
      });
  }, [analyses.length, reduced]);
  useEffect(() => {
    if (pending)
      pendingRef.current?.scrollIntoView({
        behavior:
          reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        block: 'start',
      });
  }, [pending, reduced]);
  useEffect(() => {
    if (error)
      errorRef.current?.scrollIntoView({
        behavior:
          reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        block: 'center',
      });
  }, [error, reduced]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function setMotion(value: boolean) {
    setReduced(value);
    localStorage.setItem('kaia.reduceMotion', String(value));
  }
  function newConversation() {
    stopCurrent();
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (data) {
      const initial = snapshotInitialFilters(data.dataset.referenceDate);
      setYear(initial.year);
      setToMonth(initial.toMonth);
    }
    setUnit('');
    setAnalyses([]);
    setConversationId(undefined);
    setView('chat');
    setInput('');
    setPending('');
    setError('');
    setLiveText('');
    localStorage.removeItem('kaia.conversation');
    composer.current?.focus();
  }
  async function openConversation(id: string) {
    stopCurrent();
    try {
      const result = await api<Conversation | { conversation: Conversation }>(
        `/api/conversations/${id}`,
      );
      const c = 'conversation' in result ? result.conversation : result;
      setConversationId(c.id);
      setAnalyses(c.analyses);
      setView('chat');
      localStorage.setItem('kaia.conversation', c.id);
      const a = c.analyses.at(-1);
      if (a) applyAnalysisContext(a);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Samtalen kunne ikke åbnes.');
    }
  }
  async function send(
    question: string,
    scenario?: ScenarioAssumptions,
    overrides?: Partial<AnalysisContext>,
    replay?: AnalysisRequest,
  ) {
    if (!question.trim() || busy || activeAttempt.current) return;
    setResumeInput(false);
    setView('chat');
    setModal(null);
    setExplanation(undefined);
    setBusy(true);
    setPending(question);
    setLiveTrace(undefined);
    setPendingKind(
      scenario || /scenari|hvad.*hvis|simul/i.test(question) ? 'simulation' : 'analysis',
    );
    setStage(provider && provider.id !== 'demo' ? 'Fortolker spørgsmålet' : 'Henter budgettal');
    setError('');
    setInput('');
    setLiveText('');
    const attempt = createAnalysisAttempt();
    const requestController = attempt.controller;
    activeAttempt.current = attempt;
    controller.current = requestController;
    let received = false;
    const context: AnalysisContext = {
      period: { year, fromMonth: 1, toMonth },
      area: activeArea,
      entityIds:
        last?.context.area === activeArea
          ? selectedEntityIds(unit, last)
          : unit && unit !== MULTI_SELECTION
            ? [unit]
            : [],
      ...overrides,
      ...(scenario ? { scenario } : {}),
    };
    const payload: AnalysisRequest = replay ?? {
      question,
      conversationId,
      datasetVersion: last?.datasetVersion ?? data?.dataset.version,
      context,
      ...(scenario ? { scenario } : {}),
    };
    setRetry(payload);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId: attempt.requestId }),
        signal: requestController.signal,
      });
      if (!response.ok) {
        const problem = await response.json();
        throw new Error(problem.error ?? 'Analysen kunne ikke gennemføres.');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Forbindelsen returnerede intet svar.');
      const decoder = new TextDecoder();
      let buffer = '';
      function event(line: string) {
        if (
          controller.current !== requestController ||
          requestController.signal.aborted ||
          attempt.cancellation
        )
          return;
        const raw = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
        if (!raw || raw === '[DONE]') return;
        const item = JSON.parse(raw) as {
          type: string;
          trace?: AnalysisTrace;
          text?: string;
          analysis?: Analysis;
          conversationId?: string;
          error?: string;
          message?: string;
        };
        if (item.type === 'trace' && item.trace) setLiveTrace(item.trace);
        if (item.type === 'status') setStage(item.text ?? 'Sammenholder kilder');
        if (item.type === 'text') setLiveText((t) => t + (item.text ?? ''));
        if (item.type === 'error')
          throw new Error(
            item.error ?? item.message ?? item.text ?? 'Svaret blev afbrudt. Prøv igen.',
          );
        if (item.type === 'analysis' && item.analysis) {
          received = true;
          setRetry(undefined);
          setLiveText('');
          const a = item.analysis;
          setReviewAnalysisId(a.analysisId);
          setAnalyses((current) => [...current, a]);
          setPending('');
          applyAnalysisContext(a);
          if (item.conversationId) {
            setConversationId(item.conversationId);
            localStorage.setItem('kaia.conversation', item.conversationId);
          }
        }
      }
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) event(line);
      }
      if (buffer.trim()) event(buffer);
      requestController.signal.throwIfAborted();
      if (!received) throw new Error('Analysen blev ikke færdig. Prøv igen.');
      void refresh();
    } catch (e) {
      if (controller.current !== requestController) return;
      if (requestController.signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
        setLiveText('');
        const confirmation = attempt.cancellation ? await attempt.cancellation : undefined;
        if (controller.current !== requestController) return;
        if (received || confirmation?.status === 'completed') {
          setInput('');
          setResumeInput(false);
          setRetry(undefined);
        } else {
          setInput(question);
          setResumeInput(true);
        }
        setToast(
          received || confirmation?.status === 'completed'
            ? 'Beregningen var allerede færdig og er gemt i samtalehistorikken.'
            : confirmation?.status === 'cancelled'
              ? 'Svaret er stoppet. Du kan stille spørgsmålet igen.'
              : 'Visningen er stoppet. Serverens stop kunne ikke bekræftes; svaret kan være gemt.',
        );
        if (confirmation?.status === 'completed') void refresh();
      } else
        setError(
          e instanceof TypeError
            ? 'Forbindelsen til K.A.I.A. blev afbrudt. Prøv igen.'
            : e instanceof SyntaxError
              ? 'Svaret kunne ikke læses. Prøv igen.'
              : e instanceof Error
                ? e.message
                : 'Der opstod en fejl. Prøv igen.',
        );
    } finally {
      if (controller.current === requestController) {
        if (activeAttempt.current === attempt) activeAttempt.current = null;
        controller.current = null;
        setBusy(false);
        setPending('');
        setStage('');
      }
    }
  }
  function submitInput() {
    if (resumeInput && retry?.question === input)
      void send(retry.question, retry.scenario, retry.context, retry);
    else void send(input);
  }
  async function openSource(s: SourceRef) {
    const requestId = ++sourceRequest.current;
    setSource(s);
    setDocument(undefined);
    if (s.documentId)
      try {
        const result = await api<DemoDocument | { document: DemoDocument }>(
          `/api/documents/${s.documentId}?version=${encodeURIComponent(s.datasetVersion)}`,
        );
        if (sourceRequest.current === requestId)
          setDocument('document' in result ? result.document : result);
      } catch (e) {
        if (sourceRequest.current === requestId)
          setToast(e instanceof Error ? e.message : 'Kilden kunne ikke hentes.');
      }
  }
  async function saveInsight(a: Analysis) {
    try {
      await api('/api/insights', { analysisId: a.analysisId, title: a.title });
      setToast('Indsigten er gemt med dataversion, kilder og figur.');
      void refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Indsigten kunne ikke gemmes.');
    }
  }
  function nameScenario(a: Analysis) {
    setSavingScenario(a);
    setScenarioTitle(a.title + ' · ' + new Date().toLocaleDateString('da-DK'));
  }
  async function saveScenario(a: Analysis) {
    const title = scenarioTitle.trim();
    if (!title) return;
    try {
      await api('/api/scenarios', { analysisId: a.analysisId, title });
      setSavingScenario(undefined);
      setToast('Scenariet og dets forudsætninger er gemt.');
      void refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Scenariet kunne ikke gemmes.');
    }
  }
  if (!data)
    return (
      <main id="main-content" className="workspace-loading">
        <Brand />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="primary" onClick={() => void refresh()}>
              Prøv igen
            </button>
            <Link href="/">Til login</Link>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>Åbner din arbejdsflade …</p>
          </>
        )}
      </main>
    );
  const canSelectUnit = data.user.roles.some((role) => role !== 'KAIA.Council');
  const units = data.entities.filter((e) => e.area === activeArea && e.type !== 'committee');
  return (
    <div className={`workspace layout-fremblik ${reduced ? 'reduced-motion' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <button
          className="new-conversation"
          onClick={newConversation}
          aria-label="Ny samtale"
          title="Ny samtale"
        >
          <Plus size={18} />
          <span>Ny samtale</span>
          <ArrowUpRight size={14} className="new-conversation-arrow" />
        </button>
        <nav aria-label="Hovednavigation">
          <button
            className={view === 'chat' ? 'selected' : ''}
            onClick={newConversation}
            aria-label="Mit overblik"
            title="Mit overblik"
          >
            <MessageSquare size={18} />
            <span>Mit overblik</span>
          </button>
          <button
            className={view === 'insights' ? 'selected' : ''}
            onClick={() => setView('insights')}
            title="Gemte indsigter"
            aria-label="Gemte indsigter"
          >
            <Bookmark size={18} />
            <span>Gemte indsigter</span>
            <small>{data.insights.length || ''}</small>
          </button>
          <button
            className={view === 'scenarios' ? 'selected' : ''}
            onClick={() => setView('scenarios')}
            title="Scenarier"
            aria-label="Scenarier"
          >
            <SlidersHorizontal size={18} />
            <span>Scenarier</span>
          </button>
          <button
            className={view === 'history' ? 'selected' : ''}
            onClick={() => setView('history')}
            title="Samtaler"
            aria-label="Samtaler"
          >
            <Clock3 size={18} />
            <span>Samtaler</span>
          </button>
        </nav>
        <div className="recent-conversations">
          <span className="nav-label">DINE SAMTALER</span>
          {data.conversations.length ? (
            data.conversations.slice(0, 5).map((c) => (
              <button
                key={c.id}
                onClick={() => void openConversation(c.id)}
                className={conversationId === c.id ? 'current' : ''}
              >
                {c.title}
              </button>
            ))
          ) : (
            <p>
              Dine samtaler vises her,
              <br />
              når du stiller et spørgsmål.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setModal('examples')} title="Spørgsmål du kan prøve">
            <BookOpen size={17} />
            <span>Spørgsmål du kan prøve</span>
            <ArrowUpRight size={13} />
          </button>
          <button
            onClick={() => setModal('settings')}
            title="Indstillinger"
            aria-label="Indstillinger"
          >
            <Settings2 size={17} />
            <span>Indstillinger</span>
          </button>
          {data.user.roles.includes('KAIA.Admin') && (
            <button onClick={() => setModal('access')} title="Adgangsopsætning">
              <ShieldCheck size={17} />
              <span>Adgangsopsætning</span>
            </button>
          )}
          <div className="profile">
            <span className="avatar">
              {data.user.displayName === 'Anne Dandanell'
                ? 'AD'
                : data.user.displayName.includes('Parthee')
                  ? 'PV'
                  : 'FM'}
            </span>
            <div>
              <strong>
                {data.user.displayName === 'Partheepan Vijayamohan'
                  ? 'Parthee'
                  : data.user.displayName}
              </strong>
              <small>{data.user.title}</small>
            </div>
            <form action="/auth/logout" method="post">
              <button aria-label="Log ud" title="Log ud">
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Kalundborg</span>
            <ChevronRight size={12} />
            <strong>
              {view === 'chat'
                ? analyses.length
                  ? 'Din samtale'
                  : 'Mit overblik'
                : view === 'history'
                  ? 'Samtalehistorik'
                  : view === 'insights'
                    ? 'Gemte indsigter'
                    : 'Scenarier'}
            </strong>
          </div>
          <div className="topbar-status">
            {data.setup?.authMode === 'demo' && <span className="badge">Demologin</span>}
            <span className="provider-status">
              <span className={provider?.id === 'demo' ? 'status-dot demo' : 'status-dot'} />
              {provider?.id === 'demo' ? 'Demo' : provider ? providerNames[provider.id] : 'Demo'}
              {provider?.id !== 'demo' && provider?.model && <small> · {provider.model}</small>}
            </span>
          </div>
        </header>
        <main
          id="main-content"
          className={`main-content ${analyses.length && view === 'chat' ? 'has-analysis' : ''} ${landing ? 'dashboard-home' : ''}`}
        >
          {view === 'chat' ? (
            <>
              {landing && (
                <section className="dashboard-welcome">
                  <div>
                    <span className="eyebrow">FRA OVERBLIK TIL FREMBLIK</span>
                    <h1>
                      Goddag,{' '}
                      {data.user.displayName.includes('Parthee')
                        ? 'Parthee'
                        : data.user.displayName === 'Anne Dandanell'
                          ? 'Anne'
                          : data.user.displayName}
                      <span>.</span>
                    </h1>
                    <p>Undersøg udviklingen. Afprøv mulighederne.</p>
                  </div>
                  <div className="dashboard-identity">
                    <span>Aktiv rolle</span>
                    <strong>{roleNames[data.user.roles[0]] ?? 'Tildelt adgang'}</strong>
                    <small>{data.user.title}</small>
                    <span className="identity-area">
                      {areaNames[activeArea]} · {units.length}{' '}
                      {activeArea === 'schools' ? 'skoler' : 'enheder'}
                    </span>
                  </div>
                </section>
              )}
              <div className="analysis-scope">
                <span>
                  <span className="scope-dot" />
                  {roleNames[data.user.roles[0]] ?? 'Tildelt adgang'}
                </span>
                <span className="scope-divider" />
                <label className="select-wrap">
                  <span className="sr-only">Fagområde</span>
                  <select
                    aria-label="Fagområde"
                    value={activeArea}
                    disabled={busy}
                    onChange={(e) => {
                      setResumeInput(false);
                      setArea(e.target.value as Area);
                      setUnit('');
                    }}
                  >
                    {data.user.areas.map((a) => (
                      <option key={a} value={a}>
                        {areaNames[a]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </label>
                <label className="select-wrap">
                  <span className="sr-only">År</span>
                  <select
                    aria-label="År"
                    value={year}
                    disabled={busy}
                    onChange={(e) => {
                      setResumeInput(false);
                      setYear(Number(e.target.value));
                    }}
                  >
                    {Array.from(
                      {
                        length:
                          (data.dataset.coverage?.toYear || 2028) -
                          (data.dataset.coverage?.fromYear || 2023) +
                          1,
                      },
                      (_, index) => (data.dataset.coverage?.fromYear || 2023) + index,
                    ).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </label>
                <label className="select-wrap month-filter">
                  <span className="sr-only">Til og med måned</span>
                  <select
                    aria-label="Til og med måned"
                    value={toMonth}
                    disabled={busy}
                    onChange={(e) => {
                      setResumeInput(false);
                      setToMonth(Number(e.target.value));
                    }}
                  >
                    {[
                      'januar',
                      'februar',
                      'marts',
                      'april',
                      'maj',
                      'juni',
                      'juli',
                      'august',
                      'september',
                      'oktober',
                      'november',
                      'december',
                    ].map((m, i) => (
                      <option key={m} value={i + 1}>
                        Til og med {m}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </label>
                <label className="select-wrap unit-filter">
                  <span className="sr-only">Institution</span>
                  <select
                    aria-label="Institution"
                    value={unit}
                    disabled={busy || !canSelectUnit}
                    onChange={(e) => {
                      setResumeInput(false);
                      setUnit(e.target.value);
                    }}
                  >
                    <option value="">
                      {canSelectUnit ? 'Alle tilladte enheder' : 'Samlet udvalgsscope'}
                    </option>
                    {unit === MULTI_SELECTION && (
                      <option value={MULTI_SELECTION}>
                        {last?.context.entityIds.length} valgte enheder
                      </option>
                    )}
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} />
                </label>
                {analyses.length > 0 && (
                  <button
                    className="text-button scope-apply"
                    disabled={busy}
                    onClick={() =>
                      void send('Vis samme analyse med den valgte afgrænsning', undefined, {
                        entityIds: selectedEntityIds(unit, last),
                      })
                    }
                  >
                    Anvend
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
              {!landing && (
                <div className="conversation-heading">
                  <h1 className="sr-only">Samtale med K.A.I.A.</h1>
                  <div className="section-kicker">
                    <Mark size={20} /> DIN SAMTALE
                  </div>
                  <p>
                    {areaNames[activeArea]} · {last?.datasetVersion ?? data.dataset.version}
                  </p>
                </div>
              )}
              {!analyses.length && !pending && (
                <Composer
                  input={input}
                  setInput={setInput}
                  busy={busy}
                  send={submitInput}
                  stop={stopReply}
                  refInput={composer}
                  welcome
                />
              )}
              {landing && (
                <>
                  <section className="dashboard-suggestions" aria-label="Fire indsigtsforslag">
                    {(
                      dashboard.data?.suggestions ??
                      suggestions({ ...data.user, areas: [activeArea] })
                    )
                      .slice(0, 4)
                      .map((suggestion) => (
                        <button
                          key={suggestion.title}
                          disabled={busy}
                          onClick={() => void send(suggestion.question)}
                        >
                          <span>
                            <strong>{displayText(suggestion.title)}</strong>
                            <small>{displayText(suggestion.description)}</small>
                          </span>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                  </section>
                  {activeArea === 'schools' &&
                    canUseDetailedData(data.user) &&
                    units.length > 0 && (
                      <section className="kaia-demo-entry" aria-label="Samlet demoforløb">
                        <div>
                          <strong>Fra flyttemønstre til skolekapacitet</strong>
                          <small>Følg seks trin fra spørgsmål til et godkendt planudkast.</small>
                        </div>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void send(MOBILITY_QUESTION, undefined, {
                              period: {
                                year: Number(data.dataset.referenceDate.slice(0, 4)),
                                fromMonth: 1,
                                toMonth: 12,
                              },
                            })
                          }
                        >
                          Prøv demoforløbet <ArrowRight size={14} />
                        </button>
                      </section>
                    )}
                  <Dashboard
                    data={dashboard.data}
                    entities={data.entities}
                    loading={dashboard.loading}
                    error={dashboard.error}
                    busy={busy}
                    onAsk={(question, context, scenario) => void send(question, scenario, context)}
                    onSource={(source) => void openSource(source)}
                    onExplain={setExplanation}
                    onExpand={(chart, analysis) => {
                      setExpanded(chart);
                      setExpandedVersion(analysis.datasetVersion);
                      setExpandedAnalysis(analysis);
                    }}
                    onReload={dashboard.reload}
                  />
                </>
              )}
              <div className="conversation" aria-live="polite" aria-busy={busy}>
                {analyses.map((a, index) => (
                  <article
                    className="analysis kaia-result-reveal"
                    key={a.analysisId}
                    ref={index === analyses.length - 1 ? latestAnswer : undefined}
                  >
                    <div className="user-question">
                      <span>Dig</span>
                      <p>{a.question}</p>
                    </div>
                    <div className="answer-identity">
                      <Mark size={23} />
                      <strong>K.A.I.A.</strong>
                      <span>{a.datasetVersion}</span>
                    </div>
                    <div className="answer-body">
                      {a.trace && index === analyses.length - 1 && (
                        <AnalysisFlow
                          key={a.trace.runId}
                          trace={a.trace}
                          sources={a.sources}
                          onSource={(s) => void openSource(s)}
                          autoPlay={reviewAnalysisId === a.analysisId}
                          reduced={reduced}
                          action={
                            a.mobility ? (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => setExplanation(a)}
                              >
                                Åbn planudkast og forudsætninger
                              </button>
                            ) : undefined
                          }
                        />
                      )}
                      <h2>{displayText(a.title)}</h2>
                      <p className="conclusion">
                        <EvidenceText
                          text={a.conclusion}
                          sources={a.sources}
                          onSource={(s) => void openSource(s)}
                        />
                      </p>
                      {a.metrics.length > 0 && (
                        <div className="metrics">
                          {a.metrics.map((m, i) => (
                            <div key={i}>
                              <span>{displayText(m.label)}</span>
                              <strong>{metricValue(m.value, m.unit, m.displayUnit)}</strong>
                              {m.description && <small>{displayText(m.description)}</small>}
                            </div>
                          ))}
                        </div>
                      )}
                      {a.mobility && index === analyses.length - 1 ? (
                        <MobilityExplorer analysis={a} onSource={(s) => void openSource(s)} />
                      ) : (
                        a.chart && (
                          <AnalysisChart
                            chart={a.chart}
                            version={a.datasetVersion}
                            onExplain={() => setExplanation(a)}
                            onExpand={(chart) => {
                              setExpanded(chart);
                              setExpandedVersion(a.datasetVersion);
                              setExpandedAnalysis(a);
                            }}
                          />
                        )
                      )}
                      {a.renderedText && (
                        <div className="model-formulation">
                          <span className="section-kicker">
                            FORMULERET MED{' '}
                            {a.formulation
                              ? providerNames[a.formulation.provider].toUpperCase() +
                                ' · ' +
                                a.formulation.model
                              : 'DEN KONFIGUREREDE AI-FORBINDELSE'}
                          </span>
                          <p>
                            <EvidenceText
                              text={a.renderedText}
                              sources={a.sources}
                              onSource={(s) => void openSource(s)}
                            />
                          </p>
                        </div>
                      )}
                      {a.narrative.length > 0 && (
                        <div className="answer-explanation">
                          {a.narrative.map((text, i) => (
                            <p key={i}>
                              <EvidenceText
                                text={text}
                                sources={a.sources}
                                onSource={(s) => void openSource(s)}
                              />
                            </p>
                          ))}
                        </div>
                      )}
                      {a.contextSeries && a.contextSeries.length > 0 && (
                        <details className="context-series">
                          <summary>
                            <Database size={14} />
                            Supplerende pris- og befolkningskontekst
                            <ChevronDown size={14} />
                          </summary>
                          <p>
                            Serierne giver kontekst. De er ikke i sig selv dokumentation for en
                            lokal økonomisk årsag.
                          </p>
                          {a.contextSeries.map((series) => (
                            <div key={series.id}>
                              <div className="context-status">
                                <span>
                                  {series.status === 'simulated'
                                    ? 'Kontekstserie'
                                    : series.status === 'verified-public-snapshot'
                                      ? 'Verificeret offentligt snapshot'
                                      : 'Offentligt API-udtræk'}
                                </span>
                                <small>
                                  {series.geography} · Hentet{' '}
                                  {new Date(series.retrievedAt).toLocaleDateString('da-DK')}
                                </small>
                              </div>
                              <AnalysisChart
                                chart={{
                                  type: 'line',
                                  title: series.title,
                                  subtitle: series.unit + ' · ' + series.geography,
                                  unit: 'number',
                                  rows: series.observations.map((o) => ({
                                    label: o.period,
                                    value: o.value,
                                  })),
                                  series: [{ key: 'value', label: series.unit, color: '#006f71' }],
                                  sourceIds: [series.id],
                                }}
                                version={series.datasetVersion}
                                dataLabel={
                                  series.status === 'simulated'
                                    ? 'Simuleret kontekst'
                                    : 'Offentligt snapshot'
                                }
                              />
                            </div>
                          ))}
                        </details>
                      )}
                      {a.assumptions.length > 0 && (
                        <details className="assumptions">
                          <summary>
                            Grundlag og antagelser
                            <ChevronDown size={14} />
                          </summary>
                          <ul>
                            {a.assumptions.map((t, i) => (
                              <li key={i}>{displayText(t)}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {a.missingData && (
                        <div className="inline-notice">
                          <Info size={16} />
                          {displayText(a.missingData)}
                        </div>
                      )}
                      {a.scenario && (
                        <div className="scenario-result">
                          <SlidersHorizontal size={19} />
                          <div>
                            <strong>Ændring i scenariet: {money(a.scenario.deltaOre, true)}</strong>
                            <small>
                              Baseline {money(a.scenario.baselineOre, true)} · Scenarie{' '}
                              {money(a.scenario.scenarioOre, true)}
                            </small>
                          </div>
                          <button
                            className="secondary"
                            onClick={() => {
                              setScenarioBasis(a);
                              setModal('scenario');
                            }}
                          >
                            Ændr forudsætninger
                          </button>
                        </div>
                      )}
                      {a.sources.length > 0 && (
                        <div className="sources">
                          <span className="section-kicker">KILDER & BEREGNINGSGRUNDLAG</span>
                          <div>
                            {a.sources.map((s, i) => (
                              <button key={`${s.id}-${i}`} onClick={() => void openSource(s)}>
                                <span>{i + 1}</span>
                                <div>
                                  <strong>{displayText(s.title)}</strong>
                                  <small>
                                    {sourceLabel(s)} · {s.period}
                                  </small>
                                </div>
                                <ArrowUpRight size={14} />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="answer-actions">
                        {a.trace && (
                          <button onClick={() => setExplanation(a)}>
                            <ShieldCheck size={14} />
                            Se analyseforløb
                          </button>
                        )}
                        {!a.chart && (
                          <button onClick={() => setExplanation(a)}>
                            <Database size={14} />
                            Vis data
                          </button>
                        )}
                        <button onClick={() => void saveInsight(a)}>
                          <Bookmark size={14} />
                          Gem indsigt
                        </button>
                        {a.scenario && (
                          <button onClick={() => nameScenario(a)}>
                            <SlidersHorizontal size={14} />
                            Gem scenarie
                          </button>
                        )}
                        <a
                          href={`/api/export?analysisId=${encodeURIComponent(a.analysisId)}&format=json`}
                          download
                        >
                          <Download size={14} />
                          Eksportér
                        </a>
                        <button
                          disabled={busy}
                          onClick={() => {
                            applyAnalysisContext(a);
                            void send(a.question, a.scenario?.assumptions, a.context);
                          }}
                        >
                          <RotateCcw size={14} />
                          Beregn igen
                        </button>
                      </div>
                      {index === analyses.length - 1 && a.followups.length > 0 && (
                        <div className="followups">
                          <span>Undersøg videre</span>
                          {a.followups.map((q) => (
                            <button key={q} disabled={busy} onClick={() => void send(q)}>
                              {displayText(q)}
                              <ArrowRight size={15} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {pending && (
                <div className="pending-analysis" ref={pendingRef}>
                  <div className="user-question">
                    <span>Dig</span>
                    <p>{pending}</p>
                  </div>
                  {liveTrace && <AnalysisFlow trace={liveTrace} />}
                  <StreamingAnswer
                    label={stage || 'Undersøger spørgsmålet'}
                    kind={pendingKind}
                    text={liveText}
                    provider={
                      provider?.id === 'demo' || !provider
                        ? 'Demo · Beregnet svar'
                        : `${providerNames[provider.id]} · ${provider.model}`
                    }
                  />
                </div>
              )}
              {error && (
                <div className="error-state" role="alert" ref={errorRef}>
                  <Info size={18} />
                  <div>
                    <strong>Analysen kunne ikke afsluttes</strong>
                    <p>{error}</p>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy || !retry}
                    onClick={() =>
                      retry && void send(retry.question, retry.scenario, retry.context, retry)
                    }
                  >
                    Prøv igen
                  </button>
                </div>
              )}
              <div ref={bottom} />
              {(analyses.length > 0 || pending || error) && (
                <div className="sticky-composer">
                  <Composer
                    input={input}
                    setInput={setInput}
                    busy={busy}
                    send={submitInput}
                    stop={stopReply}
                    refInput={composer}
                  />
                </div>
              )}
              {!analyses.length && !pending && (
                <div className="welcome-footer">
                  <Database size={14} />
                  <span>
                    Snapshot{' '}
                    {new Date(data.dataset.referenceDate).toLocaleDateString('da-DK', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}{' '}
                    · {new Intl.NumberFormat('da-DK').format(data.dataset.rowCount)} posteringer ·{' '}
                    {data.dataset.documentCount} dokumenter
                  </span>
                </div>
              )}
            </>
          ) : view === 'history' ? (
            <section className="collection">
              <span className="eyebrow">DIT ARBEJDE</span>
              <h1>Samtalehistorik</h1>
              <p className="muted">Fortsæt en undersøgelse med dens periode, enheder og kilder.</p>
              {data.conversations.length ? (
                data.conversations.map((c) => (
                  <button
                    className="collection-row"
                    key={c.id}
                    onClick={() => void openConversation(c.id)}
                  >
                    <MessageSquare size={20} />
                    <div>
                      <strong>{displayText(c.title)}</strong>
                      <small>{new Date(c.updatedAt).toLocaleString('da-DK')}</small>
                    </div>
                    <ArrowRight size={17} />
                  </button>
                ))
              ) : (
                <EmptyState
                  icon="conversation"
                  title="Plads til dit første spørgsmål"
                  text="Når du begynder en samtale, bliver den gemt her."
                  action="Start en samtale"
                  onClick={newConversation}
                />
              )}
            </section>
          ) : view === 'insights' ? (
            <section className="collection">
              <span className="eyebrow">BEVAR OVERBLIKKET</span>
              <h1>Gemte indsigter</h1>
              <p className="muted">
                Svar, figurer og kilder fastholdt i det oprindelige datasnapshot.
              </p>
              {data.insights.length ? (
                data.insights.map((i) => (
                  <button
                    className="collection-row"
                    key={i.id}
                    onClick={() => restoreSnapshot(i.analysis)}
                  >
                    <Bookmark size={20} />
                    <div>
                      <strong>{displayText(i.title)}</strong>
                      <small>
                        {i.analysis.datasetVersion} ·{' '}
                        {new Date(i.createdAt).toLocaleDateString('da-DK')}
                      </small>
                    </div>
                    <ArrowRight size={17} />
                  </button>
                ))
              ) : (
                <EmptyState
                  icon="insight"
                  title="Indsigter, du kan vende tilbage til"
                  text="Vælg Gem indsigt under et svar for at bevare analysen med dens grundlag."
                  action="Undersøg et spørgsmål"
                  onClick={newConversation}
                />
              )}
            </section>
          ) : (
            <section className="collection">
              <span className="eyebrow">UNDERSØG MULIGHEDERNE</span>
              <h1>Hvad nu hvis?</h1>
              <p className="muted">Ændr en forudsætning. Se virkningen. Bevar baseline.</p>
              {data.scenarios.length > 0 && (
                <>
                  <h2>Dine gemte scenarier</h2>
                  {data.scenarios.map((s) => (
                    <button
                      className="collection-row"
                      key={s.id}
                      onClick={() => restoreSnapshot(s.analysis)}
                    >
                      <SlidersHorizontal size={20} />
                      <div>
                        <strong>{displayText(s.title)}</strong>
                        <small>{s.analysis.datasetVersion}</small>
                      </div>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                </>
              )}
              <h2>Forberedte scenarier</h2>
              <div className="scenario-grid">
                {scenarioPrompts
                  .filter((s) => data.user.areas.includes(s.area))
                  .map(({ title, description: desc, question: q, assumptions }) => (
                    <button key={title} onClick={() => void send(q, assumptions)}>
                      <SlidersHorizontal size={18} />
                      <strong>{displayText(title)}</strong>
                      <p>{displayText(desc)}</p>
                      <span>
                        Åbn scenarie
                        <ArrowUpRight size={14} />
                      </span>
                    </button>
                  ))}
              </div>
            </section>
          )}
        </main>
        <footer className="workspace-footer">
          <span>K.A.I.A. · Et fælles beslutningsgrundlag</span>
          <span>Kontroller altid grundlaget</span>
        </footer>
      </div>
      {savingScenario && (
        <Dialog title="Gem scenarie" onClose={() => setSavingScenario(undefined)}>
          <form
            className="settings-content"
            onSubmit={(e) => {
              e.preventDefault();
              void saveScenario(savingScenario);
            }}
          >
            <label className="field">
              Scenariets navn
              <input
                autoFocus
                value={scenarioTitle}
                onChange={(e) => setScenarioTitle(e.target.value)}
                maxLength={160}
                required
              />
            </label>
            <p className="muted">Dataversion, baseline og alle forudsætninger bevares.</p>
            <button type="submit" className="primary" disabled={!scenarioTitle.trim()}>
              Gem scenarie
            </button>
          </form>
        </Dialog>
      )}
      {modal === 'settings' && (
        <Dialog title="Indstillinger" onClose={() => setModal(null)}>
          <Settings
            user={data.user}
            providers={data.providers}
            onRefresh={() => void refresh()}
            reduced={reduced}
            onReduced={setMotion}
          />
        </Dialog>
      )}
      {modal === 'scenario' && (
        <Dialog title="Hvad nu hvis?" onClose={() => setModal(null)} wide>
          <ScenarioEditor
            basis={(scenarioBasis ?? last)!}
            onExplain={setExplanation}
            busy={busy}
            onCalculate={(s) =>
              void send('Beregn scenarie med de valgte forudsætninger', s, scenarioBasis?.context)
            }
          />
        </Dialog>
      )}
      {modal === 'examples' && (
        <Dialog title="Spørgsmål du kan prøve" onClose={() => setModal(null)}>
          <div className="examples-list">
            <p>
              Spørgsmålene beregnes ud fra dine rettigheder og det valgte snapshot. Nogle viser
              bevidst, hvordan manglende data og adgang håndteres.
            </p>
            {examples.map((q, i) => (
              <button key={q} onClick={() => void send(q)}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {displayText(q)}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {modal === 'access' && (
        <Dialog title="Adgangsopsætning" onClose={() => setModal(null)}>
          <AccessSettings entities={data.entities} />
        </Dialog>
      )}
      {source && (
        <Dialog
          title="Kilde og beregningsgrundlag"
          onClose={() => {
            sourceRequest.current++;
            setSource(undefined);
            setDocument(undefined);
          }}
        >
          <div className="source-detail">
            <span className={`source-type ${source.type}`}>
              {sourceLabel(source).toUpperCase()}
            </span>
            <h3>{displayText(document?.title ?? source.title)}</h3>
            <dl>
              <div>
                <dt>Periode</dt>
                <dd>{document?.period ?? source.period}</dd>
              </div>
              <div>
                <dt>Dataversion</dt>
                <dd>{source.datasetVersion}</dd>
              </div>
              {source.status && source.status !== 'simulated' && (
                <div>
                  <dt>Datastatus</dt>
                  <dd>
                    {source.status === 'verified-public-snapshot'
                      ? 'Verificeret offentligt snapshot'
                      : source.status}
                  </dd>
                </div>
              )}
              {source.unit && (
                <div>
                  <dt>Enhed</dt>
                  <dd>{source.unit}</dd>
                </div>
              )}
              {source.geography && (
                <div>
                  <dt>Geografi</dt>
                  <dd>{source.geography}</dd>
                </div>
              )}
              {document && (
                <>
                  <div>
                    <dt>Dokument-ID</dt>
                    <dd>{document.id}</dd>
                  </div>
                  <div>
                    <dt>Dokumentdato</dt>
                    <dd>{new Date(document.date).toLocaleDateString('da-DK')}</dd>
                  </div>
                  <div>
                    <dt>Adgang</dt>
                    <dd>
                      {document.classification === 'political'
                        ? 'Politisk materiale'
                        : 'Internt materiale'}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {source.type === 'name' && (
              <div className="inline-notice">
                Denne kilde dokumenterer enhedens navn. Den dokumenterer ingen økonomital eller
                beslutninger. Disse fremgår af beregningskilderne.
              </div>
            )}
            {source.origin === 'assumption' && (
              <div className="inline-notice">
                {source.id.startsWith('DEMO-MOBILITY-')
                  ? 'Valgte forudsætninger i kapacitetsmodellen. De er modelantagelser og kan ændres under Vis data.'
                  : 'Antagelser foreslået af modellen til denne illustration. De er ikke observationer fra kommunens datasæt. Du kan ændre dem med et opfølgende spørgsmål.'}
              </div>
            )}
            {source.origin === 'calculation' && (
              <div className="inline-notice">
                Resultatet er beregnet på serveren ud fra illustrationens antagelser. Det er ikke en
                udtrukket budgetpost.
              </div>
            )}
            <h4>Relevant uddrag</h4>
            <blockquote>
              {displayText(
                document && source.excerpt === document.text
                  ? document.text
                      .split(/(?<=\.)\s/)
                      .slice(0, 3)
                      .join(' ')
                  : source.id.startsWith('DEMO-MOBILITY-')
                    ? source.excerpt.split('\n')[0]
                    : source.excerpt,
              )}
            </blockquote>
            {source.id.startsWith('DEMO-MOBILITY-') && source.excerpt.includes('\n') && (
              <details className="source-raw-rows">
                <summary>Vis de underliggende beregningsrækker</summary>
                <pre>{source.excerpt.slice(source.excerpt.indexOf('\n') + 1)}</pre>
              </details>
            )}
            {document && (
              <>
                <h4>Dokument</h4>
                <div className="document-text">{displayText(document.text)}</div>
                {document.relatedDocumentIds.length > 0 && (
                  <p className="muted">
                    Relaterede dokumenter: {document.relatedDocumentIds.join(', ')}
                  </p>
                )}
              </>
            )}
            {source.url && (
              <a href={source.url} target="_blank" rel="noreferrer" className="secondary">
                Åbn original kilde
                <ArrowUpRight size={15} />
              </a>
            )}
            {source.rowIds && (
              <details className="assumptions">
                <summary>
                  Referencer til datarækker
                  <ChevronDown size={14} />
                </summary>
                <code>{source.rowIds.join('\n')}</code>
              </details>
            )}
          </div>
        </Dialog>
      )}
      {expanded && (
        <Dialog title={displayText(expanded.title)} onClose={() => setExpanded(undefined)} wide>
          <AnalysisChart
            chart={expanded}
            version={expandedVersion ?? last?.datasetVersion ?? data.dataset.version}
            large
            onExplain={
              expandedAnalysis
                ? () => {
                    setExpanded(undefined);
                    setExplanation(expandedAnalysis);
                  }
                : undefined
            }
          />
        </Dialog>
      )}
      {explanation && (
        <Dialog title="Sådan er svaret beregnet" onClose={() => setExplanation(undefined)} wide>
          {explanation.mobility ? (
            <MobilityPanel
              key={explanation.analysisId}
              analysis={explanation}
              onSource={(s) => void openSource(s)}
              onSaved={(saved) => {
                setAnalyses((current) =>
                  current.some((a) => a.analysisId === saved.analysisId)
                    ? current
                    : [...current, saved],
                );
                setConversationId(saved.conversationId);
                applyAnalysisContext(saved);
                setExplanation(saved);
                void refresh();
              }}
            />
          ) : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              explanation.analysisId,
            ) ? (
            <AnalysisBasisEditor
              key={explanation.analysisId}
              analysis={explanation}
              entities={data.entities}
              onSource={(s) => void openSource(s)}
            />
          ) : (
            <AnalysisBasis
              analysis={explanation}
              entities={data.entities}
              onSource={(s) => void openSource(s)}
            />
          )}
        </Dialog>
      )}
      <DataStatusBadge />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Composer({
  input,
  setInput,
  busy,
  send,
  stop,
  refInput,
  welcome = false,
}: {
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  send: () => void;
  stop: () => void;
  refInput: React.RefObject<HTMLTextAreaElement | null>;
  welcome?: boolean;
}) {
  return (
    <div className={`composer ${welcome ? 'welcome-composer' : ''}`}>
      <label htmlFor="question" className="sr-only">
        Hvad vil du gerne vide om kommunen?
      </label>
      <textarea
        id="question"
        ref={refInput}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          welcome ? 'Hvad vil du gerne vide om kommunen?' : 'Stil et opfølgende spørgsmål …'
        }
        rows={2}
        maxLength={2000}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!busy) send();
          }
        }}
      />
      <div className="composer-bottom">
        <span>
          <Search size={13} />{' '}
          {welcome
            ? 'Dit spørgsmål undersøges i dit aktive adgangsområde'
            : 'Samme afgrænsning følger med i samtalen'}
        </span>
        <button
          className={`send-button ${busy ? 'stop' : ''}`}
          type="button"
          aria-label={busy ? 'Stop svar' : 'Send spørgsmål'}
          disabled={!busy && !input.trim()}
          onClick={busy ? stop : send}
        >
          {busy ? (
            <Square size={14} />
          ) : (
            <>
              <span>Undersøg</span>
              <ArrowUpRight size={17} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
function EmptyState({
  icon,
  title,
  text,
  action,
  onClick,
}: {
  icon: string;
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-state">
      {icon === 'insight' ? <Bookmark size={28} /> : <MessageSquare size={28} />}
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="secondary" onClick={onClick}>
        {action}
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
function AccessSettings({ entities }: { entities: PublicEntity[] }) {
  type Identity = {
    userId: string;
    displayName: string;
    title: string;
    roles: string[];
    unitIds: string[];
    areas: Area[];
  };
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [selected, setSelected] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ identities: Identity[] }>('/api/access')
      .then((r) => setIdentities(r.identities))
      .catch((e) => setStatus(e instanceof Error ? e.message : 'Identiteter kunne ikke hentes.'));
  }, []);
  async function save() {
    setBusy(true);
    try {
      await api('/api/access', {
        userId: selected,
        unitIds,
        areas: [...new Set(entities.filter((e) => unitIds.includes(e.id)).map((e) => e.area))],
      });
      setStatus('Scope er gemt. App-roller tildeles fortsat i Entra ID.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Adgangen kunne ikke gemmes.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-content">
      <p>
        Afgræns data for en eksisterende identitet. Entra-app-roller ændres i tenantens Enterprise
        Application og tildeles via valideret tenant- og object-ID.
      </p>
      <label className="field">
        Eksisterende identitet
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setUnitIds(identities.find((i) => i.userId === e.target.value)?.unitIds ?? []);
          }}
        >
          <option value="">Vælg en identitet</option>
          {identities.map((i) => (
            <option key={i.userId} value={i.userId}>
              {i.displayName} · {i.title}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <p className="muted">
          Validerede app-roller: {identities.find((i) => i.userId === selected)?.roles.join(', ')}
        </p>
      )}
      <fieldset className="scope-checks">
        <legend>Tilladte enheder</legend>
        {entities
          .filter((e) => e.type !== 'committee')
          .map((e) => (
            <label key={e.id}>
              <input
                type="checkbox"
                checked={unitIds.includes(e.id)}
                onChange={(event) =>
                  setUnitIds(
                    event.target.checked ? [...unitIds, e.id] : unitIds.filter((id) => id !== e.id),
                  )
                }
              />
              {e.name}
            </label>
          ))}
      </fieldset>
      <button className="primary" disabled={busy || !selected} onClick={() => void save()}>
        Gem enhedsscope
      </button>
      <p role="status">{status}</p>
    </div>
  );
}
