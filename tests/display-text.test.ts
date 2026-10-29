import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { displayText } from '../src/components/display-text';
import { DataStatusBadge } from '../src/components/data-status-badge';
import { Login } from '../src/components/login';

describe('presentation wording', () => {
  it.each([
    ['Simuleret budgetopfølgning · skoleområdet', 'Budgetopfølgning · skoleområdet'],
    ['2026 · kr. · simulerede data', '2026 · kr.'],
    ['Simulerede data · 2026', '2026'],
    ['kr. pr. syntetisk elev', 'kr. pr. elev'],
    ['Demobudgettet er 125 kr.', 'Budgettet er 125 kr.'],
    ['Simulerede beslutninger og grundlag', 'Beslutninger og grundlag'],
    ['Budgetopfølgning (simuleret)', 'Budgetopfølgning'],
    [
      'Kontant realisering: 0,00 kr.. Øvrig værdi: 402.500,00 kr..',
      'Kontant realisering: 0,00 kr. Øvrig værdi: 402.500,00 kr.',
    ],
    [
      'SIMULERET MATERIALE. Skoleområdet, 2026. Budget: 125 kr.',
      'Skoleområdet, 2026. Budget: 125 kr.',
    ],
    ['SIMULEREDE TAL. Nettoafvigelse: -125,50 kr. [1]', 'Nettoafvigelse: -125,50 kr. [1]'],
    [
      'Budget: 125 kr. Navne er virkelige, mens tal, egenskaber og alle beskrivelser af beslutninger er fiktive.',
      'Budget: 125 kr.',
    ],
    [
      'Budget: 125 kr. Navne er virkelige; alle tal, egenskaber og beslutninger er fiktive.',
      'Budget: 125 kr.',
    ],
    [
      'Alle kommunale tal er simulerede. Dataversion KAIA-DEMO-2026.09-v4.',
      'Dataversion KAIA-DEMO-2026.09-v4.',
    ],
    [
      'Kommunernes økonomi og struktur er simulerede. Kun navne og koder er officielle.',
      'Kun navne og koder er officielle.',
    ],
    [
      'Demografihændelser er simulerede, aggregerede snapshotværdier.',
      'Demografihændelser er aggregerede snapshotværdier.',
    ],
  ])('cleans presentation qualifiers without changing the calculation: %s', (input, expected) => {
    expect(displayText(input)).toBe(expected);
  });
  it.each([
    'Demo',
    'Demo er aktiv. Der foretages ingen AI-modelkald.',
    'Demologin · Microsoft-login tilsluttes senere',
    'Corti Models · eu · base',
    'DEMO-CALC-125',
    'KAIA-DEMO-2026.09-v4',
    'Nettoafvigelse = forbrug minus budget.',
    'Ingen ændring af det oprindelige datasæt.',
    'Denne ændring er ikke fiktiv.',
    'Regnskab april–september 2025: -125,50 kr. [2]',
    'Budgettet er 125 kr... Afventer afklaring.',
  ])('preserves provider, identity, arithmetic or qualifying meaning: %s', (input) => {
    expect(displayText(input)).toBe(input);
  });
  it('renders the single reusable corner label without a provider status', () => {
    const markup = renderToStaticMarkup(createElement(DataStatusBadge));
    expect(markup.match(/Simulerede data/g)).toHaveLength(1);
    expect(markup).toContain('role="note"');
    expect(markup).not.toContain('Demo');
  });
  it('uses one corner label on login while preserving the explicit login mode', () => {
    const markup = renderToStaticMarkup(
      createElement(Login, {
        setup: {
          authMode: 'demo',
          database: true,
          encryption: true,
          entra: false,
          localTest: false,
          callbackUrl: 'http://127.0.0.1:3210/auth/callback',
          ready: true,
        },
      }),
    );
    expect(markup.match(/Simulerede data/g)).toHaveLength(1);
    expect(markup).toContain('kaia-data-status');
    expect(markup).toContain('Demologin · Microsoft-login tilsluttes senere');
    expect(markup).not.toContain('Fiktive tal');
  });
});
