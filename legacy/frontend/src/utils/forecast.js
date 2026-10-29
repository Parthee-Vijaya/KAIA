/**
 * BudgetIndsigt -- Prognosefunktioner
 *
 * Beregner mekaniske prognoser baseret på forbrug ift. foregående år.
 * Bruges til budgetovervågning og afvigelsesanalyse i kommunale budgetter.
 *
 * Alle beløb antages at være i hele kroner.
 * Månedlige arrays har indeks 0 = januar, 11 = december.
 */

// ============================================================
// calculateYTD -- År-til-dato kumuleret sum
// ============================================================

/**
 * Beregner den kumulative sum op til den seneste måned med data.
 * Stopper ved første null/undefined værdi (= måned endnu ikke afsluttet).
 *
 * @param {Array<number|null>} monthlyData - Array med 12 månedlige værdier
 * @returns {{ total: number, months: number }} Kumuleret sum og antal måneder medregnet
 *
 * @example
 * calculateYTD([100, 200, 150, null, null, ...])
 * // { total: 450, months: 3 }
 */
export function calculateYTD(monthlyData) {
  if (!Array.isArray(monthlyData) || monthlyData.length === 0) {
    return { total: 0, months: 0 };
  }

  let total = 0;
  let months = 0;

  for (let i = 0; i < monthlyData.length; i++) {
    const value = monthlyData[i];
    // Stop ved null, undefined eller NaN -- måneden er ikke afsluttet
    if (value == null || isNaN(value)) {
      break;
    }
    total += value;
    months += 1;
  }

  return { total, months };
}

// ============================================================
// calculateMechanicalForecast -- Mekanisk helårsprognose
// ============================================================

/**
 * Beregner en mekanisk helårsprognose ud fra forholdet mellem
 * indeværende års forbrug og sidste års forbrug på samme tidspunkt.
 *
 * Formel: prognose = sidsteÅrTotal * (indeværendeYTD / sidsteÅrYTD)
 *
 * Denne metode bevarer sæsonmønstre fra sidste år og korrigerer
 * proportionelt baseret på årets faktiske udvikling.
 *
 * @param {Array<number|null>} currentYearData - Indeværende års månedlige data
 * @param {Array<number|null>} lastYearData - Sidste års månedlige data (fuldt år)
 * @param {number} lastYearTotal - Sidste års samlede årsresultat
 * @returns {{ forecast: number, ratio: number, ytdCurrent: number, ytdLastYear: number, monthsUsed: number }}
 *
 * @example
 * const current = [110, 220, 165, null, null, null, null, null, null, null, null, null];
 * const lastYear = [100, 200, 150, 180, 120, 140, 130, 160, 170, 190, 150, 110];
 * const lastYearTotal = 1800;
 *
 * calculateMechanicalForecast(current, lastYear, lastYearTotal)
 * // { forecast: 1980, ratio: 1.1, ytdCurrent: 495, ytdLastYear: 450, monthsUsed: 3 }
 */
export function calculateMechanicalForecast(currentYearData, lastYearData, lastYearTotal) {
  const current = calculateYTD(currentYearData);
  const lastYearSamePeriod = calculateYTD(
    lastYearData.slice(0, current.months)
  );

  // Sikkerhedscheck -- undgå division med nul
  if (lastYearSamePeriod.total === 0 || current.months === 0) {
    return {
      forecast: lastYearTotal,
      ratio: 1,
      ytdCurrent: current.total,
      ytdLastYear: 0,
      monthsUsed: current.months,
    };
  }

  // Beregn forbrugsfaktor: hvordan ligger vi ift. samme periode sidste år
  const ratio = current.total / lastYearSamePeriod.total;

  // Fremskriv hele året med denne faktor
  const forecast = Math.round(lastYearTotal * ratio);

  return {
    forecast,
    ratio,
    ytdCurrent: current.total,
    ytdLastYear: lastYearSamePeriod.total,
    monthsUsed: current.months,
  };
}

// ============================================================
// calculateDeviation -- Afvigelse fra budget
// ============================================================

/**
 * Beregner afvigelse mellem prognose og budget.
 * Returnerer beløb, procent og en statusklassifikation.
 *
 * Statusregler:
 *   - 'ok':      afvigelse <= 2%
 *   - 'warning': afvigelse > 2% og <= 5%
 *   - 'danger':  afvigelse > 5%
 *
 * @param {number} forecast - Forventet helårsresultat
 * @param {number} budget - Vedtaget budget
 * @returns {{ amount: number, percent: number, status: 'ok'|'warning'|'danger' }}
 *
 * @example
 * calculateDeviation(10500000, 10000000)
 * // { amount: 500000, percent: 5.0, status: 'danger' }
 *
 * calculateDeviation(9900000, 10000000)
 * // { amount: -100000, percent: -1.0, status: 'ok' }
 */
export function calculateDeviation(forecast, budget) {
  if (budget == null || budget === 0 || isNaN(budget)) {
    return { amount: 0, percent: 0, status: 'ok' };
  }

  if (forecast == null || isNaN(forecast)) {
    return { amount: 0, percent: 0, status: 'ok' };
  }

  const amount = forecast - budget;
  const percent = (amount / Math.abs(budget)) * 100;
  const absPercent = Math.abs(percent);

  let status;
  if (absPercent <= 2) {
    status = 'ok';
  } else if (absPercent <= 5) {
    status = 'warning';
  } else {
    status = 'danger';
  }

  return {
    amount: Math.round(amount),
    percent: Math.round(percent * 10) / 10, // 1 decimal
    status,
  };
}

// ============================================================
// generateForecastSeries -- Dataserie til Recharts
// ============================================================

/**
 * Genererer en array med 12 måneder til brug i Recharts line/area-chart.
 * Hvert element indeholder:
 *   - month: Dansk månedsnavn (forkortet)
 *   - actual: Faktisk forbrug (null hvis måneden ikke er afsluttet)
 *   - projected: Fremskrevet værdi baseret på sidste års mønster
 *   - lastYear: Sidste års faktiske forbrug
 *
 * For afsluttede måneder vises 'actual' = faktisk værdi.
 * For fremtidige måneder beregnes 'projected' ud fra sidste års
 * sæsonfordeling ganget med indeværende års vækstfaktor.
 *
 * @param {Array<number|null>} currentYearData - Indeværende års data (12 elementer)
 * @param {Array<number|null>} lastYearData - Sidste års data (12 elementer)
 * @param {number} lastYearTotal - Sidste års total
 * @returns {Array<{ month: string, actual: number|null, projected: number|null, lastYear: number }>}
 */
export function generateForecastSeries(currentYearData, lastYearData, lastYearTotal) {
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
  ];

  // Find antal afsluttede måneder i indeværende år
  const { months: completedMonths, total: currentYTD } = calculateYTD(currentYearData);

  // Beregn vækstfaktor
  const lastYearYTD = calculateYTD(lastYearData.slice(0, completedMonths)).total;
  const ratio = lastYearYTD > 0 ? currentYTD / lastYearYTD : 1;

  return MONTHS.map((month, i) => {
    const lastYearValue = lastYearData[i] != null ? lastYearData[i] : 0;

    if (i < completedMonths) {
      // Afsluttet måned -- vis faktisk forbrug
      return {
        month,
        actual: currentYearData[i],
        projected: null,
        lastYear: lastYearValue,
      };
    }

    // Fremtidig måned -- fremskriv baseret på sidste års sæsonfordeling
    const projectedValue = Math.round(lastYearValue * ratio);

    // For den første projicerede måned inkluderer vi den sidste
    // faktiske værdi som overlap-punkt for en sammenhængende linje
    if (i === completedMonths && completedMonths > 0) {
      return {
        month,
        actual: null,
        projected: projectedValue,
        lastYear: lastYearValue,
        // Bruges til at tegne forbindelse fra faktisk til projiceret
        bridgeFrom: currentYearData[i - 1],
      };
    }

    return {
      month,
      actual: null,
      projected: projectedValue,
      lastYear: lastYearValue,
    };
  });
}

// ============================================================
// calculateBudgetEffect -- Budgeteffekt af befolkningsafvigelse
// ============================================================

/**
 * Estimerer den budgetmæssige effekt af en befolkningsafvigelse.
 *
 * Bruges typisk til at vurdere konsekvenser af demografiske ændringer
 * på udgiftsområder med enhedsomkostninger (f.eks. ældrepleje pr. borger,
 * skoleudgift pr. elev).
 *
 * Eksempel: Hvis der er 50 flere ældre end forventet og udgiften
 * pr. ældre borger er 85.000 kr., så er merudgiften 4.250.000 kr.
 *
 * @param {number} populationDeviation - Afvigelse i antal personer (positiv = flere end forventet)
 * @param {number} perCapitaCost - Udgift pr. person i kroner
 * @returns {{
 *   totalEffect: number,
 *   isExpense: boolean,
 *   description: string
 * }}
 *
 * @example
 * calculateBudgetEffect(50, 85000)
 * // {
 * //   totalEffect: 4250000,
 * //   isExpense: true,
 * //   description: "50 flere borgere x 85.000 kr. = 4,3 mio. kr. i merudgift"
 * // }
 *
 * calculateBudgetEffect(-30, 65000)
 * // {
 * //   totalEffect: -1950000,
 * //   isExpense: false,
 * //   description: "30 færre borgere x 65.000 kr. = 2,0 mio. kr. i mindreudgift"
 * // }
 */
export function calculateBudgetEffect(populationDeviation, perCapitaCost) {
  if (
    populationDeviation == null || isNaN(populationDeviation) ||
    perCapitaCost == null || isNaN(perCapitaCost)
  ) {
    return {
      totalEffect: 0,
      isExpense: false,
      description: 'Utilstrækkelige data til beregning',
    };
  }

  const totalEffect = Math.round(populationDeviation * perCapitaCost);
  const isExpense = totalEffect > 0;
  const absDeviation = Math.abs(populationDeviation);
  const absEffect = Math.abs(totalEffect);

  // Formater beløb til læsbar tekst
  const formattedCost = Math.abs(perCapitaCost).toLocaleString('da-DK');
  let formattedEffect;
  if (absEffect >= 1_000_000) {
    formattedEffect = `${(absEffect / 1_000_000).toFixed(1).replace('.', ',')} mio. kr.`;
  } else {
    formattedEffect = `${absEffect.toLocaleString('da-DK')} kr.`;
  }

  const direction = isExpense ? 'flere' : 'færre';
  const type = isExpense ? 'merudgift' : 'mindreudgift';

  const description = `${absDeviation} ${direction} borgere x ${formattedCost} kr. = ${formattedEffect} i ${type}`;

  return {
    totalEffect,
    isExpense,
    description,
  };
}
