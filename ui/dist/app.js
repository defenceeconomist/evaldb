'use strict';
const records = (window.EVALUATIONS || []).filter(r => r.selection_status === 'Include');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const countryLabel = country => country === 'UK' ? 'United Kingdom' : country;
const dateLabel = value => {
  if (!value) return 'Not stated';
  if (/^\d{4}$/.test(value)) return value;
  const date = new Date(`${value.length === 7 ? value+'-01' : value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB',{month:'short',year:'numeric',...(value.length===10?{day:'numeric'}:{}),timeZone:'UTC'}).format(date);
};
const safeURL = value => { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)?u.href:'#'; } catch { return '#'; } };
const badge = r => `<span class="badge ${r.selection_status==='Include with limits'?'limited':''}">${escapeHTML(r.selection_status==='Include'?'Included':'Included with limits')}</span>`;
const chips = values => values.map(v=>`<span class="chip">${escapeHTML(v)}</span>`).join('');

function listParams(params) {
  const clean = new URLSearchParams();
  for (const key of ['q','sort','case','topic','type','country','access']) if (params.get(key)) clean.set(key,params.get(key));
  return clean;
}
if (document.body.dataset.page === 'list') {
  const search = document.getElementById('search'), sort = document.getElementById('sort');
  const filterFields = {case:'business_case_uses',topic:'topics',type:'evidence_type',country:'country',access:'access_level'};
  const filters = Object.fromEntries(Object.keys(filterFields).map(key => [key,document.getElementById(`${key}-filter`)]));
  for (const [key,field] of Object.entries(filterFields)) {
    const values = [...new Set(records.flatMap(r => Array.isArray(r[field]) ? r[field] : [r[field]]))].filter(Boolean).sort();
    for (const value of values) filters[key].add(new Option(key === 'country' ? countryLabel(value) : value,value));
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    search.value = params.get('q') || '';
    for (const [key,control] of Object.entries(filters)) {
      control.value = params.get(key) || '';
      if (control.selectedIndex < 0) control.selectedIndex = 0;
    }
    sort.value = ['newest','oldest','title'].includes(params.get('sort')) ? params.get('sort') : 'newest';
  }
  function render(sync = true) {
    const params = new URLSearchParams();
    if (search.value) params.set('q',search.value);
    for (const [key,control] of Object.entries(filters)) if (control.value) params.set(key,control.value);
    if (sort.value !== 'newest') params.set('sort',sort.value);
    if (sync) history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));
    const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const visible = records.filter(r => Object.entries(filters).every(([key,control]) => !control.value || (Array.isArray(r[filterFields[key]]) ? r[filterFields[key]].includes(control.value) : r[filterFields[key]] === control.value)) && words.every(word => [r.evaluation_id,r.source_title,r.country,r.evidence_type,r.decision_use,...r.topics,...r.business_case_uses].join(' ').toLowerCase().includes(word)))
      .sort((a,b) => sort.value === 'title' ? a.source_title.localeCompare(b.source_title) : ((a.source_report_date || '').localeCompare(b.source_report_date || '') * (sort.value === 'oldest' ? 1 : -1) || a.evaluation_id.localeCompare(b.evaluation_id)));
    document.getElementById('result-count').textContent = `${visible.length} of ${records.length} screened records`;
    document.getElementById('evaluation-list').innerHTML = visible.length ? visible.map(r => {
      const link = new URLSearchParams(params); link.set('id',r.evaluation_id);
      return `<tr><td class="record-id">${escapeHTML(r.evaluation_id)}</td><td><a href="evaluation.html?${escapeHTML(link.toString())}">${escapeHTML(r.source_title)}</a></td><td>${escapeHTML(countryLabel(r.country))}</td><td>${escapeHTML(r.source_report_date)}</td><td>${escapeHTML(r.evidence_type)}</td><td>${escapeHTML(r.business_case_uses.join('; '))}</td><td>${escapeHTML(r.decision_use)}</td></tr>`;
    }).join('') : '<tr><td colspan="7">No matching records. Clear the search or reset filters to see more records.</td></tr>';
  }
  for (const control of Object.values(filters)) control.addEventListener('change',()=>render());
  document.getElementById('clear-filters').addEventListener('click',()=>{search.value='';sort.value='newest';for (const control of Object.values(filters)) control.value='';render();});
  search.addEventListener('input',()=>render()); sort.addEventListener('change',()=>render());
  document.querySelector('form').addEventListener('submit',event=>event.preventDefault());
  window.addEventListener('popstate',()=>{restore();render(false);}); restore();render(false);
}
if(document.body.dataset.page==='detail') {
  const params=new URLSearchParams(location.search),record=records.find(r=>r.evaluation_id===params.get('id'));
  const target=document.getElementById('evaluation-detail');const back=listParams(params);document.getElementById('back-to-results').href='index.html'+(back.size?'?'+back:'');
  if(!record){document.title='Report not found · Defence Evaluation Library';target.innerHTML='<div class="empty-state"><h1>Report not found</h1><p>Choose a report from the collection to read its summary.</p><a class="button" href="index.html">Browse evidence →</a></div>';}
  else{
    const r=record;document.title=r.source_title+' · Defence Evaluation Library';
    const sourceLinks=key=>{
      const pages=r.refs?.[key]||[];
      if(!pages.length)return `<a href="${escapeHTML(safeURL(/highlights/i.test(r.evidence_access_basis)?r.source_page_url:r.source_file_url))}" target="_blank" rel="noopener noreferrer">Source evidence ↗</a>`;
      const runs=[];for(let i=0;i<pages.length;i++){const start=pages[i];while(i+1<pages.length&&pages[i+1]===pages[i]+1)i++;runs.push({start,label:start===pages[i]?String(start):`${start}–${pages[i]}`});}
      return 'PDF '+(pages.length===1?'page ':'pages ')+runs.map(run=>`<a href="${escapeHTML(safeURL(r.source_file_url))}#page=${run.start}" target="_blank" rel="noopener noreferrer" aria-label="Open source PDF at page ${run.start}">${run.label}</a>`).join(', ');
    };
    const sections=[['evaluation_question','Question','question',r.question_basis],['methods','Methods','methods',''],['findings','Findings','findings',''],['recommendations','Recommendations','recommendations',r.recommendation_basis],['conclusions','Conclusions','conclusions',r.conclusion_basis],['transferable_lesson','Transferable lesson','transferable_lesson',r.transferable_lesson_basis]].filter(([key])=>r[key]);
    const related=(r.related_records||[]).map(id=>records.find(x=>x.evaluation_id===id)).filter(Boolean);
    target.innerHTML=`<header class="detail-header"><div class="detail-kicker"><span class="record-id">${r.evaluation_id}</span><span>${escapeHTML(r.evidence_type)}</span>${badge(r)}</div><h1>${escapeHTML(r.source_title)}</h1><p class="detail-meta">${escapeHTML(countryLabel(r.country))} <span>·</span> Report ${escapeHTML(dateLabel(r.source_report_date))}${r.source_publication_date&&r.source_publication_date!==r.source_report_date?` <span>·</span> Public release ${escapeHTML(dateLabel(r.source_publication_date))}`:''}</p></header>
    <div class="detail-layout"><div><section class="use-panel" aria-labelledby="use-heading"><p class="eyebrow">APPLICATION TO A BUSINESS CASE</p><h2 id="use-heading">${escapeHTML(r.decision_use)}</h2><div class="chips">${chips(r.business_case_uses)}</div><p>${escapeHTML(r.uk_mod_relevance)}</p><p class="section-note">${escapeHTML(r.relevance_basis)} · Analyst assessment; transfer to MOD has not been evaluated.</p><div class="boundary"><h3>Evidence limits</h3><p>${escapeHTML(r.transfer_boundary)}</p></div></section>
    <article class="summary-content" aria-label="Report summary">${sections.map(([key,label,ref,basis],index)=>`<section class="summary-section" aria-labelledby="heading-${key}"><span class="section-number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><div><h2 id="heading-${key}">${label}</h2><p>${escapeHTML(r[key])}</p>${basis?`<p class="section-note">${escapeHTML(basis)}</p>`:''}<p class="section-note">${sourceLinks(ref)}</p>${key==='transferable_lesson'?`<p class="section-note">${escapeHTML(r.transferable_lesson_rationale)} Neither an explicit lesson nor an analyst inference establishes transfer to another setting.</p>`:''}</div></section>`).join('')}</article>
    <details class="review-details"><summary>Selection decision and provenance</summary><p>${badge(r)} · Reviewed ${escapeHTML(dateLabel(r.review_date))}</p><p>${escapeHTML(r.selection_reason)}</p><p class="muted">${escapeHTML(r.review_basis)}</p><dl class="review-grid">${Object.entries(r.criteria_results).map(([c,result])=>`<dt><a href="docs/selection-criteria.html#${c}">${c}</a></dt><dd>${escapeHTML(result)}</dd>`).join('')}</dl><p>${escapeHTML(r.review_action)}</p><p><a href="docs/content-review.html#${r.evaluation_id}">View this record in the content review →</a></p></details>
    ${related.length?`<section class="related"><h2>Related evidence</h2><p class="muted">Thematic connections; do not count overlapping evidence as independent confirmation.</p><ul>${related.map(x=>`<li><a href="evaluation.html?id=${x.evaluation_id}">${escapeHTML(x.source_title)}</a></li>`).join('')}</ul></section>`:''}</div>
    <aside class="source-panel" aria-label="Original report"><h2>Original report</h2><p class="source-access">${escapeHTML(r.access_level)}</p><a class="button primary" href="${escapeHTML(safeURL(r.source_file_url))}" target="_blank" rel="noopener noreferrer">Read ${r.access_level.includes('Summary')&&!/highlights/i.test(r.evidence_access_basis)?'source summary':r.file_format==='PDF'?'source PDF':'source report'} ↗</a><a class="text-link" href="${escapeHTML(safeURL(r.source_page_url))}" target="_blank" rel="noopener noreferrer">Official publication page ↗</a><div class="source-actions"><button class="button secondary" id="copy-citation">Copy evidence note</button></div><p id="copy-status" role="status" class="section-note"></p><textarea id="citation-fallback" aria-label="Evidence note to copy" rows="9" readonly hidden></textarea><dl><dt>Evaluating organisation</dt><dd>${escapeHTML(r.evaluating_organisation)}</dd><dt>Evidence consulted</dt><dd>${escapeHTML(r.evidence_access_basis)}</dd><dt>Evidence locators</dt><dd>${escapeHTML(r.evidence_locator)}</dd><dt>Report reference</dt><dd>${escapeHTML(r.report_reference||r.catalogue_number||'Not stated')}</dd><dt>Topics</dt><dd>${escapeHTML(r.topics.join('; '))}</dd><dt>Language</dt><dd>${escapeHTML(r.language||'Not stated')}</dd><dt>Source links last checked</dt><dd>${escapeHTML(dateLabel(r.source_checked_date))}</dd><dt>Summary prepared</dt><dd>${escapeHTML(dateLabel(r.summary_date))}</dd></dl>${r.date_notes?`<p class="section-note">${escapeHTML(r.date_notes)}</p>`:''}<p class="source-caption">PDF references count file pages, including the cover. Source links open in a new tab. Confirm current applicability before citing.</p></aside></div>`;
    document.getElementById('copy-citation').addEventListener('click',async()=>{
      const note=`${r.evaluating_organisation} (${r.source_report_date}). ${r.source_title}. ${r.source_page_url}\nLibrary record: ${r.evaluation_id}; summary prepared ${r.summary_date}; selection reviewed ${r.review_date}.\nEvidence: ${r.evidence_type}. ${r.evidence_access_basis}.\nFindings: ${r.findings}\nPotential business-case use (analyst assessment): ${r.decision_use}\nLimits: ${r.transfer_boundary}\nSource locators: ${r.evidence_locator}\nBusiness case: ${r.business_case_uses.join('; ')}.`;
      try{await navigator.clipboard.writeText(note);document.getElementById('copy-status').textContent='Evidence note copied, including limits and source locators.';}catch{const fallback=document.getElementById('citation-fallback');fallback.hidden=false;fallback.value=note;fallback.focus();fallback.select();document.getElementById('copy-status').textContent='Select and copy the evidence note below.';}
    });
  }
}
