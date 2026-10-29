(function () {
  const root = document.getElementById('kaia-dashboard-designs');
  const payload = document.getElementById('kaia-design-data');
  if (!root || !payload) return;
  let data;
  try {
    data = JSON.parse(payload.textContent);
  } catch {
    return;
  }
  const fmt = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });
  const dec = new Intl.NumberFormat('da-DK', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const kr = (v) => fmt.format(v / 100) + ' kr.';
  const percentFormat = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 12 });
  // Decimal percentages are converted to a rational before rounding each posting.
  // This preserves øre exactly, including negative half-ties (towards +infinity).
  const effect = (category, percent) => {
    const [mantissa, exponent = '0'] = String(percent).split('e');
    const scale = (mantissa.split('.')[1] || '').length - Number(exponent);
    const numerator = BigInt(mantissa.replace('.', '')) * 10n ** BigInt(Math.max(0, -scale));
    const denominator = 100n * 10n ** BigInt(Math.max(0, scale));
    return Number((data[category + 'RemainingAmounts'] || []).reduce((total, amount) => {
      const value = BigInt(amount) * numerator;
      const quotient = value / denominator;
      const remainder = value % denominator;
      const adjustment = remainder >= 0n
        ? (remainder * 2n >= denominator ? 1n : 0n)
        : (-remainder * 2n > denominator ? -1n : 0n);
      return total + quotient + adjustment;
    }, 0n));
  };
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const charts = new Map();
  function path(points) {
    return points
      .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2))
      .join(' ');
  }
  function lineChart(el) {
    const width = el.clientWidth;
    if (width < 80) return;
    const tableOpen = Boolean(el.querySelector('details')?.open);
    const series = el.dataset.metric === 'perPupil' ? data.perPupil.chart : data.forecast.chart;
    const rows = series.rows,
      divisor = el.dataset.metric === 'perPupil' ? 100000 : 100000000;
    const unit = el.dataset.metric === 'perPupil' ? 't.kr. pr. elev' : 'mio. kr.';
    const height = 210,
      left = 42,
      right = 11,
      top = 23,
      bottom = 29;
    const state = charts.get(el) || { base: true, budget: true, range: true };
    charts.set(el, state);
    const all = rows.flatMap((r) => [r.low, r.high, r.base, r.budget]).map((n) => n / divisor);
    const lo = Math.min(...all),
      hi = Math.max(...all),
      rough = (hi - lo) / 4,
      power = 10 ** Math.floor(Math.log10(rough)),
      step = [1, 2, 2.5, 5, 10].find((n) => n >= rough / power) * power;
    const min = Math.floor((lo - (hi - lo) * 0.12) / step) * step,
      max = Math.ceil((hi + (hi - lo) * 0.12) / step) * step;
    const x = (i) => left + (i * (width - left - right)) / (rows.length - 1),
      y = (v) =>
        height - bottom - ((v / divisor - min) / (max - min)) * (height - top - bottom);
    let grid = '';
    for (let n = min; n <= max + 0.001; n += step) {
      const yy = y(n * divisor);
      grid += `<line class="k-grid-line" x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"/><text x="${left - 7}" y="${yy + 4}" text-anchor="end">${fmt.format(n)}</text>`;
    }
    let labels = '';
    rows.forEach((r, i) => {
      if (width > 330 || i % 2 === 0 || i === rows.length - 1)
        labels += `<text x="${x(i)}" y="${height - 5}" text-anchor="${i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}">${r.label}</text>`;
    });
    const band =
      path(rows.map((r, i) => [x(i), y(r.low)])) +
      ' ' +
      path([...rows].reverse().map((r, j) => [x(rows.length - 1 - j), y(r.high)])).replace(
        /^M/,
        'L',
      ) +
      ' Z';
    let marks = state.range
      ? `<path class="k-band" d="${band}" style="fill:#e4e5e8;opacity:.5"/>`
      : '';
    for (const key of ['budget', 'low', 'high', 'base'])
      if (key === 'low' || key === 'high' ? state.range : state[key])
        marks += `<path class="k-series-${key}" d="${path(rows.map((r, i) => [x(i), y(r[key])]))}"/>`;
    el.innerHTML = `<svg class="k-chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Simuleret årsprognose 2026 til 2032 i ${unit}. Basis, budget og lavt/højt følsomhedsforløb."><text x="${left}" y="12">${unit}</text>${grid}${marks}${labels}<g data-hover-guide hidden><line x1="0" x2="0" y1="${top}" y2="${height - bottom}" stroke="var(--k-muted)" stroke-width="1"/><g data-hover-markers></g></g><rect x="${left}" y="${top}" width="${width - left - right}" height="${height - top - bottom}" fill="transparent" data-chart-hit data-chart-hover-overlay="cross-series"/></svg><div class="k-chart-legend"><button type="button" data-line="base" aria-pressed="${state.base}"><span class="k-swatch k-swatch-base"></span>Basis</button><button type="button" data-line="budget" aria-pressed="${state.budget}"><span class="k-swatch k-swatch-budget"></span>Budget</button><button type="button" data-line="range" aria-pressed="${state.range}"><span class="k-swatch k-swatch-range"></span>Lavt / højt</button></div><div class="k-chart-tip" role="tooltip" hidden></div><details class="k-chart-detail"><summary>Se talgrundlaget</summary><div class="k-table-wrap"><table class="k-table"><thead><tr><th>År</th><th>Basis</th><th>Budget</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.label}</td><td>${kr(r.base)}</td><td>${kr(r.budget)}</td></tr>`).join('')}</tbody></table></div></details>`;
    el.querySelector('details').open = tableOpen;
    el.querySelectorAll('[data-line]').forEach((button) =>
      button.addEventListener('click', () => {
        const key = button.dataset.line;
        state[key] = !state[key];
        lineChart(el);
        el.querySelector(`[data-line="${key}"]`).focus({ preventScroll: true });
      }),
    );
    const hit = el.querySelector('[data-chart-hit]'),
      tip = el.querySelector('.k-chart-tip'),
      guide = el.querySelector('[data-hover-guide]');
    const drawTip = (event) => {
      const rect = hit.ownerSVGElement.getBoundingClientRect(),
        xx = Math.max(left, Math.min(width - right, event.clientX - rect.left));
      const position = ((xx - left) / (width - left - right)) * (rows.length - 1),
        index = Math.min(rows.length - 2, Math.floor(position)),
        fraction = position - index;
      const values = {};
      for (const key of ['base', 'budget', 'low', 'high'])
        values[key] = rows[index][key] + (rows[index + 1][key] - rows[index][key]) * fraction;
      guide.removeAttribute('hidden');
      guide.querySelector('line').setAttribute('x1', xx);
      guide.querySelector('line').setAttribute('x2', xx);
      guide.querySelector('[data-hover-markers]').innerHTML = ['base', 'budget', 'low', 'high']
        .filter((key) => (key === 'low' || key === 'high' ? state.range : state[key]))
        .map(
          (key) =>
            `<circle cx="${xx}" cy="${y(values[key])}" r="3" fill="var(--k-${key === 'base' ? 'primary' : key === 'budget' ? 'slate' : 'petrol'})" stroke="var(--k-paper)" stroke-width="1.5"/>`,
        )
        .join('');
      tip.hidden = false;
      tip.style.left = Math.max(3, Math.min(width - 173, xx + 10)) + 'px';
      const yearLabel =
        Math.abs(position - Math.round(position)) < 0.001
          ? rows[Math.round(position)].label
          : `${rows[index].label}–${rows[index + 1].label} · interpoleret`;
      tip.innerHTML = `<strong>${yearLabel}</strong>${state.base ? `<div>Basis <span>${kr(values.base)}</span></div>` : ''}${state.budget ? `<div>Budget <span>${kr(values.budget)}</span></div>` : ''}${state.range ? `<div>Lavt <span>${kr(values.low)}</span></div><div>Højt <span>${kr(values.high)}</span></div>` : ''}`;
    };
    hit.addEventListener('pointermove', drawTip);
    hit.addEventListener('click', drawTip);
    hit.addEventListener('pointerleave', () => {
      tip.hidden = true;
      guide.setAttribute('hidden', '');
    });
  }
  function waterfall(el) {
    const width = el.clientWidth;
    if (width < 80) return;
    const rows = data.waterfall.chart.rows,
      height = 209,
      left = 27,
      right = 6,
      top = 23,
      bottom = 33,
      total = data.budget.metrics[2].value;
    const max = 700000000,
      y = (v) => height - bottom - (v / max) * (height - top - bottom),
      space = (width - left - right) / rows.length,
      bw = Math.min(29, space * 0.68);
    let markup = `<div class="k-waterfall-total">+${dec.format(total / 100000000)} <span>mio. kr.</span></div><p class="k-waterfall-note">Samlet merforbrug · januar–september</p><svg class="k-chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(rows.map((row) => row.label + ': ' + kr(row.value)).join(', ') + '. Samlet merforbrug ' + kr(total))}">`;
    [0, 300000000, 600000000].forEach((v) => {
      markup += `<line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" class="k-grid-line"/><text x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${v / 100000000}</text>`;
    });
    const short = ['Løn', 'Energi', 'Vikar', 'Vedl.', 'Akt.', 'Indt.'];
    rows.forEach((r, i) => {
      const x = left + space * i + space / 2,
        from = y(r.start),
        to = y(r.start + r.value),
        yy = Math.min(from, to),
        hh = Math.max(2, Math.abs(from - to));
      markup += `<rect x="${x - bw / 2}" y="${yy}" width="${bw}" height="${hh}" rx="2" fill="var(--k-${r.value < 0 ? 'petrol' : 'primary'})" opacity="${i === 0 ? 1 : 0.8}"/><text x="${x}" y="${yy - 7}" text-anchor="middle">${r.value > 0 ? '+' : '−'}${dec.format(Math.abs(r.value) / 100000000)}</text><text x="${x}" y="${height - 10}" text-anchor="middle">${short[i]}</text>`;
      if (i < rows.length - 1)
        markup += `<line x1="${x + bw / 2}" x2="${left + space * (i + 1) + space / 2 - bw / 2}" y1="${to}" y2="${to}" stroke="var(--k-line)"/>`;
    });
    el.innerHTML =
      markup +
      '</svg><details class="k-chart-detail"><summary>Se bidrag i kroner</summary><table class="k-table"><tbody>' +
      rows
        .map(
          (r) => `<tr><td>${r.label}</td><td>${r.value > 0 ? '+' : ''}${kr(r.value)}</td></tr>`,
        )
        .join('') +
      '</tbody></table></details>';
  }
  function heatmap(el) {
    const rows = [0, 1, 5, 6, 7].map((i) => data.heatmap.chart.rows[i]);
    const names = [
      'Herredsåsen',
      'Nyrupskolen',
      'Høng Skole',
      'Gørlev Skole',
      'Svebølle Skole',
    ];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep'];
    const maxValue = Math.max(
      1,
      ...rows.flatMap((row) =>
        months.map((month, index) => Math.abs(row['month' + (index + 1)])),
      ),
    );
    let s =
      '<div class="k-heatmap-row k-heatmap-head"><span>2026</span>' +
      months.map((m) => `<span>${m}</span>`).join('') +
      '</div>';
    rows.forEach((r, i) => {
      s += `<div class="k-heatmap-row"><span>${names[i]}</span>`;
      months.forEach((m, j) => {
        const value = r['month' + (j + 1)],
          marker = Math.min(100, (Math.abs(value) / maxValue) * 100),
          label = `${r.label}, ${m} 2026: ${value >= 0 ? '+' : ''}${kr(value)} i afvigelse fra budget.`;
        s += `<button type="button" class="k-heatmap-cell ${value < 0 ? 'is-negative' : ''}" data-heat-label="${esc(label)}" aria-label="${esc(label)}" style="position:relative;overflow:hidden;background:#f6f7f8;color:#535e70;border:1px solid #e4e5e8">${value < 0 ? '−' : '+'}<span aria-hidden="true" style="position:absolute;left:0;bottom:0;height:3px;width:${marker}%;background:${value < 0 ? '#006f71' : '#bc4d30'}"></span></button>`;
      });
      s += '</div>';
    });
    el.innerHTML =
      s +
      '<div class="k-heatmap-label" aria-live="polite">Vælg en måned for at se afvigelsen i kroner.</div>';
    el.querySelectorAll('[data-heat-label]').forEach((button) => {
      const update = () => {
        el.querySelector('.k-heatmap-label').textContent = button.dataset.heatLabel;
      };
      button.addEventListener('focus', update);
      button.addEventListener('pointerenter', update);
      button.addEventListener('click', update);
    });
  }
  function answer(prototype, question) {
    const target = prototype.querySelector('.k-answer');
    if (!target) return;
    target.hidden = false;
    target.querySelector('.k-answer-question').textContent = question;
    const q = question.toLowerCase();
    let text;
    if (/indstillinger|hvilken rolle|min rolle/.test(q))
      text =
        'Visningsprofil: Parthee · AI Program Lead. Aktiv rolle: Direktion. Aktivt område: Skoleområdet. Dette er en visuel prototype; appens eksisterende serverbaserede adgangskontrol ændres ikke.';
    else if (/gemte indsigter/.test(q))
      text =
        'Eksempler på gemte indsigter: Skoleområdets budgetstatus, sammenligning med sidste år og en flerårsprognose. I denne prototype kan du afprøve spørgsmålene via genvejene nedenunder.';
    else if (/tidligere samtaler|seneste samtaler/.test(q))
      text =
        'Dine eksempelsamtaler handler om budgetstatus, sidste års udvikling og prognoser. Den nuværende app bevarer samtaler og deres oprindelige dataversion ved genåbning.';
    else if (/energi|vikar/.test(q) && /hvad|scenari|procent|%/.test(q)) {
      const category = /vikar/.test(q) ? 'substitute' : 'energy',
        match = q.match(/(-?\d+(?:[.,]\d+)?)\s*(?:procent|%)/),
        amount = match
          ? Number(match[1].replace(',', '.'))
          : Number(prototype.querySelector('[data-energy-slider]')?.value || 15);
      const percent = /fald|reduc|mindre/.test(q) ? -Math.abs(amount) : amount;
      if (/energi/.test(q) && /vikar/.test(q))
        text = 'I denne prototype kan du ændre én forudsætning ad gangen. Prøv fx: Hvad hvis energiprisen stiger 15 procent resten af året?';
      else if (!Number.isFinite(percent) || percent < -30 || percent > 50)
        text = 'Prototypens scenarie understøtter ændringer fra −30 % til +50 %. Vælg en ændring i dette interval, eller prøv skyderen under Fremblik.';
      else {
        const delta = effect(category, percent);
        text = `Ved ${percent > 0 ? '+' : ''}${percentFormat.format(percent)} % i ${category === 'energy' ? 'energipris' : 'vikarforbrug'} bliver effekten ${delta >= 0 ? '+' : ''}${kr(delta)} i oktober–december 2026. Kun de simulerede ${category === 'energy' ? 'energiposter' : 'vikarposter'} ændres. Helårsprognosen bliver ${kr(data.budget.metrics[3].value + delta)}.`;
      }
    } else if (/sidste år|forrige år/.test(q))
      text = `Samme måneder i begge år: ${kr(data.year.metrics[0].value)} i 2025 og ${kr(data.year.metrics[1].value)} i 2026. Det er ${kr(data.year.metrics[2].value)} højere (+${dec.format(data.year.metrics[3].value)} %). Afgrænsning: skoleområdet, januar–september.`;
    else if (/kommune|sorø|peer/.test(q))
      text = `Det viste eksempel sammenligner Kalundborg (${kr(data.peer.metrics[0].value)} pr. elev) med Sorø (${kr(data.peer.metrics[1].value)} pr. elev). Begge tal dækker januar–september 2026. Sorø er valgt ud fra simuleret strukturlighed. Sammenligningen siger ikke i sig selv noget om effektivitet.`;
    else if (/prognos|2032|2030|frem/.test(q)) {
      const a =
        prototype.id === 'kaia-fremblik' || /elev/.test(q) ? data.perPupil : data.forecast;
      const requested = q.match(/\b(20\d{2})\b/),
        year = requested ? requested[1] : '2032',
        row = a.chart.rows.find((r) => r.label === year);
      text = row
        ? `Basisforløbet går fra ${kr(a.metrics[0].value)} i 2026 til ${kr(row.base)} i ${year}${a === data.perPupil ? ' pr. elev' : ''}. Lavt/højt er et illustrativt følsomhedsforløb. Talgrundlaget under figuren viser hvert års budget og basis.`
        : 'Prototypens prognoseeksempel dækker 2026–2032. Vælg et år inden for dette interval.';
    } else if (/kild|strateg|beslut|grundlag/.test(q))
      text =
        'Eksemplet knytter budgetopfølgningen til simulerede budgetnotater, strategier og beslutningsreferater. Tallene er beregnet fra det versionsfaste v4-grundlag. I den fungerende app åbner kildehenvisningerne dokument og beregningsgrundlag.';
    else if (/afvig|driver|bidrag|energi/.test(q))
      text = `Samlet merforbrug er ${kr(data.budget.metrics[2].value)}. Løn bidrager med ${kr(data.waterfall.chart.rows[0].value)}, energi med ${kr(data.waterfall.chart.rows[1].value)} og vikarer med ${kr(data.waterfall.chart.rows[2].value)}. Alle bidrag kan ses i figurens tabel.`;
    else if (/budget|regnskab|forbrug|økonomi|skole|overblik|opsummer/.test(q))
      text = `Skoleområdet har et simuleret nettoforbrug på ${kr(data.budget.metrics[1].value)} mod et periodiseret budget på ${kr(data.budget.metrics[0].value)}. Afvigelsen er ${kr(data.budget.metrics[2].value)}. Dette er et lokalt designeksempel; feltet foretager ikke et modelkald.`;
    else
      text =
        'Det spørgsmål er ikke dækket af denne lokale designprototype. Prøv budgetstatus på skoleområdet, samme måneder sidste år, prognosen frem til 2032 eller et energiscenarie. Der foretages ingen modelkald.';
    target.querySelector('.k-answer-body').textContent = text.replace(/kr\.\./g, 'kr.');
  }
  const version =
    data.datasetVersion ||
    data.version ||
    data.budget.assumptions
      .join(' ')
      .match(/KAIA-DEMO-[\w.-]+/)?.[0]
      ?.replace(/\.$/, '') ||
    'Ikke angivet';
  const snapshotKey = 'kaia.design-preview.insights.v1';
  const motionKey = 'kaia.design-preview.reduced-motion.v1';
  const dialog = document.getElementById('preview-dialog');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogBody = document.getElementById('dialog-body');
  const variants = ['overblik', 'fremblik', 'analysebord'];
  let activeDesign = 'overblik';
  let dialogTrigger;

  function activePrototype() {
    return (
      document.getElementById('kaia-' + activeDesign) ||
      root.querySelector('.kaia-prototype:not([hidden])')
    );
  }

  function activateDesign(design, writeUrl = true) {
    if (!variants.includes(design) || !document.getElementById('kaia-' + design))
      design = 'overblik';
    activeDesign = design;
    root.querySelectorAll('.kaia-prototype').forEach((section) => {
      section.hidden = section.id !== 'kaia-' + design;
    });
    document.querySelectorAll('[data-design]').forEach((button) => {
      if (button.dataset.design === design) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (writeUrl) {
      const url = new URL(location.href);
      url.searchParams.set('design', design);
      history.pushState({ design }, '', url);
    }
    requestAnimationFrame(redraw);
  }

  function readSnapshots() {
    try {
      const saved = JSON.parse(localStorage.getItem(snapshotKey) || '[]');
      return Array.isArray(saved)
        ? saved
            .filter(
              (item) =>
                item &&
                typeof item.id === 'string' &&
                typeof item.question === 'string' &&
                typeof item.text === 'string' &&
                typeof item.datasetVersion === 'string' &&
                item.id.length < 120 &&
                item.question.length <= 4000 &&
                item.text.length <= 12000 &&
                item.datasetVersion.length < 120,
            )
            .slice(0, 30)
        : [];
    } catch {
      return [];
    }
  }

  function closeDialog() {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    dialogTrigger?.focus({ preventScroll: true });
  }

  function showDialog(title, html, trigger) {
    if (!dialog || !dialogTitle || !dialogBody) return;
    dialogTrigger = trigger || document.activeElement;
    dialogTitle.textContent = title;
    dialogBody.innerHTML = html;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  }

  function promptList(items) {
    return (
      '<div class="preview-dialog-list">' +
      items
        .map(
          (item) =>
            `<button type="button" class="preview-dialog-prompt" data-prompt="${esc(item.question)}"><strong>${esc(item.title)}</strong><span>${esc(item.detail || 'Skoleområdet · simulerede data')}</span></button>`,
        )
        .join('') +
      '</div>'
    );
  }

  function sourceExcerpt(title, analysis) {
    const ids =
      analysis.chart?.sourceIds || analysis.metrics.flatMap((metric) => metric.sourceIds);
    return `<article class="preview-source"><h3>${esc(title)}</h3><p>${esc(analysis.conclusion || analysis.title)}</p><dl><dt>Beregnings-ID</dt><dd><code>${esc([...new Set(ids)].join(', '))}</code></dd><dt>Dataversion</dt><dd>${esc(version)}</dd><dt>Status</dt><dd>Simuleret økonomisk beregningsgrundlag</dd></dl><table><thead><tr><th scope="col">Nøgletal</th><th scope="col">Værdi</th></tr></thead><tbody>${analysis.metrics.map((metric) => `<tr><th scope="row">${esc(metric.label)}</th><td>${esc(metric.unit === 'ore' ? kr(metric.value) : dec.format(metric.value) + (metric.unit === 'percent' ? ' %' : ''))}</td></tr>`).join('')}</tbody></table></article>`;
  }

  function localView(view, trigger) {
    if (view === 'scenarier') {
      closeDialog();
      activateDesign('fremblik');
      requestAnimationFrame(() => {
        const panel =
          activePrototype()?.querySelector('[data-scenario-panel]') ||
          activePrototype()?.querySelector('.fb-scenario');
        panel?.scrollIntoView({
          behavior:
            root.classList.contains('reduce-motion') ||
            globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
              ? 'instant'
              : 'smooth',
          block: 'center',
        });
        panel?.querySelector('[data-energy-slider]')?.focus({ preventScroll: true });
      });
      return;
    }
    if (view === 'overblik') {
      closeDialog();
      activePrototype()?.querySelector('.k-compose textarea')?.focus({ preventScroll: true });
      return;
    }
    if (view === 'samtaler') {
      showDialog(
        'Samtaler',
        `<p>Tre lokale eksempelsamtaler. Vælg et spørgsmål for at åbne et svar fra det faste datagrundlag.</p>${promptList(
          [
            {
              title: 'Budgetstatus på skoleområdet',
              question: 'Giv mig et overblik over budgetstatus på skoleområdet.',
            },
            {
              title: 'Samme måneder sidste år',
              question: 'Sammenlign op mod sidste års data.',
            },
            { title: 'Udvikling frem mod 2032', question: 'Vis prognosen frem mod 2032.' },
          ],
        )}<p class="preview-dialog-note">Dette er lokale eksempler, ikke samtaler fra en personlig serverkonto.</p>`,
        trigger,
      );
    } else if (view === 'indsigter') {
      const saved = readSnapshots();
      showDialog(
        'Gemte indsigter',
        `<p>Tre forberedte eksempler og dine egne snapshots fra denne browser.</p>${promptList([
          {
            title: 'Skoleområdets budgetopfølgning',
            question: 'Giv mig et overblik over budgetstatus på skoleområdet.',
          },
          {
            title: '2026 sammenlignet med 2025',
            question: 'Sammenlign op mod sidste års data.',
          },
          {
            title: 'Flerårsprognosen',
            question: 'Vis prognosen for udgift pr. elev frem til 2032.',
          },
        ])}<h3>Dine lokale snapshots</h3>${saved.length ? '<div class="preview-dialog-list">' + saved.map((item) => `<button type="button" class="preview-dialog-prompt" data-open-snapshot="${esc(item.id)}"><strong>${esc(item.question)}</strong><span>${esc(item.datasetVersion)} · gemt lokalt</span></button>`).join('') + '</div>' : '<p>Du har ingen egne snapshots endnu. Stil et spørgsmål, og vælg Gem indsigt ved svaret.</p>'}<p class="preview-dialog-note">Snapshots gemmes kun i denne browsers lokale lager. De synkroniseres ikke til appen.</p>`,
        trigger,
      );
    } else if (view === 'indstillinger') {
      showDialog(
        'Indstillinger',
        `<dl><dt>Visningsprofil</dt><dd>Parthee · AI Program Lead</dd><dt>Rolle</dt><dd>Direktion</dd><dt>Adgang</dt><dd>Skoleområdet</dd><dt>Datagrundlag</dt><dd>Simulerede data · ${esc(version)}</dd><dt>Svar</dt><dd>Lokale beregninger · ingen modelkald</dd></dl><label class="preview-motion-setting"><input type="checkbox" data-reduced-motion ${root.classList.contains('reduce-motion') ? 'checked' : ''}> Dæmp bevægelse</label><p class="preview-dialog-note">Dette er prototypens faste præsentationsprofil. Appens Entra-login og serverbaserede adgangsregler ændres ikke her.</p>`,
        trigger,
      );
    } else if (view === 'kilder') {
      showDialog(
        'Kilder og beregningsgrundlag',
        `<p>De økonomiske udsagn nedenfor kommer fra samme versionsfaste JSON som figurerne. Alle kommunale tal er simulerede.</p>${sourceExcerpt('Budgetopfølgning · januar–september 2026', data.budget)}${sourceExcerpt('Samme måneder · 2025 og 2026', data.year)}${sourceExcerpt('Flerårsprognose · 2026–2032', data.forecast)}<article class="preview-source"><h3>Officielle navnekilder</h3><p>Kalundborg Kommunes <a href="https://www.kalundborg.dk/service-and-selvbetjening/boern-unge-and-familie/skoler-sfo-og-uddannelser/folkeskoler" target="_blank" rel="noopener noreferrer">oversigt over folkeskoler</a> dokumenterer institutionsnavne. Den dokumenterer ikke de simulerede budgetter, afvigelser eller beslutninger.</p></article>`,
        trigger,
      );
    } else if (view === 'scope') {
      showDialog(
        'Dit adgangsområde',
        `<p><strong>Rolle: Direktion · Adgang: Skoleområdet.</strong></p><p>Prototypen viser de ${data.budget.context.entityIds.length} skoler i det versionsfaste demoeksempel. Der er ingen mulighed for at give sig selv flere rettigheder i denne prototype.</p><p>Dataversion: <code>${esc(version)}</code>. Alle viste økonomi- og elevtal er simulerede.</p>`,
        trigger,
      );
    } else if (view === 'periode') {
      showDialog(
        'Periode og snapshot',
        `<p><strong>Budget, årssammenligning og kommunebenchmark: januar–september 2026.</strong></p><p>Årssammenligningen bruger præcis januar–september 2025. Flerårsprognosen viser helår fra 2026 til 2032; i 2026 bruges regnskab til september og prognose resten af året.</p><p>Referencedato: 30. september 2026. Dataversion: <code>${esc(version)}</code>.</p><p>Afgrænsningen er fast i dette designeksempel. Der vises ingen filtre, som foregiver at hente et andet datagrundlag.</p>`,
        trigger,
      );
    } else {
      showDialog(
        'Om designprototypen',
        `<p>K.A.I.A. viser her tre designretninger med samme simulerede datagrundlag.</p><p>Spørgsmål besvares med lokale regler og beregninger fra det indlejrede JSON-snapshot. Der foretages ingen AI-modelkald, og denne side ændrer ikke data eller adgang i den fungerende app.</p><p>Energiscenariet afrunder effekten på hver påvirket post i øre, før de summeres. Kun energiudgifter i oktober–december 2026 påvirkes.</p><p>Dataversion: <code>${esc(version)}</code>. Alle kommunale tal og beslutninger er simulerede. Officielle kilder dokumenterer kun navnene.</p>`,
        trigger,
      );
    }
  }

  function runQuestion(prototype, question) {
    if (!prototype || typeof question !== 'string') return;
    question = question.trim().slice(0, 4000);
    if (!question) return;
    const input = prototype.querySelector('.k-compose textarea');
    if (input) input.value = question;
    answer(prototype, question);
    const target = prototype.querySelector('.k-answer');
    if (target) {
      target.dataset.snapshotVersion = version;
      target.querySelector('.k-save-status')?.remove();
      if (!target.querySelector('[data-save-answer]')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.saveAnswer = '';
        button.className = 'k-text-button';
        button.textContent = 'Gem indsigt';
        target.append(button);
      }
    }
  }

  function saveAnswer(button) {
    const target = button.closest('.k-answer') || activePrototype()?.querySelector('.k-answer');
    const question = target?.querySelector('.k-answer-question')?.textContent || '';
    const text = target?.querySelector('.k-answer-body')?.textContent || '';
    if (!target || target.hidden || !question || !text) return;
    let status = target.querySelector('.k-save-status');
    if (!status) {
      status = document.createElement('p');
      status.className = 'k-save-status';
      status.setAttribute('role', 'status');
      target.append(status);
    }
    const snapshots = readSnapshots();
    const datasetVersion = target.dataset.snapshotVersion || version;
    if (
      snapshots.some(
        (item) =>
          item.question === question &&
          item.text === text &&
          item.datasetVersion === datasetVersion,
      )
    ) {
      status.textContent = 'Indsigten er allerede gemt på denne enhed.';
      return;
    }
    try {
      const snapshot = {
        id: crypto.randomUUID(),
        question,
        text,
        datasetVersion,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(snapshotKey, JSON.stringify([snapshot, ...snapshots].slice(0, 30)));
      status.textContent = 'Indsigten er gemt lokalt. Åbn den igen under Gemte indsigter.';
    } catch {
      status.textContent =
        'Browseren kunne ikke gemme indsigten. Det lokale lager kan være deaktiveret eller fyldt.';
    }
  }

  function openSnapshot(id) {
    const snapshot = readSnapshots().find((item) => item.id === id);
    if (!snapshot) return;
    closeDialog();
    const prototype = activePrototype(),
      target = prototype?.querySelector('.k-answer');
    if (!target) return;
    target.hidden = false;
    target.querySelector('.k-answer-question').textContent = snapshot.question;
    target.querySelector('.k-answer-body').textContent = snapshot.text;
    target.dataset.snapshotVersion = snapshot.datasetVersion;
    target.querySelector('.k-save-status')?.remove();
  }

  function exportData(button) {
    const prototype = button.closest('.kaia-prototype') || activePrototype();
    const panel = button.closest('article,.panel,.k-panel,.k-card,[data-chart-panel]');
    const chart =
      panel?.querySelector('.k-forecast,[data-k-forecast]') ||
      (button.dataset.export !== 'all'
        ? prototype?.querySelector('.k-forecast,[data-k-forecast]')
        : null);
    const number = new Intl.NumberFormat('da-DK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
    });
    let rows, suffix;
    if (chart && button.dataset.export !== 'all') {
      const analysis = chart.dataset.metric === 'perPupil' ? data.perPupil : data.forecast;
      const unit = chart.dataset.metric === 'perPupil' ? 'kr. pr. elev' : 'kr.';
      rows = [
        ['Dataversion', version],
        ['Status', 'Simulerede data'],
        ['Afgrænsning', 'Skoleområdet'],
        ['Beregnings-ID', analysis.chart.sourceIds.join(', ')],
        [
          'År',
          `Basis (${unit})`,
          `Helårsbudget (${unit})`,
          `Lavt følsomhedsforløb (${unit})`,
          `Højt følsomhedsforløb (${unit})`,
        ],
        ...analysis.chart.rows.map((row) => [
          row.label,
          ...['base', 'budget', 'low', 'high'].map((key) => number.format(row[key] / 100)),
        ]),
      ];
      suffix = chart.dataset.metric === 'perPupil' ? 'prognose-pr-elev' : 'prognose';
    } else {
      rows = [
        ['Dataversion', version],
        ['Status', 'Simulerede data'],
        ['Afgrænsning', 'Skoleområdet'],
        ['Analyse', 'Periode', 'Nøgletal', 'Værdi', 'Enhed', 'Beregnings-ID'],
      ];
      for (const analysis of Object.values(data).filter(
        (value) => value?.metrics && value?.context,
      )) {
        const period =
          analysis.chart?.subtitle ||
          `${analysis.context.period.fromMonth}–${analysis.context.period.toMonth} ${analysis.context.period.year}`;
        for (const metric of analysis.metrics)
          rows.push([
            analysis.title,
            period,
            metric.label,
            number.format(metric.unit === 'ore' ? metric.value / 100 : metric.value),
            metric.unit === 'ore'
              ? metric.description?.startsWith('kr.')
                ? metric.description
                : 'kr.'
              : metric.unit === 'percent'
                ? '%'
                : 'antal',
            metric.sourceIds.join(', '),
          ]);
        for (const row of analysis.chart?.rows || []) {
          for (const series of analysis.chart.series || []) {
            const value = row[series.key];
            if (typeof value !== 'number') continue;
            const unit =
              analysis.chart.unit === 'ore'
                ? analysis.context.metric === 'perPupil'
                  ? 'kr. pr. elev'
                  : analysis.context.metric === 'perCapita'
                    ? 'kr. pr. indbygger'
                    : 'kr.'
                : analysis.chart.unit === 'percent'
                  ? '%'
                  : 'antal';
            rows.push([
              analysis.chart.title,
              period,
              `${row.label} · ${series.label}`,
              number.format(analysis.chart.unit === 'ore' ? value / 100 : value),
              unit,
              analysis.chart.sourceIds.join(', '),
            ]);
          }
        }
      }
      suffix = 'skoleomraadets-noegletal';
    }
    const csv =
      '\ufeff' +
      rows
        .map((row) =>
          row.map((cell) => '"' + String(cell ?? '').replaceAll('"', '""') + '"').join(';'),
        )
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `KAIA-${suffix}-${version}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  root.querySelectorAll('.k-compose').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      runQuestion(form.closest('.kaia-prototype'), form.querySelector('textarea')?.value);
    });
    form.querySelector('textarea')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        runQuestion(form.closest('.kaia-prototype'), event.target.value);
      }
    });
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button,[data-local-view],[data-design],[data-export]');
    if (!button) return;
    const toolbarAction =
      button.closest('.preview-bar') &&
      (variants.includes(button.dataset.design) || button.dataset.localView === 'om');
    if (!root.contains(button) && !dialog?.contains(button) && !toolbarAction) return;
    if (button.matches('[data-design]')) {
      event.preventDefault();
      activateDesign(button.dataset.design);
    } else if (button.matches('[data-close-dialog]')) {
      event.preventDefault();
      closeDialog();
    } else if (button.matches('[data-local-view]')) {
      event.preventDefault();
      localView(button.dataset.localView, button);
    } else if (button.matches('[data-save-answer]')) {
      event.preventDefault();
      saveAnswer(button);
    } else if (button.matches('[data-open-snapshot]')) {
      event.preventDefault();
      openSnapshot(button.dataset.openSnapshot);
    } else if (button.matches('[data-export]')) {
      event.preventDefault();
      exportData(button);
    } else if (button.matches('[data-close-answer]')) {
      button.closest('.k-answer').hidden = true;
    } else if (button.matches('[data-reset-chat]')) {
      const prototype = button.closest('.kaia-prototype') || activePrototype();
      const answer = prototype.querySelector('.k-answer'),
        input = prototype.querySelector('.k-compose textarea');
      if (answer) answer.hidden = true;
      if (input) {
        input.value = '';
        input.focus({ preventScroll: true });
      }
    } else if (button.matches('[data-prompt]')) {
      event.preventDefault();
      const prototype = button.closest('.kaia-prototype') || activePrototype();
      if (dialog?.contains(button)) closeDialog();
      runQuestion(prototype, button.dataset.prompt);
    } else if (button.matches('.k-submit')) {
      event.preventDefault();
      const form = button.closest('.k-compose');
      if (form)
        runQuestion(form.closest('.kaia-prototype'), form.querySelector('textarea')?.value);
    }
  });

  let reduceMotion =
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  try {
    const stored = localStorage.getItem(motionKey);
    if (stored !== null) reduceMotion = reduceMotion || stored === 'true';
  } catch {
    /* System preference remains active. */
  }
  root.classList.toggle('reduce-motion', reduceMotion);
  dialog?.addEventListener('change', (event) => {
    if (!event.target.matches('[data-reduced-motion]')) return;
    const effective =
      event.target.checked ||
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      false;
    event.target.checked = effective;
    root.classList.toggle('reduce-motion', effective);
    try {
      localStorage.setItem(motionKey, String(event.target.checked));
    } catch {
      /* The setting still applies to the open page. */
    }
  });

  root.querySelectorAll('[data-energy-slider]').forEach((slider) => {
    const section = slider.closest('.kaia-prototype');
    const update = () => {
      const percent = Number(slider.value),
        delta = effect('energy', percent),
        baseline = data.budget.metrics[3].value;
      const set = (selector, text) =>
        section.querySelectorAll(selector).forEach((element) => {
          element.textContent = text;
        });
      set('[data-energy-value]', (percent > 0 ? '+' : '') + percent + ' %');
      set(
        '[data-energy-delta]',
        (delta > 0 ? '+' : '') + dec.format(delta / 100000000) + ' mio. kr.',
      );
      set('[data-energy-total]', dec.format((baseline + delta) / 100000000) + ' mio. kr.');
      set('[data-scenario-baseline]', dec.format(baseline / 100000000) + ' mio. kr.');
      section.querySelectorAll('[data-baseline-bar]').forEach((bar) => {
        bar.style.width =
          Math.max(0, Math.min(100, (baseline / (baseline + effect('energy', 50))) * 100)) +
          '%';
      });
      section.querySelectorAll('[data-scenario-bar]').forEach((bar) => {
        bar.style.width =
          Math.max(
            0,
            Math.min(100, ((baseline + delta) / (baseline + effect('energy', 50))) * 100),
          ) + '%';
      });
      const action = section.querySelector('.fb-scenario-action');
      if (action)
        action.dataset.prompt = `Hvad sker der, hvis energiprisen ${percent < 0 ? 'falder' : 'stiger'} ${Math.abs(percent)} procent på skoleområdet resten af året?`;
    };
    slider.addEventListener('input', update);
    section.querySelector('[data-reset-scenario]')?.addEventListener('click', () => {
      slider.value = '0';
      update();
    });
    update();
  });

  function redraw() {
    root
      .querySelectorAll(
        '.kaia-prototype:not([hidden]) .k-forecast,.kaia-prototype:not([hidden]) [data-k-forecast]',
      )
      .forEach(lineChart);
    root.querySelectorAll('.kaia-prototype:not([hidden]) .k-waterfall').forEach(waterfall);
  }
  root.querySelectorAll('.k-heatmap').forEach(heatmap);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries)
        if (entry.contentRect.width > 0) {
          if (entry.target.matches('.k-forecast,[data-k-forecast]')) lineChart(entry.target);
          else waterfall(entry.target);
        }
    });
    root
      .querySelectorAll('.k-forecast,[data-k-forecast],.k-waterfall')
      .forEach((element) => observer.observe(element));
  } else globalThis.addEventListener('resize', redraw);
  globalThis.addEventListener('popstate', () =>
    activateDesign(new URL(location.href).searchParams.get('design') || 'overblik', false),
  );
  activateDesign(new URL(location.href).searchParams.get('design') || 'overblik', false);
  document.fonts?.ready.then(redraw);
})();
