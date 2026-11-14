// Token Launch Radar dashboard. Renders window.RADAR, the dataset main.ts writes from the same
// board it hands in as board.json, so the page and the board cannot disagree. No fetch, no network.
(function () {
  'use strict';
  var R = window.RADAR;
  var main = document.getElementById('board');
  if (!R || !main) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '-';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n == null) return '<span class="cat">no reading</span>';
    var cls = n >= 0 ? 'pos' : 'neg';
    return '<span class="' + cls + '">' + (n >= 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageText(days) {
    if (days == null) return 'untracked start';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return days + ' days';
  }
  function bySlug(slug) {
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) return R.rows[i];
    return null;
  }

  // View state comes from the hash: #board?cat=Lending&watch=1&q=lend is a filtered board and
  // #p/<slug> is one protocol's detail view, so every view a reader can reach has an address.
  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    if (h.indexOf('p/') === 0) return { view: 'detail', slug: decodeURIComponent(h.slice(2)) };
    var state = { view: 'board', q: '', cat: '', chain: '', watch: false, sort: 'rank' };
    var qs = h.indexOf('?') >= 0 ? h.slice(h.indexOf('?') + 1) : '';
    if (qs) {
      qs.split('&').forEach(function (pair) {
        var kv = pair.split('=');
        var k = decodeURIComponent(kv[0] || '');
        var v = decodeURIComponent(kv[1] || '');
        if (k === 'q') state.q = v;
        if (k === 'cat') state.cat = v;
        if (k === 'chain') state.chain = v;
        if (k === 'watch') state.watch = v === '1';
        if (k === 'sort') state.sort = v;
      });
    }
    return state;
  }
  function boardHash(state) {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.watch) parts.push('watch=1');
    if (state.sort && state.sort !== 'rank') parts.push('sort=' + encodeURIComponent(state.sort));
    return 'board' + (parts.length ? '?' + parts.join('&') : '');
  }

  function header() {
    return (
      '<header class="top"><div><h1>Token Launch <span class="radar">Radar</span></h1>' +
      '<p class="sub">Every protocol in the sealed DefiLlama snapshot that records no token yet, screened for wrapped and staked products of tokens that already trade, and ranked by what its launch would be worth under the model below. An implied value is this entry\'s own claim from the snapshot\'s figures; it says nothing about whether or when a token comes.</p></div>' +
      '<div><span class="badge">snapshot ' + esc(R.as_of) + '</span> <span class="badge">model ' + esc(R.model_version) + '</span></div></header>' +
      '<div class="model-strip"><b>The model:</b> implied value = TVL x peer multiple x growth x maturity x breadth. The peer multiple is the median market-cap / TVL of the snapshot\'s own tokened protocols in the same category, shrunk toward the global median (' + R.global_median.toFixed(3) + ') by peer count. Growth clamps the 7-day TVL change to -50%..+100% at 0.30 weight; maturity runs 0.72..1.00 over four tracked years; breadth adds 1.5% per extra chain, up to six.</div>' +
      '<div class="stats">' +
      '<div class="stat"><div class="n">' + R.scanned_size + '</div><div class="l">protocols scanned</div></div>' +
      '<div class="stat"><div class="n">' + R.pretoken_size + '</div><div class="l">record no token</div></div>' +
      '<div class="stat"><div class="n">' + R.board_size + '</div><div class="l">ranked on the board</div></div>' +
      '<div class="stat"><div class="n">' + R.watchlist_size + ' / ' + R.watchlist_size + '</div><div class="l">watchlist covered</div></div>' +
      '<div class="stat"><div class="n">' + R.early_size + '</div><div class="l">early, below the $50M floor</div></div>' +
      '<div class="stat"><div class="n">' + money(R.rows.length ? R.rows[0].implied_value_usd : 0) + '</div><div class="l">top implied value</div></div>' +
      '</div>'
    );
  }

  function controls(state, cats, chains) {
    function opts(list, cur, allLabel) {
      var out = '<option value="">' + allLabel + '</option>';
      list.forEach(function (v) {
        out += '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
      });
      return out;
    }
    var sorts = [
      ['rank', 'rank (implied value)'], ['tvl', 'TVL'], ['growth', '7-day growth'],
      ['age', 'track record'], ['ready', 'readiness'],
    ];
    var sortOpts = sorts.map(function (s) {
      return '<option value="' + s[0] + '"' + (state.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join('');
    return (
      '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name or slug" value="' + esc(state.q) + '">' +
      '<label>Category <select id="cat">' + opts(cats, state.cat, 'All categories') + '</select></label>' +
      '<label>Chain <select id="chain">' + opts(chains, state.chain, 'All chains') + '</select></label>' +
      '<label><input type="checkbox" id="watch"' + (state.watch ? ' checked' : '') + '> Watchlist only</label>' +
      '<label>Sort <select id="sort">' + sortOpts + '</select></label>' +
      '</div>'
    );
  }

  function filtered(state) {
    var rows = R.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat && (r.category || 'Uncategorized') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = {
      rank: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d == null ? -1e9 : b.change_7d) - (a.change_7d == null ? -1e9 : a.change_7d); },
      age: function (a, b) { return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days); },
      ready: function (a, b) { return b.readiness - a.readiness; },
    }[state.sort] || function (a, b) { return a.rank - b.rank; };
    return rows.sort(key);
  }

  function boardView() {
    var state = parseHash();
    var cats = [];
    var chains = [];
    R.rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (cats.indexOf(c) < 0) cats.push(c);
      r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
    });
    cats.sort(); chains.sort();
    var rows = filtered(state);
    var body = rows.map(function (r) {
      return (
        '<tr class="row" data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span> ' + (r.watchlist ? '<span class="badge watch">watchlist</span>' : '<span class="badge">early</span>') +
        '<div class="cat">' + esc(r.category || 'Uncategorized') + '</div></td>' +
        '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><span class="implied">' + money(r.implied_value_usd) + '</span><div class="cat">' + (r.implied_value_usd / r.tvl_usd).toFixed(2) + 'x TVL</div></td>' +
        '<td class="num">' + r.readiness + '<div class="bar"><i style="width:' + r.readiness + '%"></i></div></td></tr>'
      );
    }).join('');
    var live = R.live.map(function (r) {
      return '<tr><td><span class="name">' + esc(r.name) + '</span><div class="cat">' + esc(r.category || 'Uncategorized') + '</div></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
    }).join('');
    var catRows = R.categories.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.peers + '</td><td class="num">' +
        (c.category_median == null ? '-' : c.category_median.toFixed(3)) + '</td><td class="num">' + c.multiple.toFixed(3) + '</td></tr>';
    }).join('');
    main.innerHTML =
      header() + controls(state, cats, chains) +
      '<p class="count">Showing ' + rows.length + ' of ' + R.board_size + ' ranked protocols. Click any row for its model breakdown and farm plan.</p>' +
      '<table><thead><tr><th class="num">#</th><th>Protocol</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Tracked</th><th class="num">Implied value</th><th class="num">Ready</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="8">No protocol matches this filter.</td></tr>') + '</tbody></table>' +
      '<section class="block"><h2>Already launched: set aside, never ranked</h2>' +
      '<p>These protocols record a token in the same snapshot, so the market has already priced them. They are the peer group the board\'s multiples come from, and they are shown at the market\'s own market cap, never at a model value.</p>' +
      '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' + live + '</tbody></table></section>' +
      '<section class="block"><h2>How the peer multiples were priced</h2>' +
      '<p>Each category\'s multiple is its tokened peers\' median market-cap / TVL, blended toward the global median with weight peers / (peers + 4) and clamped to 0.03..2.50, so a thin or wild category cannot dominate the board.</p>' +
      '<table class="cat-table"><thead><tr><th>Category</th><th class="num">Tokened peers</th><th class="num">Median mcap / TVL</th><th class="num">Multiple used</th></tr></thead><tbody>' + catRows + '</tbody></table></section>' +
      '<footer><b>Reading this board.</b> "Records no token" is what the snapshot says, not proof a protocol has none: DefiLlama\'s record can lag a launch. The watchlist is the floor, never the ceiling: the early rows sit below its $50M line and passed the same wrapped / staked screen. Farm plans are checklists for a reader\'s own research, not financial advice; capital figures are position sizes the plan assumes, and gas figures are per-action estimates for the protocol\'s first chain.</footer>';
    main.setAttribute('aria-busy', 'false');
    function push() {
      var next = {
        view: 'board',
        q: document.getElementById('q').value.trim(),
        cat: document.getElementById('cat').value,
        chain: document.getElementById('chain').value,
        watch: document.getElementById('watch').checked,
        sort: document.getElementById('sort').value,
      };
      var target = '#' + boardHash(next);
      if (location.hash !== target) history.replaceState(null, '', target);
      boardViewKeep(next);
    }
    ['q', 'cat', 'chain', 'watch', 'sort'].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener(id === 'q' ? 'input' : 'change', push);
    });
    main.querySelectorAll('tr.row').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = 'p/' + tr.getAttribute('data-slug'); });
    });
  }

  // Re-render only the table body and count after a control change, keeping the controls' focus.
  function boardViewKeep(state) {
    var rows = filtered(state);
    var tbody = main.querySelector('tbody');
    var count = main.querySelector('.count');
    if (!tbody || !count) { boardView(); return; }
    count.textContent = 'Showing ' + rows.length + ' of ' + R.board_size + ' ranked protocols. Click any row for its model breakdown and farm plan.';
    tbody.innerHTML = rows.map(function (r) {
      return (
        '<tr class="row" data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span> ' + (r.watchlist ? '<span class="badge watch">watchlist</span>' : '<span class="badge">early</span>') +
        '<div class="cat">' + esc(r.category || 'Uncategorized') + '</div></td>' +
        '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><span class="implied">' + money(r.implied_value_usd) + '</span><div class="cat">' + (r.implied_value_usd / r.tvl_usd).toFixed(2) + 'x TVL</div></td>' +
        '<td class="num">' + r.readiness + '<div class="bar"><i style="width:' + r.readiness + '%"></i></div></td></tr>'
      );
    }).join('') || '<tr><td colspan="8">No protocol matches this filter.</td></tr>';
    tbody.querySelectorAll('tr.row').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = 'p/' + tr.getAttribute('data-slug'); });
    });
  }

  function detailView(slug) {
    var r = bySlug(slug);
    if (!r) { location.hash = 'board'; return; }
    var m = r.model;
    var base = r.tvl_usd * m.peer_multiple;
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    main.innerHTML =
      '<p><a class="back" href="#board">&larr; Back to the board</a></p>' +
      '<div class="detail-head"><h1>' + esc(r.name) + '</h1><div>' +
      (r.watchlist ? '<span class="badge watch">watchlist</span>' : '<span class="badge">early, below the floor</span>') +
      ' <span class="badge">rank #' + r.rank + ' of ' + R.board_size + '</span></div></div>' +
      '<p class="sub">' + esc(r.category || 'Uncategorized') + ' on ' + esc(r.chains.join(', ') || 'its main chain') +
      '. This protocol records no token in the snapshot of ' + esc(R.as_of) + ', so the radar prices the launch it has not had yet.</p>' +
      '<div class="grid">' +
      '<div class="card"><h3>Implied value</h3><div class="big">' + money(r.implied_value_usd) + '</div><div class="cat">' + (r.implied_value_usd / r.tvl_usd).toFixed(2) + 'x its TVL, under model ' + esc(R.model_version) + '</div></div>' +
      '<div class="card"><h3>TVL</h3><div class="big">' + money(r.tvl_usd) + '</div><div class="cat">7-day change ' + (r.change_7d == null ? 'not reported' : r.change_7d.toFixed(1) + '%') + '</div></div>' +
      '<div class="card"><h3>Track record</h3><div class="big">' + ageText(r.age_days) + '</div><div class="cat">tracked since ' + esc(r.listed_at || 'an unrecorded day') + ', still no token</div></div>' +
      '<div class="card"><h3>Readiness</h3><div class="big">' + r.readiness + ' / 100</div><div class="bar"><i style="width:' + r.readiness + '%"></i></div></div>' +
      '</div>' +
      '<section class="block"><h2>How this value is built</h2>' +
      '<table class="mini"><tbody>' +
      '<tr><td>TVL (snapshot)</td><td class="num">' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Peer multiple, ' + esc(r.category || 'Uncategorized') + ' (' + m.peer_count + ' tokened peers)</td><td class="num">x ' + m.peer_multiple.toFixed(3) + '</td></tr>' +
      '<tr><td>Base value</td><td class="num">' + money(Math.round(base)) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d ' + (m.growth_pct == null ? 'unreported, neutral' : m.growth_pct.toFixed(1) + '%') + ')</td><td class="num">x ' + m.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Maturity multiplier (' + ageText(m.age_days) + ' tracked)</td><td class="num">x ' + m.maturity_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Breadth multiplier (' + r.chains.length + (r.chains.length === 1 ? ' chain' : ' chains') + ')</td><td class="num">x ' + m.breadth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table></section>' +
      '<section class="block"><h2>How to farm it</h2>' +
      '<p>Six steps, each with what it costs and how long it takes, written for this protocol\'s category and first chain (' + esc(r.chains[0] || 'its main chain') + ').</p>' +
      '<ol class="steps">' + steps + '</ol></section>' +
      '<footer><b>Caution.</b> A farm plan is a research checklist, not a promise of an airdrop or a token. Protocols can launch with no reward for early users, or never launch; size any position so that outcome is acceptable.</footer>';
    main.setAttribute('aria-busy', 'false');
    window.scrollTo(0, 0);
  }

  function render() {
    var state = parseHash();
    if (state.view === 'detail') detailView(state.slug);
    else boardView();
  }
  window.addEventListener('hashchange', render);
  render();
})();
