#!/usr/bin/env python3
"""Build the static library, reviewed CSVs and documentation using the standard library."""
import argparse, csv, io, json, pathlib, html, re
from collections import Counter
ROOT=pathlib.Path(__file__).resolve().parents[1]
CONTENT=ROOT/'content'; DIST=ROOT/'dist'
parser=argparse.ArgumentParser(); parser.add_argument('--import-catalogue',action='store_true',help='Import data.js after the legacy research rebuild, before applying the review overlay'); args=parser.parse_args()
if args.import_catalogue:
 s=(DIST/'data.js').read_text(); data=json.loads(s[s.index('['):s.rindex(']')+1])
 (CONTENT/'catalogue.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
records=json.loads((CONTENT/'catalogue.json').read_text()); reviews=json.loads((CONTENT/'review.json').read_text())
assert len({r['evaluation_id'] for r in records})==len(records),'Duplicate IDs'
assert set(reviews)=={r['evaluation_id'] for r in records},'Review every record before publishing'
allowed_cases={'Strategic','Economic','Commercial','Financial','Management'}
for r in records:
 review=reviews[r['evaluation_id']]
 assert set(review['criteria_results'])=={f'C{i}' for i in range(1,9)}
 assert set(review['business_case_uses'])<=allowed_cases and review['business_case_uses']
 assert review['selection_status'] in ['Include','Include with limits','Hold','Exclude']
 assert all(review[k] for k in ['decision_use','transfer_boundary','selection_reason','uk_mod_relevance','topics'])
 assert all(x in reviews and x!=r['evaluation_id'] for x in review['related_records'])
 r.update(review)
 r.setdefault('evidence_access_basis','Full PDF; summary evidence and cited pages consulted')
 if not r.get('evidence_locator'):
  r['evidence_locator']='; '.join(k.replace('_',' ').title()+': PDF '+', '.join(map(str,v)) for k,v in r.get('refs',{}).items() if v)
# Publish only records that passed screening without a conditional decision.
records = [r for r in records if r['selection_status'] == 'Include']
published_ids = {r['evaluation_id'] for r in records}
for r in records:
 r['related_records'] = [id for id in r['related_records'] if id in published_ids]
DIST.mkdir(exist_ok=True)
(DIST/'data.js').write_text('window.EVALUATIONS = '+json.dumps(records,ensure_ascii=False,indent=2)+';\n')
def flat(value):
 if isinstance(value,list):return '; '.join(map(str,value))
 if isinstance(value,dict):return '; '.join(f'{k}: {v}' for k,v in value.items())
 return '' if value is None else value
def csv_text(rows,fields):
 out=io.StringIO(newline=''); writer=csv.DictWriter(out,fieldnames=fields,extrasaction='ignore');writer.writeheader()
 for r in rows:writer.writerow({k:flat(r.get(k,'')) for k in fields})
 value='\ufeff'+out.getvalue();assert len(list(csv.DictReader(io.StringIO(value.lstrip('\ufeff')))))==len(rows)
 return value
review_fields=['selection_status','selection_reason','criteria_results','review_date','review_basis','evidence_type','evidence_family','business_case_uses','topics','decision_use','transfer_boundary','relevance_basis','access_level','review_action','related_records']
rows=[]
for r in records:
 row=dict(r);row['scope_notes']=r['note'];row['catalogue_origin']=r.get('catalogue_origin','Original supplied seed');row['source_title_as_published']=r.get('source_title_as_published',r['source_title'])
 for key,val in r.get('refs',{}).items():row[('question' if key=='question' else key)+'_pdf_pages']=', '.join(map(str,val))
 rows.append(row)
for name in ['evaluation_summaries','evaluation_sources']:
 fields=json.loads((CONTENT/f'{name}-fields.json').read_text())
 fields=list(dict.fromkeys(fields+review_fields+['uk_mod_relevance','evidence_access_basis','evidence_locator']))
 value=csv_text(rows,fields);(DIST/f'{name}.csv').write_text(value,encoding='utf-8',newline='')
 out=ROOT.parent/'outputs'
 if out.is_dir():(out/f'{name}.csv').write_text(value,encoding='utf-8',newline='')
review_csv=csv_text(rows,['evaluation_id','source_title','source_page_url']+review_fields)
(DIST/'content_review.csv').write_text(review_csv,encoding='utf-8',newline='')
if (ROOT.parent/'outputs').is_dir():(ROOT.parent/'outputs/content_review.csv').write_text(review_csv,encoding='utf-8',newline='')
esc=lambda s:html.escape(str(s),quote=True)
counts=Counter(r['selection_status'] for r in records)
table=''.join(f'''<tr id="{r['evaluation_id']}"><td><a href="../evaluation.html?id={r['evaluation_id']}">{r['evaluation_id']}</a><br><strong>{esc(r['source_title'])}</strong><br><span class="muted">{esc(r['evidence_type'])}</span></td><td><span class="badge {'limited' if r['selection_status']=='Include with limits' else ''}">{esc(r['selection_status'])}</span><p>{esc(r['selection_reason'])}</p><small>{esc(flat(r['criteria_results']))}</small></td><td><p>{esc(r['decision_use'])}</p><p class="muted">{esc(r['transfer_boundary'])}</p></td></tr>''' for r in records)
pages=[('index','About this library'),('selection-criteria','Selection criteria'),('content-review','Content review'),('using-evidence','Using the evidence'),('design-decisions','Design decisions'),('maintenance','Maintaining the library')]
favicon=re.search(r'<link rel="icon"[^>]+>',(DIST/'index.html').read_text()).group(0)
for slug,title in pages:
 content=(ROOT/'docs'/f'{slug}.html').read_text().replace('{{REVIEW_ROWS}}',table).replace('{{RECORD_COUNT}}',str(len(records))).replace('{{INCLUDE_COUNT}}',str(counts['Include'])).replace('{{LIMIT_COUNT}}',str(counts['Include with limits']))
 nav=''.join(f'<a href="{s}.html"'+(' aria-current="page"' if slug==s else '')+f'>{t}</a>' for s,t in pages)
 page=f'''<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(title)} · Library documentation</title><meta name="description" content="Selection policy, content review and design decisions for the Defence Evaluation Library.">{favicon}<link rel="stylesheet" href="../styles.css"></head><body data-page="docs"><a class="skip-link" href="#main">Skip to content</a><header class="masthead"><div class="header-inner"><a class="brand" href="../index.html"><span class="brand-mark" aria-hidden="true">E</span><span>DEFENCE EVIDENCE<span class="brand-sub">Evaluation library</span></span></a><nav aria-label="Main"><a href="../index.html">Evidence library</a><a href="index.html" aria-current="page">Documentation</a></nav></div></header><div class="docs-layout container"><aside class="docs-nav"><p class="eyebrow">LIBRARY HANDBOOK</p><nav aria-label="Documentation">{nav}</nav><p class="muted">Version 1.0<br>17 September 2026</p></aside><main id="main" class="prose"><p class="eyebrow">DOCUMENTATION</p><h1>{esc(title)}</h1>{content}<footer><a href="../index.html">← Back to the evidence library</a><span>Editorial policy · v1.0</span></footer></main></div></body></html>'''
 (DIST/'docs').mkdir(exist_ok=True);(DIST/'docs'/f'{slug}.html').write_text(page)
print(json.dumps({'records':len(records),'selection':dict(counts),'docs_pages':len(pages),'csv_round_trip':'passed'}))
