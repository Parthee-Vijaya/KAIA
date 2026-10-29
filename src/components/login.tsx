import { ArrowRight, Check, ShieldCheck, Database, KeyRound, ArrowUpRight } from './icon';
import { Brand } from './brand';
import { DataMotion } from './data-motion';
import { DataStatusBadge } from './data-status-badge';
export interface Setup {
  database: boolean;
  entra: boolean;
  encryption: boolean;
  localTest: boolean;
  callbackUrl: string;
  ready: boolean;
  authMode?: 'demo' | 'entra';
  demoEnabled?: boolean;
  session?: boolean;
}
export function Login({ setup, error }: { setup: Setup; error?: string }) {
  const demoMode = setup.authMode === 'demo';
  return (
    <main id="main-content" className="login-layout">
      <section className="login-story">
        <div className="login-top">
          <Brand />
          <span>Et fælles blik på kommunen</span>
        </div>
        <div className="login-editorial">
          <div className="eyebrow">
            <span className="tiny-line" /> KOMMUNAL DIALOG & ANALYSE
          </div>
          <h1>
            Gode spørgsmål.
            <br />
            <span>Større overblik.</span>
          </h1>
          <p>
            Fra kommunens mange oplysninger til et klart svar.
            <br />
            Undersøg økonomien, følg kilderne og se mulighederne.
          </p>
        </div>
        <DataMotion />
        <div className="login-bottom">
          <span>01 — Fra datapunkt til indsigt</span>
          <span>Økonomi · Strategi · Scenarier</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form">
          <div className="login-symbol">
            <ShieldCheck size={24} />
          </div>
          <span className="eyebrow">VELKOMMEN TIL K.A.I.A.</span>
          <h2>
            Dit overblik
            <br />
            begynder her.
          </h2>
          <p>
            {demoMode
              ? 'Vælg en demoprofil, og undersøg økonomi, kilder og scenarier med profilens adgangsområde.'
              : 'Log ind med din arbejdskonto. Dine roller og dit adgangsområde følger med ind i samtalen.'}
          </p>
          {demoMode ? (
            <>
              <div className="demo-auth-notice" role="status">
                <KeyRound size={16} />
                <span>Demologin · Microsoft-login tilsluttes senere</span>
              </div>
              <form method="post" action="/auth/demo" className="demo-profile-form">
                <label className="field" htmlFor="demo-profile">
                  Din demoprofil
                  <select id="demo-profile" name="profile" defaultValue="executive">
                    <option value="executive">
                      Parthee · AI Program Lead · Tværgående overblik
                    </option>
                    <option value="school">Anne Dandanell · Chef · Skoleområdet</option>
                    <option value="council">Udvalgsmedlem · Politisk materiale</option>
                  </select>
                </label>
                <button type="submit" className="primary signin" disabled={!setup.ready}>
                  Åbn K.A.I.A.
                  <ArrowRight size={18} />
                </button>
              </form>
              {!setup.ready && (
                <div className="setup-status" role="status">
                  <strong>Demoforbindelsen er ikke klar</strong>
                  <p>
                    {setup.database
                      ? 'Demoadgangen afventer den sidste serveropsætning. Kontakt den ansvarlige for præsentationen.'
                      : 'Den lokale arbejdsstation skal være tændt og forbundet, før demoen kan åbnes.'}
                  </p>
                  <div>
                    <span>
                      <Database size={15} />
                      Data
                    </span>
                    <b className={setup.database ? 'good' : ''}>
                      {setup.database ? 'Forbundet' : 'Afventer forbindelse'}
                    </b>
                  </div>
                </div>
              )}
            </>
          ) : setup.entra && setup.database ? (
            <a className="primary signin" href="/auth/login">
              <span className="microsoft-mark">
                <i />
                <i />
                <i />
                <i />
              </span>
              Fortsæt med Microsoft
              <ArrowRight size={18} />
            </a>
          ) : (
            <>
              <button className="primary signin" disabled>
                <span className="microsoft-mark">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                Fortsæt med Microsoft
                <ArrowRight size={18} />
              </button>
              <div className="setup-status" role="status">
                <strong>Arbejdspladsen er ved at blive klargjort</strong>
                <p>
                  Microsoft-login og databasen skal forbindes, før en personlig session kan åbnes.
                </p>
                <div>
                  <span>
                    <Database size={15} />
                    Postgres
                  </span>
                  <b className={setup.database ? 'good' : ''}>
                    {setup.database ? (
                      <>
                        <Check size={14} />
                        Forbundet
                      </>
                    ) : (
                      'Afventer opsætning'
                    )}
                  </b>
                </div>
                <div>
                  <span>
                    <KeyRound size={15} />
                    Microsoft Entra ID
                  </span>
                  <b className={setup.entra ? 'good' : ''}>
                    {setup.entra ? (
                      <>
                        <Check size={14} />
                        Konfigureret
                      </>
                    ) : (
                      'Afventer opsætning'
                    )}
                  </b>
                </div>
              </div>
            </>
          )}
          {error && (
            <div className="error-state" role="alert">
              {demoMode
                ? 'Demologin kunne ikke åbnes. Kontrollér forbindelsen og prøv igen.'
                : error}
            </div>
          )}
          <div className="login-assurance">
            <ShieldCheck size={17} />
            <span>
              {demoMode
                ? 'Demoprofiler. Adgang efter rolle og område.'
                : 'Personligt login. Adgang efter rolle og område.'}
            </span>
          </div>
          {!demoMode && setup.localTest && (
            <form method="post" action="/api/test-session" className="test-session">
              <strong>Isoleret lokalt testmiljø</strong>
              <p>Testidentiteter er kun tilgængelige lokalt og er blokeret på Vercel.</p>
              <label htmlFor="test-profile">Testprofil</label>
              <select id="test-profile" name="profile">
                <option value="admin">Parthee · Administrator</option>
                <option value="school">Anne Dandanell · Skoleområdet</option>
                <option value="council">Udvalgsmedlem · Politisk materiale</option>
              </select>
              <button type="submit" className="secondary">
                Åbn testarbejdsflade
                <ArrowUpRight size={16} />
              </button>
            </form>
          )}
        </div>
      </section>
      <DataStatusBadge />
    </main>
  );
}
