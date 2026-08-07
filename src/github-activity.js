/*
========================================
   LIVE GITHUB ACTIVITY WIDGET
   Vanilla JS, zero dependencies, no build step, no secrets.

   Data sources (all CORS-enabled, all keyless):
     1. github-contributions-api.jogruber.de  -> daily contribution counts
        (GitHub only exposes the contribution graph via GraphQL, which needs a
        token; this proxy scrapes the public profile page. Verified CORS: *)
     2. api.github.com/users/:u/events/public -> recent public push commits
     3. api.github.com/users/:u/repos         -> repo count + recent-repo fallback

   Only 2 of those hit GitHub's unauthenticated 60-req/hour/IP budget, and every
   response is cached in localStorage for 45 minutes. On any failure we serve a
   stale cache if we have one, otherwise a static "View on GitHub" card.

   SECURITY: every value that originates from the network is written with
   textContent / setAttribute. There is no innerHTML anywhere in this file.
========================================
*/
(function () {
    'use strict';

    var CFG = {
        user: 'levmalkhasian',
        weeks: 53,              // heatmap columns; 26 ~= 6 months, 53 = trailing year
        commits: 5,             // max recent commits to list
        ttl: 45 * 60 * 1000,    // localStorage TTL
        ns: 'ghw:v1:'
    };

    var GH_ICON = 'M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3';
    var ARROW = 'M7 17L17 7M17 7H8M17 7v9';

    /* ---------------- tiny DOM helpers (never innerHTML) ---------------- */

    function h(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text != null) { n.textContent = String(text); }
        return n;
    }

    function svg(path, filled) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('aria-hidden', 'true');
        s.setAttribute('focusable', 'false');
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', path);
        if (!filled) {
            p.setAttribute('fill', 'none');
            p.setAttribute('stroke', 'currentColor');
            p.setAttribute('stroke-width', '2.4');
            p.setAttribute('stroke-linecap', 'round');
            p.setAttribute('stroke-linejoin', 'round');
        }
        s.appendChild(p);
        return s;
    }

    function clear(node) {
        while (node.firstChild) { node.removeChild(node.firstChild); }
    }

    /* ---------------- cache (defensive: localStorage can throw) ---------------- */

    function cacheGet(key) {
        try {
            var raw = window.localStorage.getItem(CFG.ns + key);
            if (!raw) { return null; }
            var box = JSON.parse(raw);
            if (!box || typeof box.t !== 'number') { return null; }
            return { data: box.d, age: Date.now() - box.t, fresh: (Date.now() - box.t) < CFG.ttl };
        } catch (e) { return null; }
    }

    function cacheSet(key, data) {
        try {
            window.localStorage.setItem(CFG.ns + key, JSON.stringify({ t: Date.now(), d: data }));
        } catch (e) { /* quota / private mode — caching is best-effort */ }
    }

    // Global back-off so a rate-limited visitor stops hammering the API.
    function limitedUntil() {
        try { return parseInt(window.localStorage.getItem(CFG.ns + 'limit') || '0', 10) || 0; }
        catch (e) { return 0; }
    }

    function setLimited(resetEpochSeconds) {
        var until = resetEpochSeconds ? resetEpochSeconds * 1000 : Date.now() + 15 * 60 * 1000;
        try { window.localStorage.setItem(CFG.ns + 'limit', String(until)); } catch (e) { }
    }

    /**
     * Returns { data, age, stale } or null.
     * Never rejects — callers get null and degrade.
     */
    function load(key, url, isGitHub) {
        var cached = cacheGet(key);
        if (cached && cached.fresh) {
            return Promise.resolve({ data: cached.data, age: cached.age, stale: false });
        }
        if (isGitHub && Date.now() < limitedUntil()) {
            return Promise.resolve(cached ? { data: cached.data, age: cached.age, stale: true } : null);
        }

        var ctrl = null, timer = null;
        var opts = { headers: { 'Accept': 'application/json' }, cache: 'no-store' };
        if (typeof AbortController === 'function') {
            ctrl = new AbortController();
            opts.signal = ctrl.signal;
            timer = setTimeout(function () { try { ctrl.abort(); } catch (e) { } }, 8000);
        }

        return fetch(url, opts).then(function (res) {
            if (timer) { clearTimeout(timer); }
            if (isGitHub && (res.status === 403 || res.status === 429)) {
                var remaining = res.headers.get('X-RateLimit-Remaining');
                if (remaining === '0' || res.status === 429) {
                    setLimited(parseInt(res.headers.get('X-RateLimit-Reset') || '0', 10));
                }
                throw new Error('rate-limited');
            }
            if (!res.ok) { throw new Error('http ' + res.status); }
            return res.json();
        }).then(function (json) {
            cacheSet(key, json);
            return { data: json, age: 0, stale: false };
        })['catch'](function () {
            if (timer) { clearTimeout(timer); }
            // Serve stale rather than nothing.
            return cached ? { data: cached.data, age: cached.age, stale: true } : null;
        });
    }

    /* ---------------- formatting ---------------- */

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function ago(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        if (s < 45) { return 'just now'; }
        var m = Math.floor(s / 60);
        if (m < 1) { return 'just now'; }
        if (m < 60) { return m + 'm ago'; }
        var hr = Math.floor(m / 60);
        if (hr < 24) { return hr + 'h ago'; }
        var d = Math.floor(hr / 24);
        if (d < 7) { return d + 'd ago'; }
        if (d < 31) { return Math.floor(d / 7) + 'w ago'; }
        if (d < 365) { return Math.floor(d / 30) + 'mo ago'; }
        var y = Math.floor(d / 365);
        return y + (y === 1 ? 'y ago' : 'y ago');
    }

    function agoDate(iso) {
        var t = Date.parse(iso);
        return isNaN(t) ? '' : ago(Date.now() - t);
    }

    // "2026-04-14" -> local Date (avoids UTC off-by-one)
    function parseDay(str) {
        var p = String(str).split('-');
        return new Date(+p[0], (+p[1]) - 1, +p[2]);
    }

    function prettyDay(d) {
        return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    function num(n) {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // Only ever hand the DOM a URL we built ourselves or one that is provably a
    // plain https://github.com/... link. Anything else is dropped.
    var RE_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
    var RE_SHA = /^[0-9a-f]{7,40}$/i;

    function safeUrl(url) {
        var s = String(url == null ? '' : url);
        return /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9._\-\/?=&#%]*$/.test(s) ? s : null;
    }

    function firstLine(msg, max) {
        var s = String(msg == null ? '' : msg).split('\n')[0].trim();
        if (s.length > max) { s = s.slice(0, max - 1).trim() + '…'; }
        return s || '(no message)';
    }

    var reduceMotion = false;
    try {
        reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { }

    /* ---------------- derived stats ---------------- */

    function analyseContributions(days) {
        var total = 0, active = 0, best = 0, run = 0, current = 0, last = null;
        for (var i = 0; i < days.length; i++) {
            var c = days[i].count || 0;
            total += c;
            if (c > 0) {
                active++;
                run++;
                if (run > best) { best = run; }
                last = days[i].date;
            } else {
                run = 0;
            }
        }
        // Current streak: walk backwards, tolerating "today not yet committed".
        var today = new Date(); today.setHours(0, 0, 0, 0);
        for (var j = days.length - 1; j >= 0; j--) {
            var d = parseDay(days[j].date);
            if (d > today) { continue; }
            if ((days[j].count || 0) > 0) { current++; }
            else if (current === 0 && d.getTime() === today.getTime()) { continue; }
            else { break; }
        }
        return { total: total, active: active, best: best, current: current, last: last };
    }

    function extractCommits(events, limit) {
        var out = [];
        if (!events || !events.length) { return out; }
        for (var i = 0; i < events.length && out.length < limit; i++) {
            var ev = events[i];
            if (!ev || ev.type !== 'PushEvent' || !ev.payload || !ev.payload.commits) { continue; }
            var repo = (ev.repo && ev.repo.name) || '';
            if (!RE_REPO.test(repo)) { continue; }
            var commits = ev.payload.commits;
            // Newest commit of a push is last in the array.
            for (var k = commits.length - 1; k >= 0 && out.length < limit; k--) {
                var c = commits[k];
                if (!c || !c.sha || !RE_SHA.test(c.sha)) { continue; }
                if (c.distinct === false) { continue; }
                out.push({
                    repo: repo,
                    short: repo.split('/').pop(),
                    sha: c.sha,
                    msg: c.message,
                    when: ev.created_at,
                    url: 'https://github.com/' + repo + '/commit/' + c.sha
                });
            }
        }
        return out;
    }

    /* ---------------- rendering ---------------- */

    function buildHeader(root, state) {
        var head = h('div', 'gh-head');

        var left = h('div', 'gh-head-left');
        var mark = h('span', 'gh-mark');
        mark.appendChild(svg(GH_ICON, true));
        left.appendChild(mark);

        var titles = h('div', 'gh-titles');
        titles.appendChild(h('h3', null, 'GitHub Activity'));
        var meta = h('p', 'gh-meta');
        var dot = h('span', 'gh-dot');
        dot.setAttribute('data-state', state.mode);
        meta.appendChild(dot);
        meta.appendChild(h('span', null, state.text));
        titles.appendChild(meta);
        left.appendChild(titles);
        head.appendChild(left);

        var link = h('a', 'gh-profile', '@' + CFG.user);
        link.href = 'https://github.com/' + CFG.user;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', 'View ' + CFG.user + ' on GitHub (opens in a new tab)');
        link.appendChild(svg(ARROW, false));
        head.appendChild(link);

        root.appendChild(head);
    }

    function buildStats(root, stats) {
        if (!stats.length) { return; }
        var ul = h('ul', 'gh-stats');
        for (var i = 0; i < stats.length; i++) {
            var li = h('li', 'gh-stat');
            li.appendChild(h('span', 'gh-stat-value', stats[i][0]));
            li.appendChild(h('span', 'gh-stat-label', stats[i][1]));
            ul.appendChild(li);
        }
        root.appendChild(ul);
    }

    function buildHeatmap(root, days, summary) {
        // Bucket into Sun-started weeks, padding the first week.
        var weeks = [], cur = [], i;
        var lead = parseDay(days[0].date).getDay();
        for (i = 0; i < lead; i++) { cur.push(null); }
        for (i = 0; i < days.length; i++) {
            cur.push(days[i]);
            if (cur.length === 7) { weeks.push(cur); cur = []; }
        }
        if (cur.length) {
            while (cur.length < 7) { cur.push(null); }
            weeks.push(cur);
        }
        if (weeks.length > CFG.weeks) { weeks = weeks.slice(weeks.length - CFG.weeks); }

        var block = h('section', 'gh-graph-block');
        block.setAttribute('aria-labelledby', 'gh-graph-label');

        var head = h('div', 'gh-graph-head');
        var lbl = h('h4', 'gh-label', num(summary.total) + ' contributions in the last year');
        lbl.id = 'gh-graph-label';
        head.appendChild(lbl);

        var legend = h('div', 'gh-legend');
        legend.setAttribute('aria-hidden', 'true');
        legend.appendChild(h('span', null, 'Less'));
        for (i = 0; i <= 4; i++) {
            var lc = h('span', 'gh-legend-cell');
            lc.setAttribute('data-level', String(i));
            legend.appendChild(lc);
        }
        legend.appendChild(h('span', null, 'More'));
        head.appendChild(legend);
        block.appendChild(head);

        var wrap = h('div', 'gh-graph-wrap');
        var scroll = h('div', 'gh-scroll');
        var graph = h('div', 'gh-graph');
        if (!reduceMotion) { graph.setAttribute('data-anim', 'on'); }

        // Day-of-week gutter
        var daycol = h('div', 'gh-daycol');
        daycol.setAttribute('aria-hidden', 'true');
        for (i = 0; i < 7; i++) {
            daycol.appendChild(h('span', null, (i === 1 || i === 3 || i === 5) ? DAYS[i] : ''));
        }
        graph.appendChild(daycol);

        var grid = h('div', 'gh-weeks');
        grid.setAttribute('role', 'grid');
        grid.setAttribute('aria-label', 'Daily contribution heatmap for the last ' + weeks.length + ' weeks');

        var months = h('div', 'gh-months');
        var marks = [];          // {label, anchorCell} — positioned after layout
        var lastMonth = -1;

        for (var w = 0; w < weeks.length; w++) {
            var firstReal = null;
            for (i = 0; i < 7; i++) { if (weeks[w][i]) { firstReal = weeks[w][i]; break; } }
            var mark = null;
            if (firstReal) {
                var m = parseDay(firstReal.date).getMonth();
                if (m !== lastMonth && w < weeks.length - 1) {
                    lastMonth = m;
                    mark = h('span', 'gh-month', MONTHS[m]);
                    months.appendChild(mark);
                }
            }
            for (i = 0; i < 7; i++) {
                var day = weeks[w][i];
                var cell = h('div', 'gh-cell');
                if (mark && i === 0) { marks.push([mark, cell]); mark = null; }
                cell.setAttribute('role', 'gridcell');
                if (!day) {
                    cell.className = 'gh-cell gh-pad';
                    cell.setAttribute('aria-hidden', 'true');
                } else {
                    var count = day.count || 0;
                    var d = parseDay(day.date);
                    cell.setAttribute('data-level', String(day.level || 0));
                    cell.setAttribute('data-count', String(count));
                    cell.setAttribute('data-date', prettyDay(d));
                    cell.setAttribute('aria-label',
                        (count === 0 ? 'No contributions' : count + (count === 1 ? ' contribution' : ' contributions')) +
                        ' on ' + prettyDay(d));
                }
                if (!reduceMotion) {
                    cell.style.animationDelay = Math.min(w * 8, 520) + 'ms';
                }
                grid.appendChild(cell);
            }
        }

        grid.appendChild(months);
        graph.appendChild(grid);
        scroll.appendChild(graph);
        wrap.appendChild(scroll);

        // Tooltip
        var tip = h('div', 'gh-tip');
        var tipCount = h('b', null, '');
        var tipDate = h('i', null, '');
        tip.appendChild(tipCount);
        tip.appendChild(document.createTextNode(' '));
        tip.appendChild(tipDate);
        wrap.appendChild(tip);

        grid.addEventListener('mouseover', function (e) {
            var t = e.target;
            if (!t || !t.classList || !t.classList.contains('gh-cell') || t.classList.contains('gh-pad')) { return; }
            var c = parseInt(t.getAttribute('data-count'), 10) || 0;
            tipCount.textContent = c === 0 ? 'No contributions' : c + (c === 1 ? ' contribution' : ' contributions');
            tipDate.textContent = 'on ' + t.getAttribute('data-date');
            var gb = wrap.getBoundingClientRect();
            var cb = t.getBoundingClientRect();
            tip.style.left = (cb.left - gb.left + cb.width / 2) + 'px';
            tip.style.top = (cb.top - gb.top - 8) + 'px';
            tip.setAttribute('data-show', '1');
        });
        grid.addEventListener('mouseleave', function () { tip.removeAttribute('data-show'); });

        block.appendChild(wrap);

        if (summary.last) {
            var note = h('p', 'gh-note', 'Most recent contribution ' + agoDate(summary.last) +
                ' · ' + summary.active + ' active days · longest streak ' + summary.best +
                (summary.best === 1 ? ' day' : ' days'));
            block.appendChild(note);
        }

        root.appendChild(block);

        // After layout: pin month labels to the real column offsets (immune to
        // CSS cell-size changes) and park the scroll on the most recent weeks.
        requestAnimationFrame(function () {
            for (var n = 0; n < marks.length; n++) {
                marks[n][0].style.left = marks[n][1].offsetLeft + 'px';
            }
            if (scroll.scrollWidth > scroll.clientWidth) { scroll.scrollLeft = scroll.scrollWidth; }
        });
    }

    function buildList(root, title, items, note) {
        var sec = h('section', 'gh-recent');
        var head = h('div', 'gh-recent-head');
        var hh = h('h4', 'gh-label', title);
        hh.id = 'gh-recent-label';
        head.appendChild(hh);
        sec.appendChild(head);
        sec.setAttribute('aria-labelledby', 'gh-recent-label');

        var ul = h('ul', 'gh-list');
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var li = h('li', 'gh-item');
            var a = h('a');
            a.href = it.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.setAttribute('aria-label', it.aria);
            a.appendChild(h('span', 'gh-repo', it.repo));
            a.appendChild(h('span', 'gh-msg', it.text));
            a.appendChild(h('span', 'gh-time', it.time));
            li.appendChild(a);
            ul.appendChild(li);
        }
        sec.appendChild(ul);
        if (note) { sec.appendChild(h('p', 'gh-note', note)); }
        root.appendChild(sec);
    }

    function buildFallback(root, message) {
        var box = h('div', 'gh-fallback');
        box.appendChild(h('p', null, message));
        var btn = h('a', 'gh-btn', 'View my GitHub profile');
        btn.href = 'https://github.com/' + CFG.user;
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.appendChild(svg(ARROW, false));
        box.appendChild(btn);
        root.appendChild(box);
    }

    /* ---------------- orchestration ---------------- */

    function run(root) {
        CFG.user = root.getAttribute('data-gh-user') || CFG.user;
        var wk = parseInt(root.getAttribute('data-gh-weeks'), 10);
        if (wk > 0 && wk <= 53) { CFG.weeks = wk; }

        var base = 'https://api.github.com/users/' + encodeURIComponent(CFG.user);

        var jobs = [
            load('contrib', 'https://github-contributions-api.jogruber.de/v4/' +
                encodeURIComponent(CFG.user) + '?y=last', false),
            load('events', base + '/events/public?per_page=100', true),
            load('repos', base + '/repos?sort=pushed&per_page=100', true)
        ];

        Promise.all(jobs).then(function (r) {
            try {
                render(root, r[0], r[1], r[2]);
            } catch (err) {
                clear(root);
                buildHeader(root, { mode: 'off', text: 'unavailable' });
                buildFallback(root, 'The live activity feed could not be rendered right now. My work is all still there.');
            }
        });
    }

    function render(root, contribRes, eventsRes, reposRes) {
        var contrib = contribRes && contribRes.data && Array.isArray(contribRes.data.contributions)
            ? contribRes.data.contributions : null;
        var events = eventsRes && Array.isArray(eventsRes.data) ? eventsRes.data : null;
        var repos = reposRes && Array.isArray(reposRes.data) ? reposRes.data : null;

        clear(root);

        // Total failure -> intentional static card.
        if (!contrib && !events && !repos) {
            buildHeader(root, { mode: 'off', text: 'offline' });
            buildFallback(root, 'GitHub’s public API is rate limited to 60 requests an hour per visitor, ' +
                'so this panel occasionally takes a breather. Everything I build is public — have a look.');
            return;
        }

        var ages = [];
        var stale = false;
        [contribRes, eventsRes, reposRes].forEach(function (x) {
            if (x) { ages.push(x.age); if (x.stale) { stale = true; } }
        });
        var age = ages.length ? Math.min.apply(null, ages) : 0;

        buildHeader(root, {
            mode: stale ? 'stale' : 'live',
            text: (stale ? 'cached · ' : 'synced ') + ago(age)
        });

        // An endpoint that answers with nothing is the same as no endpoint.
        if (contrib && !contrib.length) { contrib = null; }
        if (repos && !repos.length) { repos = null; }

        var summary = contrib ? analyseContributions(contrib) : null;
        if (summary && summary.total === 0) { summary = null; contrib = null; }

        var stats = [];

        if (repos) {
            stats.push([num(repos.length), 'Public repos']);
        }
        if (summary) {
            stats.push([num(summary.total), 'Contributions']);
            stats.push([num(summary.active), 'Active days']);
            stats.push([summary.current > 0 ? num(summary.current) : num(summary.best),
            summary.current > 0 ? 'Day streak' : 'Longest streak']);
        } else if (repos) {
            var langs = {};
            var stars = 0, newest = null;
            repos.forEach(function (r) {
                if (r.language) { langs[r.language] = 1; }
                stars += r.stargazers_count || 0;
                if (!newest || Date.parse(r.pushed_at) > Date.parse(newest)) { newest = r.pushed_at; }
            });
            if (Object.keys(langs).length) { stats.push([num(Object.keys(langs).length), 'Languages']); }
            if (stars) { stats.push([num(stars), 'Stars earned']); }
            if (newest) { stats.push([agoDate(newest).replace(' ago', ''), 'Since last push']); }
        }

        var commits = extractCommits(events, CFG.commits);

        // Nothing real to show -> one intentional fallback card, never a wall of zeros.
        if (!summary && !commits.length && !repos) {
            buildFallback(root, 'The live feed is quiet right now — GitHub’s public API limits every ' +
                'visitor to 60 requests an hour. The real history is all on my profile.');
            return;
        }

        buildStats(root, stats);

        if (summary) {
            buildHeatmap(root, contrib, summary);
        }

        if (commits.length) {
            buildList(root, 'Recent commits', commits.map(function (c) {
                return {
                    url: c.url,
                    repo: c.short,
                    text: firstLine(c.msg, 90),
                    time: agoDate(c.when),
                    aria: 'Commit in ' + c.short + ': ' + firstLine(c.msg, 90) + ', ' + agoDate(c.when) +
                        ' (opens on GitHub in a new tab)'
                };
            }), null);
        } else if (repos) {
            // The public events feed only retains ~90 days / 300 events. When it is
            // empty we show the most recently pushed repositories instead — still
            // real, never an empty box.
            var recent = repos.slice().filter(function (r) {
                return r && safeUrl(r.html_url);
            }).sort(function (a, b) {
                return Date.parse(b.pushed_at) - Date.parse(a.pushed_at);
            }).slice(0, CFG.commits);

            buildList(root, 'Recently updated repositories', recent.map(function (r) {
                var desc = r.description || (r.language ? r.language + ' repository' : 'No description');
                return {
                    url: safeUrl(r.html_url),
                    repo: r.name,
                    text: firstLine(desc, 90),
                    time: agoDate(r.pushed_at),
                    aria: 'Repository ' + r.name + ': ' + firstLine(desc, 90) + ', updated ' +
                        agoDate(r.pushed_at) + ' (opens on GitHub in a new tab)'
                };
            }), 'GitHub’s public events feed only keeps the last 90 days, so this falls back to ' +
            'recently pushed repositories.');
        } else {
            // Heatmap rendered but the repo/commit endpoints are unavailable —
            // close the card off deliberately instead of ending on a bare grid.
            var note = h('p', 'gh-note', 'The commit feed is taking a breather — GitHub caps ' +
                'anonymous API calls at 60 an hour per visitor. ');
            var a = h('a', 'gh-repo', 'Browse the repositories →');
            a.href = 'https://github.com/' + CFG.user + '?tab=repositories';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            note.appendChild(a);
            root.appendChild(note);
        }
    }

    function boot() {
        var root = document.getElementById('gh-activity');
        if (!root) { return; }
        if (typeof window.fetch !== 'function' || typeof Promise !== 'function') {
            clear(root);
            buildHeader(root, { mode: 'off', text: 'unavailable' });
            buildFallback(root, 'This browser can’t load the live feed, but everything I build is public on GitHub.');
            return;
        }
        run(root);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
