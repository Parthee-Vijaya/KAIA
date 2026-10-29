/** Presentation only: preserve original analyses, source identities and exports. */
export function displayText(text: string): string {
  const displayed = text
    .replace(/\bSIMULERET MATERIALE\.\s*/giu, '')
    .replace(/\bSIMULEREDE TAL\.\s*/giu, '')
    .replace(
      /Navne er virkelige, mens tal, egenskaber og alle beskrivelser af beslutninger er fiktive\.\s*/giu,
      '',
    )
    .replace(/Navne er virkelige; alle tal, egenskaber og beslutninger er fiktive\.\s*/giu, '')
    .replace(/(?:[·|]\s*)?(?:simulerede|syntetiske|fiktive)\s+data(?=\s*(?:[·|]|$))/giu, '')
    .replace(
      /Alle kommunale tal(?:, elevtal og dokumenters beslutninger)? er simulerede\.\s*/giu,
      '',
    )
    .replace(/Kommunernes økonomi og struktur er simulerede\.\s*/giu, '')
    .replace(/Alle beslutninger og tal i dokumenterne er fiktive\.\s*/giu, '')
    .replace(
      /Alle økonomi-, elev-, befolknings- og strukturværdier for samtlige kommuner er simulerede\.\s*/giu,
      '',
    )
    .replace(
      /Alle kommunale budgetter, regnskaber, beslutninger og demografital i K\.A\.I\.A\. er simulerede\.\s*/giu,
      '',
    )
    .replace(
      /disse er simulerede og har særskilte demokilder/giu,
      'disse har særskilte beregningskilder',
    )
    .replace(/\(\s*(?:simuleret|simulerede|syntetisk(?:e|t)?|fiktiv(?:e|t)?)\s*\)/giu, '')
    .replace(
      /\b(simuleret|simulerede|syntetisk(?:e|t)?|fiktiv(?:e|t)?)\b(?:\s*,\s*|\s+)(?=\p{L})(?!(?:og|eller|men|som|fordi|derfor)\b)/giu,
      '',
    )
    .replace(/\bdemo(?=budget|dokument|organisation|kilde|materiale|data|tal|beslutning)/giu, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\bkr\.\.(?=\s|$)/g, 'kr.')
    .replace(/\b(er|forbliver)\s*,\s*/giu, '$1 ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*[·|]\s*(?=[·|]|$)/g, '')
    .replace(/^\s*[·|]\s*/g, '')
    .trim();
  return /^[A-ZÆØÅ]/u.test(text.trim()) && /^[a-zæøå]/u.test(displayed)
    ? displayed[0].toLocaleUpperCase('da-DK') + displayed.slice(1)
    : displayed;
}
