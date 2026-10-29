'use client';
import { useState } from 'react';
import { Check, PlugZap, ShieldCheck, ExternalLink, LoaderCircle } from './icon';
import type { AccessContext, CortiRegion, ProviderId, ProviderPublic } from '@/domain/types';
export const providerNames: Record<ProviderId, string> = {
  demo: 'Demo',
  openai: 'OpenAI',
  azure: 'Azure OpenAI',
  mistral: 'Mistral',
  corti: 'Corti Models',
};
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('Forbindelsen til K.A.I.A. blev afbrudt. Prøv igen.', { cause: error });
  }
  let data: { error?: string; message?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error('Serverens svar kunne ikke læses. Prøv igen.');
  }
  if (!response.ok)
    throw new Error(data.error ?? data.message ?? 'Handlingen kunne ikke gennemføres. Prøv igen.');
  return data as T;
}

export function Settings({
  user,
  providers,
  onRefresh,
  reduced,
  onReduced,
}: {
  user: AccessContext;
  providers: ProviderPublic[];
  onRefresh: () => void;
  reduced: boolean;
  onReduced: (v: boolean) => void;
}) {
  const [chosen, setChosen] = useState<ProviderId>('openai');
  const connection = providers.find((p) => p.id === chosen);
  const initial = providers.find((p) => p.id === 'openai');
  const [model, setModel] = useState(initial?.model ?? '');
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? '');
  const [region, setRegion] = useState<CortiRegion>(initial?.region ?? 'eu');
  const [key, setKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [oauth, setOauth] = useState(initial?.authMode === 'oauth');
  const [tenant, setTenant] = useState(initial?.tenant ?? 'base');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [tested, setTested] = useState(false);
  const [temperature, setTemperature] = useState(
    initial?.temperature === undefined ? '' : String(initial.temperature),
  );
  const [maxTokens, setMaxTokens] = useState(
    initial?.maxTokens === undefined ? '' : String(initial.maxTokens),
  );
  const admin = user.roles.includes('KAIA.Admin');
  function selectProvider(id: ProviderId) {
    setChosen(id);
    const p = providers.find((x) => x.id === id);
    setModel(p?.model ?? '');
    setEndpoint(p?.endpoint ?? '');
    setRegion(p?.region ?? 'eu');
    setOauth(p?.authMode === 'oauth');
    setTenant(p?.tenant ?? 'base');
    setTemperature(p?.temperature === undefined ? '' : String(p.temperature));
    setMaxTokens(p?.maxTokens === undefined ? '' : String(p.maxTokens));
    setKey('');
    setClientId('');
    setClientSecret('');
    setModels([]);
    setStatus('');
    setTested(false);
  }
  async function mutate(action: 'save' | 'test' | 'models' | 'demo' | 'activate') {
    setBusy(true);
    setStatus('');
    try {
      if (action === 'save' || action === 'activate') {
        await api('/api/providers', {
          id: chosen,
          model,
          endpoint: endpoint || undefined,
          region,
          ...(key ? { apiKey: key } : {}),
          ...(chosen === 'corti'
            ? {
                authMode: oauth ? 'oauth' : 'apiKey',
                tenant,
                ...(oauth
                  ? { clientId: clientId || undefined, clientSecret: clientSecret || undefined }
                  : {}),
              }
            : {}),
          temperature: temperature === '' ? null : Number(temperature),
          maxTokens: maxTokens === '' ? null : Number(maxTokens),
          active: action === 'activate',
        });
        setKey('');
        setClientSecret('');
        setStatus(
          action === 'activate'
            ? 'Forbindelsen er aktiveret.'
            : 'Forbindelsen er gemt. Brug Test forbindelse for at afprøve den.',
        );
        onRefresh();
      }
      if (action === 'demo') {
        await api('/api/providers', { id: 'demo', model: 'Deterministisk analyse', active: true });
        setStatus('Demo er aktiv. Der foretages ingen AI-modelkald.');
        onRefresh();
      }
      if (action === 'test') {
        const result = await api<{ ok: boolean; message: string; models?: string[] }>(
          '/api/providers/test',
          { id: chosen },
        );
        setTested(result.ok);
        setStatus(
          result.message ??
            (result.ok ? 'Forbindelsen er afprøvet.' : 'Forbindelsen kunne ikke bekræftes.'),
        );
        if (result.models) setModels(result.models);
        onRefresh();
      }
      if (action === 'models') {
        const result = await api<{ models: string[] }>(`/api/providers/models?id=${chosen}`);
        setModels(result.models);
        setStatus(
          result.models.length
            ? 'Modeller hentet fra den konfigurerede forbindelse.'
            : 'Denne forbindelse tilbyder ingen modelliste. Angiv et dokumenteret modelnavn.',
        );
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Forbindelsen kunne ikke ændres.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-content">
      <section>
        <div className="section-kicker">
          <ShieldCheck size={16} /> DIN ARBEJDSFLADE
        </div>
        <h3>{user.displayName}</h3>
        <p className="muted">
          {user.title} ·{' '}
          {user.roles
            .map(
              (role) =>
                ({
                  'KAIA.Admin': 'Administrator',
                  'KAIA.Executive': 'Direktion',
                  'KAIA.Finance': 'Økonomikonsulent',
                  'KAIA.DepartmentHead': 'Fagchef',
                  'KAIA.Council': 'Kommunalbestyrelsesmedlem',
                })[role] ?? 'Tildelt adgang',
            )
            .join(', ')}
        </p>
        <label className="toggle-row">
          <span>
            <strong>Dæmp bevægelse</strong>
            <small>Giver læsero. Enhedens valg respekteres altid.</small>
          </span>
          <input type="checkbox" checked={reduced} onChange={(e) => onReduced(e.target.checked)} />
        </label>
      </section>
      <section>
        <div className="section-kicker">
          <PlugZap size={16} /> AI-FORBINDELSER
        </div>
        <div className="provider-list">
          {providers.map((p) => (
            <div key={p.id}>
              <span className="provider-monogram">
                {p.id === 'demo' ? 'D' : providerNames[p.id][0]}
              </span>
              <div>
                <strong>{providerNames[p.id]}</strong>
                <small>
                  {p.id === 'demo'
                    ? 'Beregninger uden eksterne modelkald'
                    : p.model || 'Model afventer opsætning'}
                </small>
                <small>{p.status}</small>
              </div>
              <span className={`status-pill ${p.active ? 'active' : ''}`}>
                {p.active ? (
                  <>
                    <Check size={12} />
                    Aktiv
                  </>
                ) : p.configured ? (
                  'Konfigureret'
                ) : (
                  'Ikke tilsluttet'
                )}
              </span>
            </div>
          ))}
        </div>
      </section>
      {admin ? (
        <section className="provider-editor">
          <h3>Konfigurér en forbindelse</h3>
          <p className="muted">
            Nøgler gemmes krypteret på serveren. Gem forbindelsen, før du afprøver den.
          </p>
          <div className="form-grid">
            <label className="field">
              Udbyder
              <select value={chosen} onChange={(e) => selectProvider(e.target.value as ProviderId)}>
                {(['openai', 'azure', 'mistral', 'corti'] as ProviderId[]).map((id) => (
                  <option key={id} value={id}>
                    {providerNames[id]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {chosen === 'azure' ? 'Deploymentnavn' : 'Model'}
              <input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setTested(false);
                }}
                placeholder={connection?.model || 'Angiv model fra udbyderen'}
                list="provider-models"
                autoComplete="off"
              />
              <datalist id="provider-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
          </div>
          {chosen === 'corti' ? (
            <>
              <label className="field">
                Region
                <select
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value as CortiRegion);
                    if (chosen === 'corti') setEndpoint('');
                    setTested(false);
                  }}
                >
                  <option value="eu">EU</option>
                  <option value="us">USA</option>
                  <option value="fr">Frankrig (FR)</option>
                </select>
              </label>
              <label className="toggle-row">
                <span>
                  <strong>OAuth client credentials</strong>
                  <small>Brug serverbaseret tokenfornyelse.</small>
                </span>
                <input
                  type="checkbox"
                  checked={oauth}
                  onChange={(e) => {
                    setOauth(e.target.checked);
                    setTested(false);
                  }}
                />
              </label>
            </>
          ) : (
            <label className="field">
              {chosen === 'azure' ? 'Azure-ressourceendpoint' : 'API-endpoint (valgfrit)'}
              <input
                type="url"
                value={endpoint}
                onChange={(e) => {
                  setEndpoint(e.target.value);
                  setTested(false);
                }}
                placeholder={
                  chosen === 'azure'
                    ? 'https://din-ressource.openai.azure.com/openai/v1'
                    : 'Udbyderens standardendpoint'
                }
              />
            </label>
          )}
          {oauth && chosen === 'corti' ? (
            <>
              <label className="field">
                Corti-tenant
                <input
                  value={tenant}
                  onChange={(e) => {
                    setTenant(e.target.value);
                    setTested(false);
                  }}
                  placeholder="base"
                  autoComplete="off"
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  Client ID
                  <input
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setTested(false);
                    }}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  Client secret
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={(e) => {
                      setClientSecret(e.target.value);
                      setTested(false);
                    }}
                    autoComplete="new-password"
                    placeholder="Gemte værdier vises aldrig"
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="field">
              API-nøgle
              <input
                type="password"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setTested(false);
                }}
                autoComplete="new-password"
                placeholder={
                  connection?.configured
                    ? 'Gemte værdier vises aldrig'
                    : 'Indsæt nøgle eller brug miljøvariabel'
                }
              />
            </label>
          )}
          <div className="form-grid">
            <label className="field">
              Temperature (valgfrit)
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                placeholder="Udbyderens standard"
                onChange={(e) => {
                  setTemperature(e.target.value);
                  setTested(false);
                }}
              />
            </label>
            <label className="field">
              Svargrænse i tokens (valgfrit)
              <input
                type="number"
                min="100"
                max="4096"
                step="100"
                value={maxTokens}
                placeholder="1600"
                onChange={(e) => {
                  setMaxTokens(e.target.value);
                  setTested(false);
                }}
              />
            </label>
          </div>
          <p className="muted">
            Lad temperature være tom, hvis modellen ikke understøtter parameteren.
            Forbindelsestesten kontrollerer den gemte opsætning, streaming og værktøjskald.
          </p>
          <div className="panel-actions wrap">
            <button className="secondary" disabled={busy} onClick={() => void mutate('models')}>
              Hent modeller
            </button>
            <button
              className="secondary"
              disabled={busy || !connection?.configured}
              onClick={() => void mutate('test')}
            >
              Test forbindelse
            </button>
            <button
              className="primary"
              disabled={busy || !model}
              onClick={() => void mutate('save')}
            >
              {busy && <LoaderCircle size={14} className="spin" />}Gem forbindelse
            </button>
            {tested && (
              <button className="primary" disabled={busy} onClick={() => void mutate('activate')}>
                Aktivér som standard
              </button>
            )}
          </div>
          <button
            className="text-button demo-action"
            disabled={busy}
            onClick={() => void mutate('demo')}
          >
            Aktivér demo uden AI-modelkald
            <Check size={14} />
          </button>
          <div role="status" className={status ? 'inline-notice' : ''}>
            {status}
          </div>
        </section>
      ) : (
        <p className="inline-notice">
          En administrator vedligeholder udbydere, modeller og adgangstildelinger.
        </p>
      )}
      <form action="/auth/logout" method="post">
        <button className="secondary" type="submit">
          Log ud
        </button>
      </form>
      <p className="settings-footnote">
        <a
          href="https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps"
          target="_blank"
          rel="noreferrer"
        >
          Om Entra-app-roller
          <ExternalLink size={11} />
        </a>
      </p>
    </div>
  );
}
