(function(){
  function parseValue(cell){
    const raw = (cell.getAttribute('data-sort') || cell.textContent || '').trim();
    if (!raw || raw === '—' || raw === '-' || raw === ', ') return null;
    // ISO date
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = Date.parse(raw);
      if (!isNaN(d)) return d;
    }
    // numeric: strip $, commas, trim
    const numeric = raw.replace(/[$,]/g,'').replace(/[^\d.\-]/g,'').trim();
    // only treat as number if the cell is mostly numeric (not a name like "Alice Smith")
    if (numeric && /[\d]/.test(numeric) && !isNaN(numeric)) {
      // allow "1,234", "$1,234.00", "12.5%", "48", but not "Alice" (no digits) or random text
      const compact = raw.replace(/[$,\s%]/g,'');
      if (/^[\d.\-]+$/.test(compact) || /^[\d.\-]+$/.test(numeric) && raw.match(/[\d]/) && raw.length < 20) {
        // Check that raw is not a mixed label like "Unassigned seats" which has no digits
        if (/^[^a-zA-Z]*[\d][^a-zA-Z]*$/.test(raw.replace(/[$,]/g,''))) {
          return parseFloat(numeric);
        }
        // For money cells like "$1,234" or "1,234", allow
        if (/^\$?[\d,]+(\.\d+)?$/.test(raw.trim())) return parseFloat(numeric);
      }
    }
    return raw.toLowerCase();
  }

  function sortTable(table, colIdx, th){
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (!rows.length) return;
    const hasGroups = rows.some(r => r.classList.contains('grp-head'));
    const dir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
    table.querySelectorAll('thead th').forEach(h => {
      h.dataset.sortDir = '';
      const ind = h.querySelector('.sort-ind');
      if (ind) ind.textContent = ' ↕';
    });
    th.dataset.sortDir = dir;
    const ind = th.querySelector('.sort-ind');
    if (ind) ind.textContent = dir === 'asc' ? ' ▲' : ' ▼';

    if (hasGroups) {
      const groups = [];
      let cur = null;
      rows.forEach(r => {
        if (r.classList.contains('grp-head')) {
          if (cur) groups.push(cur);
          cur = {head: r, items: []};
        } else if (cur) {
          cur.items.push(r);
        } else {
          groups.push({head: r, items: []});
        }
      });
      if (cur) groups.push(cur);
      const getGroupVal = (g) => {
        const c = g.head?.children[colIdx];
        if (!c) return '';
        const v = parseValue(c);
        if (v === null) return dir==='asc' ? '\uffff' : '';
        return v;
      };
      groups.sort((a,b)=>{
        let av = getGroupVal(a), bv = getGroupVal(b);
        let cmp;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else if (typeof av === 'number') cmp = -1;
        else if (typeof bv === 'number') cmp = 1;
        else cmp = String(av).localeCompare(String(bv));
        return dir==='asc'?cmp:-cmp;
      });
      groups.forEach(g=>{
        tbody.appendChild(g.head);
        g.items.forEach(it=>tbody.appendChild(it));
      });
      return;
    }

    rows.sort((a,b)=>{
      const ca = a.children[colIdx], cb = b.children[colIdx];
      let av = ca ? parseValue(ca) : null;
      let bv = cb ? parseValue(cb) : null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      let cmp;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else if (typeof av === 'number') cmp = -1;
      else if (typeof bv === 'number') cmp = 1;
      else cmp = String(av).localeCompare(String(bv));
      return dir==='asc'?cmp:-cmp;
    });
    rows.forEach(r=>tbody.appendChild(r));
  }

  function makeSortable(table){
    if (table.dataset.sortable) return;
    const thead = table.querySelector('thead');
    if (!thead) return;
    const ths = thead.querySelectorAll('th');
    if (!ths.length) return;
    table.dataset.sortable = '1';
    ths.forEach((th, idx)=>{
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.title = 'Click to sort';
      th.setAttribute('role','button');
      th.tabIndex = 0;
      const label = th.textContent.trim();
      th.setAttribute('aria-label', label + ', sortable. Press Enter to sort.');
      let ind = th.querySelector('.sort-ind');
      if (!ind) {
        ind = document.createElement('span');
        ind.className = 'sort-ind';
        ind.textContent = ' ↕';
        ind.style.opacity = '0.35';
        ind.style.fontSize = '10px';
        ind.style.marginLeft = '4px';
        ind.setAttribute('aria-hidden','true');
        th.appendChild(ind);
      }
      const handler = () => sortTable(table, idx, th);
      th.addEventListener('click', handler);
      th.addEventListener('keydown', e=>{
        if (e.key==='Enter' || e.key===' ') { e.preventDefault(); handler(); }
      });
    });
  }

  function scan(root){
    (root || document).querySelectorAll('table').forEach(makeSortable);
  }

  // inject minimal CSS for sorted state
  const style = document.createElement('style');
  style.textContent = 'thead th[data-sort-dir]{color:var(--ink) !important} thead th[data-sort-dir] .sort-ind{opacity:1 !important}';
  document.head.appendChild(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>scan(document));
  } else {
    scan(document);
  }
  const obs = new MutationObserver(muts=>{
    muts.forEach(m=>{
      m.addedNodes.forEach(n=>{
        if (n.nodeType !== 1) return;
        if (n.tagName === 'TABLE') makeSortable(n);
        else scan(n);
      });
    });
  });
  obs.observe(document.body, {childList:true, subtree:true});
  window.makeTablesSortable = scan;
})();
