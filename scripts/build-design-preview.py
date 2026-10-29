"""Build the isolated, public design study from a fixed synthetic analysis snapshot."""
from pathlib import Path
import json
import re
import shutil
import sys

root = Path(__file__).resolve().parents[1]
output = root / 'public/design-preview'
data = json.loads((root / 'design/prototypes/data.json').read_text())

def number(value, decimals=0):
    text = f'{value:,.{decimals}f}'
    return text.replace(',', '_').replace('.', ',').replace('_', '.')

def signed(value, decimals=0):
    return ('+' if value >= 0 else '−') + number(abs(value), decimals)

peers = data['peer']['chart']['rows']
peer_delta = (peers[0]['value'] / peers[1]['value'] - 1) * 100
peer_amount = peers[1]['value'] - peers[0]['value']
peer_reverse = peer_amount / peers[0]['value'] * 100

brand = '<span class="k-brand"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M6 29 16 9l8 15 10-13M6 29l18-5 10 7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="6" cy="29" r="3" fill="currentColor"/><circle cx="16" cy="9" r="3" fill="currentColor"/><circle cx="24" cy="24" r="3" fill="currentColor"/><circle cx="34" cy="11" r="3" fill="currentColor"/><circle cx="34" cy="31" r="3" fill="currentColor"/></svg><span>K.A.I.A.</span></span>'
profile = '<div class="profile"><span class="avatar">PV</span><div><strong>Parthee</strong><span>AI Program Lead</span></div></div>'
statuses = '<div class="statuses"><span class="data-status"><i></i>Simulerede data</span><span class="engine-status"><i></i>Demo</span></div>'
scope = '<div class="scope-row"><button data-local-view="scope">{icon:buildings}<span>Skoleområdet</span>{icon:caret-down}</button><button data-local-view="periode">{icon:calendar-blank}<span>Januar–september 2026</span></button><span class="snapshot">Snapshot · 30. september 2026</span></div>'
chat = '''<div class="chat-area"><form class="k-compose" aria-label="Spørg K.A.I.A."><textarea aria-label="Hvad vil du gerne vide om kommunen?" placeholder="Hvad vil du gerne vide om kommunen?" rows="2" maxlength="2000"></textarea><div class="k-compose-foot"><span>{icon:shield-check}Skoleområdet · dit aktive adgangsområde</span><button class="k-submit" type="button">Undersøg {icon:arrow-up-right}</button></div></form><div class="k-answer" role="status" aria-live="polite" hidden><div class="k-answer-label"><span>K.A.I.A. · Simuleret analyse</span><button data-close-answer aria-label="Luk eksempelsvar">{icon:x}</button></div><p class="k-answer-question"></p><p class="k-answer-body"></p><div class="answer-actions"><button data-local-view="kilder">{icon:files} Se grundlag</button><button data-save-answer>{icon:bookmark-simple} Gem indsigt</button><span>KAIA-DEMO-2026.09-v4</span></div></div></div>'''
questions = [
    ('Sammenlign med sidste år', 'Samme periode i 2025 og 2026', 'Sammenlign med sidste års data'),
    ('Se frem mod 2032', 'Budget, basis og følsomhed', 'Vis prognosen frem til 2032'),
    ('Sammenlign kommuner', 'Et simuleret blik på Sorø', 'Sammenlign med en sammenlignelig kommune'),
    ('Forstå afvigelsen', 'Find de største bidrag', 'Hvilke typer udgifter bidrager mest til afvigelsen?'),
]
shortcuts = '<div class="shortcuts">' + ''.join(f'<button data-prompt="{question}"><div><strong>{title}</strong><span>{subtitle}</span></div>{{icon:arrow-up-right}}</button>' for title, subtitle, question in questions) + '</div>'
stats = '<div class="stats">' + ''.join([
    f'<button data-prompt="Giv mig et overblik over budgetstatus på skoleområdet"><span>Forbrug til dato</span><strong>{number(data["budget"]["metrics"][1]["value"]/100000000,1)} <small>mio. kr.</small></strong><p><b>+{number(data["year"]["metrics"][3]["value"],1)} %</b> mod samme periode i 2025</p></button>',
    f'<button data-prompt="Hvilke typer udgifter bidrager mest til afvigelsen?"><span>Afvigelse fra budget</span><strong>+{number(data["budget"]["metrics"][2]["value"]/100000000,1)} <small>mio. kr.</small></strong><p><b>Merforbrug</b> · periodiseret budget</p></button>',
    f'<button data-prompt="Sammenlign med en sammenlignelig kommune"><span>Udgift pr. elev</span><strong>{number(data["peer"]["metrics"][0]["value"]/100)} <small>kr.</small></strong><p><b class="petrol">{signed(peer_delta,1)} %</b> mod simuleret Sorø</p></button>',
]) + '</div>'
compare = '<div class="k-compare">' + ''.join(f'<div class="k-peer-row"><div><span>{row["label"]}</span><strong>{number(row["value"]/100)} <small>kr.</small></strong></div><div class="k-peer-track"><div class="k-peer-fill" style="width:{row["value"]/max(r["value"] for r in peers)*90:.3f}%"></div></div></div>' for row in peers) + f'<div class="k-peer-delta">{signed(peer_delta,1)} % <span>Kalundborg i forhold til Sorø</span></div></div>'
peer_table = '<table class="k-municipality-table"><thead><tr><th>Kommune</th><th>Kr. pr. elev</th><th>Forskel til Kalundborg</th><th></th></tr></thead><tbody>' + ''.join(f'<tr><td><strong>{row["label"]}</strong><small>{"Dit område" if index == 0 else "Simuleret strukturlighed · 88,5 / 100"}</small></td><td>{number(row["value"]/100)} kr.</td><td>{"—" if index == 0 else signed(peer_amount/100)+" kr. / "+signed(peer_reverse,1)+" %"}</td><td><button class="icon-button" data-prompt="Sammenlign med en sammenlignelig kommune" aria-label="Undersøg {row["label"]}">{{icon:arrow-up-right}}</button></td></tr>' for index, row in enumerate(peers)) + '</tbody></table>'
footer = '<footer class="app-footer"><span>K.A.I.A. <i></i> Overblik, du kan undersøge.</span><button data-local-view="om">Designprototype · version 02</button></footer>'
html = (root / 'design/prototypes/template.html').read_text()
for name, value in {'brand':brand, 'profile':profile, 'statuses':statuses, 'scope':scope, 'chat':chat, 'shortcuts':shortcuts, 'stats':stats, 'compare':compare, 'peerTable':peer_table, 'footer':footer, 'pupil2026':number(data['perPupil']['chart']['rows'][0]['base']/100), 'pupil2032':number(data['perPupil']['chart']['rows'][-1]['base']/100), 'data':json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')}.items():
    html = html.replace('{{'+name+'}}',value)

def icon(match):
    name = match.group(1)
    svg = (output / f'icons/{name}.svg').read_text()
    svg = re.sub(r'<\?xml[^>]*>', '', svg)
    svg = re.sub(r'width="[^"]*"|height="[^"]*"', '', svg)
    return svg.replace('<svg ', '<svg class="icon" aria-hidden="true" ',1)

html = re.sub(r'\{icon:([a-z-]+)\}',icon,html)
assert '{{' not in html and '{icon:' not in html
assert len(re.findall('class="k-compose"',html)) == 3
assert html.count('class="shortcuts"') == 3
(output / 'index.html').write_text(html)
(output / 'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="white"/><path d="M6 29 16 9l8 15 10-13M6 29l18-5 10 7" stroke="#bc4d30" stroke-width="2" fill="none"/><g fill="#bc4d30"><circle cx="6" cy="29" r="3"/><circle cx="16" cy="9" r="3"/><circle cx="24" cy="24" r="3"/><circle cx="34" cy="11" r="3"/><circle cx="34" cy="31" r="3"/></g></svg>')
print(f'Design preview built: {len(html.encode()):,} bytes, three variants, v4 synthetic snapshot.')

if '--stage' in sys.argv:
    stage = root / '.local/design-deploy'
    stage.mkdir(parents=True, exist_ok=True)
    for source in output.rglob('*'):
        if source.is_file():
            target = stage / source.relative_to(output)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    shutil.copyfile(root / 'design/prototypes/vercel.json', stage / 'vercel.json')
    (stage / 'robots.txt').write_text('User-agent: *\nDisallow: /\n')
    print('Static deployment staged without application code or environment files.')
