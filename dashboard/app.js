// Token Radar dashboard — renders window.RADAR_DATA (written by main.ts
// as ../data.js). No network, no framework: filtering, sorting and the
// per-protocol detail view all run on the board the program computed.
(function () {
  'use strict';
  var D = window.RADAR_DATA;
  if (!D) return;
  var rows = D.rows.slice();
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function fmt(usd) {
    if (usd >= 1e9) return '$' + (usd / 1e9).toFixed(2) + 'B';
    if (usd >= 1e6) return '$' + (usd / 1e6).toFixed(1) + 'M';
    if (usd >= 1e3) return '$' + (usd / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(usd);
  }
  function pct(v) {
    if (v === null || v === undefined) return '<span class="slug">n/r</span>';
    var cls = v >= 0 ? 'pos' : 'neg';
    return '<span class="' + cls + '">' + (v >= 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Board rows carry the compact factor line (all four factors, one
  // line); the detail view carries the full why-this-rank sentence.
  function shortWhy(r) {
    var mult = (r.implied_value_usd / r.tvl_usd).toFixed(2);
    return mult + 'x its ' + fmt(r.tvl_usd) + ' TVL · peer ' + r.peer_multiple.toFixed(2) +
      ' (' + r.peer_count + ' peer' + (r.peer_count === 1 ? '' : 's') + ') · growth x' +
      r.growth_factor.toFixed(2) + ' · maturity x' + r.maturity_factor.toFixed(2) +
      ' · breadth x' + r.breadth_factor.toFixed(2);
  }

  document.getElementById('asOf').textContent = D.as_of;
  document.getElementById('statsLine').textContent =
    D.board_size + ' protocols ranked · ' + D.watchlist_size + ' watchlist (TVL at or above ' +
    fmt(D.floor_usd) + ') · ' + D.early_size + ' early candidates below the floor · ' +
    D.live_size + ' token-bearing protocols set aside as peer evidence · global peer multiple ' +
    D.global_multiple.toFixed(2) + 'x';
  document.getElementById('sourceLine').textContent =
    'Source: ' + D.source + '. A board row means DefiLlama records no token for the protocol; ' +
    'it is not proof none exists. Implied value is this entry\'s own model claim, not a price prediction.';

  // Farm First spotlight: always the board's top three by rank.
  var spot = document.getElementById('spotlight');
  rows.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 3).forEach(function (r) {
    var card = document.createElement('article');
    card.className = 'spot-card';
    card.innerHTML =
      '<p class="spot-rank">RANK #' + r.rank + ' · FARM FIRST</p>' +
      '<p class="spot-name">' + esc(r.name) + '</p>' +
      '<p class="spot-meta">' + esc(r.category) + ' · TVL ' + fmt(r.tvl_usd) + ' · ' +
      r.chains.slice(0, 3).map(esc).join(', ') + '</p>' +
      '<span class="spot-val">' + fmt(r.implied_value_usd) + '</span>' +
      '<p class="spot-why"><b>Why this rank:</b> ' + esc(shortWhy(r)) + '</p>' +
      '<p class="spot-why"><b>First move:</b> ' + esc(r.farm_steps[0]) + '</p>';
    card.addEventListener('click', function () { openDetail(r.slug, true); });
    spot.appendChild(card);
  });

  // Category filter options come from the board itself.
  var catSel = document.getElementById('cat');
  var cats = [];
  rows.forEach(function (r) { if (cats.indexOf(r.category) === -1) cats.push(r.category); });
  cats.sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });

  var qEl = document.getElementById('q');
  var tierEl = document.getElementById('tier');
  var sortEl = document.getElementById('sort');
  var body = document.getElementById('boardBody');
  var countEl = document.getElementById('count');

  function visibleRows() {
    var q = qEl.value.trim().toLowerCase();
    var cat = catSel.value;
    var tier = tierEl.value;
    var out = rows.filter(function (r) {
      if (cat && r.category !== cat) return false;
      if (tier && r.tier !== tier) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var mode = sortEl.value;
    out.sort(function (a, b) {
      if (mode === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (mode === 'growth') return (b.change_7d || -999) - (a.change_7d || -999);
      if (mode === 'readiness') return b.readiness - a.readiness;
      return a.rank - b.rank;
    });
    return out;
  }

  function render() {
    var out = visibleRows();
    countEl.textContent = 'Showing ' + out.length + ' of ' + rows.length + ' ranked protocols';
    body.innerHTML = out.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="rank">#' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category) + '<br><span class="badge ' + (r.tier === 'watchlist' ? 'wl' : 'er') + '">' +
        (r.tier === 'watchlist' ? 'WATCHLIST' : 'EARLY') + '</span></td>' +
        '<td class="num">' + fmt(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num val">' + fmt(r.implied_value_usd) + '</td>' +
        '<td class="num">' + (r.implied_value_usd / r.tvl_usd).toFixed(2) + 'x</td>' +
        '<td><div class="bar"><i style="width:' + r.readiness + '%"></i></div>' + r.readiness + '/100</td>' +
        '<td class="verdict"><b>' + esc(r.verdict) + '</b><br>' + esc(shortWhy(r)) + '</td></tr>';
    }).join('');
    Array.prototype.forEach.call(body.querySelectorAll('tr'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug'), true); });
    });
  }

  var detailEl = document.getElementById('detail');
  var detailBody = document.getElementById('detailBody');
  function factor(label, value, note) {
    return '<div class="factor"><p class="fk">' + label + '</p><p class="fv">' + value +
      '</p><p class="fn">' + note + '</p></div>';
  }
  function openDetail(slug, scroll) {
    var r = bySlug[slug];
    if (!r) return;
    var age = r.age_days === null ? 'not recorded' : r.age_days + ' days';
    detailBody.innerHTML =
      '<div class="d-head"><h2>#' + r.rank + ' · ' + esc(r.name) + '</h2>' +
      '<span class="d-val">' + fmt(r.implied_value_usd) + ' implied</span>' +
      '<span class="badge ' + (r.tier === 'watchlist' ? 'wl' : 'er') + '">' +
      (r.tier === 'watchlist' ? 'WATCHLIST' : 'EARLY CANDIDATE') + '</span></div>' +
      '<p class="spot-meta">' + esc(r.category) + ' · TVL ' + fmt(r.tvl_usd) + ' · 7-day ' +
      (r.change_7d === null ? 'not reported' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      ' · chains: ' + r.chains.map(esc).join(', ') + ' · readiness ' + r.readiness + '/100</p>' +
      '<div class="factors">' +
      factor('Peer multiple', r.peer_multiple.toFixed(2) + 'x', 'Median mcap/TVL of ' + r.peer_count + ' token-bearing ' + esc(r.category) + ' peer' + (r.peer_count === 1 ? '' : 's') + ', shrunk to the global median') +
      factor('Growth factor', 'x' + r.growth_factor.toFixed(2), '30% weight on the clamped 7-day TVL change') +
      factor('Maturity factor', 'x' + r.maturity_factor.toFixed(2), 'Tracked ' + age + ' with no token; full marks at four years') +
      factor('Breadth factor', 'x' + r.breadth_factor.toFixed(3), '+1.5% per chain beyond the first, capped at six extra') +
      '</div>' +
      '<div class="why"><h3>Why this rank — and why now</h3><p>' + esc(r.why_rank) + '</p>' +
      '<p><b>Verdict:</b> ' + esc(r.verdict) + '</p></div>' +
      '<div class="plan"><h3>The farm plan</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol></div>' +
      '<div class="exit"><b>Exit trigger:</b> leave if TVL falls 30% from the entry week (' +
      fmt(r.tvl_usd) + ' today, so below ' + fmt(r.tvl_usd * 0.7) +
      '), and on a launch claim day one and sell at least half into the first week.</div>';
    detailEl.hidden = false;
    if (scroll) detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.getElementById('backBtn').addEventListener('click', function () {
    detailEl.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  [qEl, catSel, tierEl, sortEl].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  render();

  // Deep links for the three judged views: #detail=<slug>, #filter=<category>.
  var hash = window.location.hash || '';
  var dm = hash.match(/detail=([a-z0-9-]+)/i);
  var fm = hash.match(/filter=([^&]+)/i);
  if (fm) {
    var wanted = decodeURIComponent(fm[1]);
    cats.forEach(function (c) { if (c.toLowerCase() === wanted.toLowerCase()) catSel.value = c; });
    render();
  }
  if (dm && bySlug[dm[1]]) openDetail(dm[1], false);
})();
