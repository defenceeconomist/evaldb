#!/usr/bin/env python3
"""Validate curation and generated artifacts without external dependencies."""
import csv,json,pathlib,re
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
from collections import Counter
ROOT=pathlib.Path(__file__).resolve().parents[1];dist=ROOT/'dist'
s=(dist/'data.js').read_text();records=json.loads(s[s.index('['):s.rindex(']')+1]);baseline=json.loads((ROOT/'content/catalogue.json').read_text());reviews=json.loads((ROOT/'content/review.json').read_text())
assert len(records)==28
assert len({r['evaluation_id'] for r in records})==28
assert len({r['source_page_url'] for r in records})==28
assert Counter(r['selection_status'] for r in records)=={'Include':28}
assert {r['evaluation_id'] for r in records} == {r['evaluation_id'] for r in baseline if reviews[r['evaluation_id']]['selection_status'] == 'Include'}
baseline = [r for r in baseline if reviews[r['evaluation_id']]['selection_status'] == 'Include']
for r,b in zip(records,baseline):
 assert r['evaluation_id']==b['evaluation_id']
 for k in ['source_title','evaluation_question','methods','findings','recommendations','conclusions','transferable_lesson','refs','source_page_url','source_file_url']:assert r.get(k)==b.get(k),(r['evaluation_id'],k)
 for k in ['decision_use','transfer_boundary','uk_mod_relevance','evidence_type','evidence_locator','evidence_access_basis']:assert r[k].strip(),(r['evaluation_id'],k)
 assert len(r['decision_use'].split())<=35
 assert all(urlsplit(r[k]).scheme in ['https','http'] for k in ['source_page_url','source_file_url'])
 assert set(r['criteria_results'])=={f'C{i}' for i in range(1,9)}
 assert ('Conditional' in r['criteria_results'].values())==(r['selection_status']=='Include with limits')
 for pages in r.get('refs',{}).values():assert all(isinstance(p,int) and 0<p<=r['pdf_page_count'] for p in pages)
 assert len(r['business_case_uses']) and len(r['topics'])
assert all(set(r['related_records']) <= {x['evaluation_id'] for x in records} for r in records)
for name in ['evaluation_summaries','evaluation_sources','content_review']:
 with (dist/f'{name}.csv').open(encoding='utf-8-sig',newline='') as f: rows=list(csv.DictReader(f))
 assert len(rows)==28 and len({r['evaluation_id'] for r in rows})==28
 for row,record in zip(rows,records):
  for key in ['decision_use','selection_status','transfer_boundary','evidence_type']:assert row[key]==record[key]
 parent=ROOT.parent/'outputs'/f'{name}.csv'
 if parent.exists():assert parent.read_bytes()==(dist/f'{name}.csv').read_bytes()
 if name=='evaluation_summaries':
  for row,record in zip(rows,records):
   for key in ['methods','findings','recommendations','source_page_url','source_file_url','evidence_access_basis']:assert row[key]==record[key]
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.ids=[]
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if 'id' in attrs:self.ids.append(attrs['id'])
  for a in ['src','href']:
   if a in attrs:self.links.append(attrs[a])
parsed={}
for path in dist.rglob('*.html'):
 p=Links();p.feed(path.read_text());assert len(set(p.ids))==len(p.ids),path;parsed[path.resolve()]=p
for path,p in parsed.items():
 for link in p.links:
  parts=urlsplit(link)
  if parts.scheme or parts.netloc:continue
  target=(path.parent/unquote(parts.path)).resolve() if parts.path else path
  if target==dist.parent:continue # existing portal link
  if target.is_dir():target=target/'index.html'
  assert target.exists(),(path,link)
  if parts.fragment and target in parsed:assert parts.fragment in parsed[target].ids,(path,link)
 assert '{{' not in path.read_text(),path
print(json.dumps({'result':'PASS','records':28,'decisions':dict(Counter(r['selection_status'] for r in records)),'html_pages':len(parsed),'csv_round_trip':'passed','original_narratives':'preserved','internal_links':'passed'}))
