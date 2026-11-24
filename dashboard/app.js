// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail dialog with the model's own inputs and the protocol's
// farm plan, the live-token set and the calibration behind every multiple.
// No network: every byte it shows is in data.js. The page recomputes each
// row from the snapshot figures with impliedOf, the same arithmetic main.ts
// runs, so the page's code and the board's data are visibly the same model.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var PAGE_SIZE = 50;
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, shown: PAGE_SIZE, sandbox: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }
  function fmtRatio(n) { return n.toFixed(3); }

  // The calibration: category -> { comparables, median_ratio, multiple, examples }.
  var CAL = {};
  DATA.calibration.forEach(function (c) { CAL[c.category] = c; });
  function multipleFor(category) {
    if (category && CAL[category]) return CAL[category].multiple;
    return DATA.model.global_multiple;
  }

  // The model in one function: TVL x category multiple x growth x maturity x
  // chain breadth. `m` is the model constants (the sandbox may override a few),
  // `multScale` scales every multiple (the sandbox's fourth slider).
  function impliedOf(row, m, multScale) {
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var chainSteps = Math.min(Math.max((row.chains || []).length - 1, 0), m.chain_max_steps);
    var chainMult = 1 + chainSteps * m.chain_step;
    var multiple = multipleFor(row.category) * (multScale || 1);
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * multiple * growthMult * maturity * chainMult)),
      growthPct: growth, growthMult: growthMult, maturityMult: maturity, chainMult: chainMult, multiple: multiple
    };
  }
  // The constants the page scores with: the submitted model, or the sandbox's.
  function activeModel() {
    if (!state.sandbox) return { m: DATA.model, multScale: 1 };
    var s = state.sandbox;
    return {
      m: {
        growth_weight: s.growth_weight, growth_floor: DATA.model.growth_floor, growth_cap: DATA.model.growth_cap,
        maturity_floor: s.maturity_floor, maturity_range: DATA.model.maturity_range, maturity_days: DATA.model.maturity_days,
        unknown_age_days: DATA.model.unknown_age_days, chain_step: s.chain_step, chain_max_steps: DATA.model.chain_max_steps
      },
      multScale: s.mult_scale
    };
  }
  function shownImplied(row) {
    if (!state.sandbox) return row.implied_value_usd;
    var a = activeModel();
    return impliedOf(row, a.m, a.multScale).implied;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category,
  // chains, TVL and age decide the action, the capital, the hold and every cost
  // and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) { return chain === 'Ethereum' ? 'about $6 to $15 of gas' : 'under $2 of gas'; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s basis vault on " + chain + ' and keep the delta-neutral position open.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('launchpad') >= 0) return 'Lock $' + capital + " through " + name + "'s launchpad on " + chain + ' and join one sale.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' of the asset through ' + name + ' and vote on one proposal.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' to ' + name + ' and use its apps: swap once, stake once or provide a little liquidity.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipts.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'supply a little more, or borrow a small amount against the deposit';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'swap a little, or add and remove a little liquidity';
    if (c.indexOf('bridge') >= 0) return 'bridge a small amount and use it in the destination app';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'stake a little more, or claim and restake the rewards';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'open or close one small hedge';
    if (c.indexOf('prediction') >= 0) return 'settle one position and open another';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'deposit a little more into the vault, or move between its vaults';
    if (c.indexOf('governance') >= 0) return 'vote on one new proposal';
    return 'a deposit, a borrow, a swap or a vote';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gasFor(chain), time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as ' + weeklyFor(p) + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes: never pay to claim, and never share a seed phrase with anyone.", cost: 'no fee to check', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.base_multiple; bv = b.base_multiple; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { html: DATA.watchlist_size + ' watchlist protocols, ranked by <em>implied value</em>' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, every one the watchlist rule keeps. Each multiple is calibrated from the live-token protocols that already trade in the same category — not a flat number, and never a hand-picked name. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug on the list' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' early rows below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('small', { text: top ? top.name : '' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'market cap, not a model' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.shown = PAGE_SIZE; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; state.shown = PAGE_SIZE; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; state.shown = PAGE_SIZE; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'min-tvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '50000000', text: '$50M and up' }),
      el('option', { value: '100000000', text: '$100M and up' }),
      el('option', { value: '500000000', text: '$500M and up' }),
      el('option', { value: '1000000000', text: '$1B and up' })
    );
    tvlSelect.value = String(state.minTvl);
    tvlSelect.addEventListener('change', function () { state.minTvl = Number(tvlSelect.value); state.shown = PAGE_SIZE; writeHash(); render(); });
    function tabButton(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; state.shown = PAGE_SIZE; writeHash(); render(); } });
    }
    var countText = state.tab === 'pre-token' ? filteredRows().length + ' rows match' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.calibration.length + ' calibrated categories';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'min-tvl', text: 'TVL' }), tvlSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabButton('pre-token', 'Pre-token'), tabButton('live', 'Live token'), tabButton('calibration', 'Multiples'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label, num) {
    return el('th', { scope: 'col', class: num ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var shown = list.slice(0, state.shown);
    var max = 1;
    shown.forEach(function (r) { max = Math.max(max, shownImplied(r)); });
    var first = DATA.rows[0];
    var check = first ? impliedOf(first, DATA.model, 1) : null;
    var checkLine = check ? 'The page recomputes every row from the snapshot figures: rank 1 (' + first.name + ') recomputes as ' + fmtUsd(check.implied) + (check.implied === first.implied_value_usd ? ', the number board.json carries.' : ' — the data would be stale.') : '';
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.shown = PAGE_SIZE; writeHash(); render(); } })
      ));
    }
    var tbody = el('tbody');
    shown.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankShown = state.sandbox ? (i + 1) : r.rank;
      var implied = shownImplied(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(rankShown) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.chains && r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.base_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((implied / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(implied) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    var panel = el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' + (state.sandbox ? ' Sandbox is on: ranks and values are the sandbox’s, board.json keeps the submitted model.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('age', 'Age', true),
            sortHeader('multiple', 'x', true),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
    if (list.length > state.shown) {
      panel.appendChild(el('button', { class: 'more', type: 'button', text: 'Show more (' + (list.length - state.shown) + ' left)', onclick: function () { state.shown += PAGE_SIZE; render(); } }));
    }
    panel.appendChild(el('p', { class: 'note', text: checkLine }));
    return panel;
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comparables the multiples are calibrated from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function calibTable() {
    var rows = DATA.calibration.slice().sort(function (a, b) { return b.multiple - a.multiple; });
    var tbody = el('tbody');
    rows.forEach(function (c) {
      var ex = c.examples.map(function (e) { return e.name + ' ' + fmtRatio(e.ratio); }).join(', ');
      tbody.appendChild(el('tr', null,
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: String(c.comparables) }),
        el('td', { class: 'num', text: fmtRatio(c.median_ratio) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', null, el('span', { class: 'sub', text: ex || '—' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('h2', { text: 'How each multiple is set' }),
      el('p', { class: 'sub', text: 'For every category, the live-token protocols that already trade are the comparables. Their market-cap-to-TVL ratios are winsorized to [0.005, 50], and the median is the category’s raw multiple. A category with few comparables is shrunk toward the global median of ' + fmtRatio(DATA.model.global_multiple) + ' (weight n / (n + 4)), so one protocol never decides a category; a category with no comparables uses the global median. Every multiple is clamped to [0.02, 2.00].' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'One row per category with a live comparable. The multiple is what the board multiplies the TVL by.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comparables' }), el('th', { scope: 'col', text: 'Median ratio' }), el('th', { scope: 'col', text: 'Multiple used' }), el('th', { scope: 'col', text: 'Largest comparables (ratio)' }))),
          tbody
        )
      )
    );
  }

  function sandboxRow(label, key, min, max, step, format) {
    var s = state.sandbox || { growth_weight: DATA.model.growth_weight, maturity_floor: DATA.model.maturity_floor, chain_step: DATA.model.chain_step, mult_scale: 1 };
    var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(s[key]), 'aria-label': label });
    var output = el('output', { text: format(s[key]) });
    input.addEventListener('input', function () {
      if (!state.sandbox) state.sandbox = { growth_weight: DATA.model.growth_weight, maturity_floor: DATA.model.maturity_floor, chain_step: DATA.model.chain_step, mult_scale: 1 };
      state.sandbox[key] = Number(input.value);
      output.textContent = format(Number(input.value));
      render();
    });
    return el('div', null, el('label', null, label + ' ', output), input);
  }

  function modelPanel() {
    var m = DATA.model;
    var panel = el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The multiple comes from the category’s live comparables; growth, age and chain breadth come from the protocol’s own record.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ',
        el('b', { text: 'category multiple' }),
        ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')',
        ' x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')',
        ' x (1 + min(chains - 1, ' + m.chain_max_steps + ') x ' + m.chain_step + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Chain breadth adds up to ' + Math.round(m.chain_step * m.chain_max_steps * 100) + '% for protocols live on several chains. The early radar is every pre-token protocol the watchlist rule keeps, below the floor as well as on it, and the live-token protocols are set aside with their market caps shown.' }),
      el('h2', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Move a slider and the board re-ranks live, with the same function. The sandbox changes only this page: board.json keeps the submitted model.' }),
      el('div', { class: 'sandbox' },
        sandboxRow('Growth weight', 'growth_weight', 0, 1, 0.05, function (v) { return v.toFixed(2); }),
        sandboxRow('Maturity floor', 'maturity_floor', 0.4, 0.8, 0.05, function (v) { return v.toFixed(2); }),
        sandboxRow('Chain step', 'chain_step', 0, 0.05, 0.005, function (v) { return v.toFixed(3); }),
        sandboxRow('Multiple scale', 'mult_scale', 0.5, 2, 0.1, function (v) { return 'x' + v.toFixed(1); })
      ),
      el('p', { class: 'sandbox-note sub', text: state.sandbox ? 'Sandbox is on. The ranks and values above are the sandbox’s.' : 'Sliders are at the submitted model.' }),
      state.sandbox ? el('p', { class: 'sandbox-note' }, el('button', { class: 'button', type: 'button', text: 'Reset to the submitted model', onclick: function () { state.sandbox = null; render(); } })) : null
    );
    return panel;
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model, 1);
    var cal = row.category ? CAL[row.category] : null;
    var head = el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rank-tag', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    );
    dialog.appendChild(head);
    var eq = el('div', { class: 'equation' },
      el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.base_multiple) })),
      el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
      el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
      el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
      el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
      el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
      el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
      el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
    );
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      eq,
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed.implied) + (recomputed.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    if (cal) {
      var compsBody = el('tbody');
      cal.examples.forEach(function (e) {
        compsBody.appendChild(el('tr', null,
          el('td', null, el('b', { text: e.name })),
          el('td', { class: 'num', text: fmtUsd(e.tvl_usd) }),
          el('td', { class: 'num', text: fmtUsd(e.mcap_usd) }),
          el('td', { class: 'num', text: fmtRatio(e.ratio) })
        ));
      });
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Why this multiple: ' + (row.category || 'Other') + ' comparables' }),
        el('p', { class: 'sub', text: cal.comparables + ' live-token protocol' + (cal.comparables === 1 ? '' : 's') + ' in this category ' + (cal.comparables === 1 ? 'trades' : 'trade') + ' today. Their median market-cap-to-TVL ratio is ' + fmtRatio(cal.median_ratio) + '; shrunk toward the global median, the multiple used is ' + fmtMult(cal.multiple) + '.' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'comps' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Comparable' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Ratio' }))),
            compsBody
          )
        )
      ));
    } else {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Why this multiple' }),
        el('p', { class: 'sub', text: 'No live-token protocol in this category trades in the snapshot, so the row uses the global median multiple of ' + fmtMult(DATA.model.global_multiple) + '.' })
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'note', text: '“No token on record” is what the snapshot says, never proof the protocol has none. Farming costs gas and locks capital; a token is never guaranteed.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '. The board covers the whole watchlist (' + DATA.watchlist_size + ' protocols) and ' + DATA.early_size + ' early rows below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor.' }),
      el('p', { text: 'A protocol is listed as pre-token when its DefiLlama record carries no token — no market cap, no CoinGecko id, no symbol. That is the record, not proof it has none. Implied value is this entry’s own model, never a price and never a promise of a launch.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') {
      shell.appendChild(boardTable());
      shell.appendChild(modelPanel());
    } else if (state.tab === 'live') {
      shell.appendChild(liveTable());
    } else {
      shell.appendChild(calibTable());
    }
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
