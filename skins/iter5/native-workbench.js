    function Iter5Home(props) {
      var result = useIter5Data(async function () {
        var settled = await Promise.allSettled([iter5MemorySnapshot(), apiGet(API.handoffState, { sessionId: currentSessionIdClient() }), apiGet(API.calendar), apiGet(API.semanticStatus)])
        // C10: 最近记录需要真实正文首行摘要——与轻面板相同的受控读取,仅前 8 条
        var previews = {}
        var mem = settled[0] && settled[0].status === 'fulfilled' ? settled[0].value : null
        if (mem) {
          var topRows = iter5MemoryRows(mem[0], mem[1]).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')) }).slice(0, 8)
          var got = await Promise.allSettled(topRows.map(function (r) { return apiGet(API.file, { path: r.path, ws: currentWs() }) }))
          got.forEach(function (g, i) { if (g.status === 'fulfilled') previews[topRows[i].path] = String(g.value.content || '').split('\n').filter(function (line) { return line.trim() && !/^\s*#/.test(line) }).join(' ').slice(0, 120) })
        }
        settled.push({ status: 'fulfilled', value: previews })
        return settled
      }, [props.nonce])
      var values = result.data || []
      function data(i) { return values[i] && values[i].status === 'fulfilled' ? values[i].value : null }
      var memory = data(0), state = memory && memory[1], list = memory && memory[0], handoff = data(1), calendar = data(2), sem = data(3), previews = data(4) || {}
      var files = memory ? iter5MemoryRows(list, state) : null
      var recent = files && files.slice().sort(function (a,b) { return String(b.date || '').localeCompare(String(a.date || '')) })
      function kindLabel(k) { return k === 'user' ? L('用户偏好', 'User preferences') : k === 'reflections' ? L('反思记录', 'Reflection') : k === 'logs' ? L('项目日志', 'Project log') : L('项目笔记', 'Project notes') }
      var water = handoff && handoff.waterLevel
      var known = water && water.window > 0 && Number.isFinite(water.ratio) && water.modelKnown !== false
      var today = iter5Date(new Date())
      var pct = known ? Math.max(0, Math.min(100, Math.round(water.ratio * 100))) : null
      var WD = L('周日|周一|周二|周三|周四|周五|周六', 'Sun|Mon|Tue|Wed|Thu|Fri|Sat').split('|')
      var days = []
      for (var di = 6; di >= 0; di--) { var dd = new Date(); dd.setDate(dd.getDate() - di); var dk = iter5Date(dd); days.push({ date: dk, label: WD[dd.getDay()], count: 0, today: dk === today }) }
      ;(files || []).forEach(function (r) { if (!r.date) return; for (var dj = 0; dj < days.length; dj++) if (days[dj].date === r.date) { days[dj].count++; break } })
      var maxDay = 0, weekTotal = 0
      days.forEach(function (d) { if (d.count > maxDay) maxDay = d.count; weekTotal += d.count })
      var COMP_HUES = { notes: 'var(--i5-blue)', logs: 'var(--i5-green)', reflections: 'var(--i5-purple)', user: 'var(--i5-orange)' }
      var comp = ['notes', 'logs', 'reflections', 'user'].map(function (k) { return { kind: k, color: COMP_HUES[k], label: k === 'notes' ? L('笔记', 'Notes') : k === 'logs' ? L('日志', 'Logs') : k === 'reflections' ? L('反思', 'Reflections') : L('偏好', 'Preferences'), count: (files || []).filter(function (r) { return r.kind === k }).length } }).filter(function (s) { return s.count > 0 })
      var compTotal = comp.reduce(function (s, x) { return s + x.count }, 0)
      var events = calendar && Array.isArray(calendar.entries) ? calendar.entries.filter(function (e) { return e.date === today }).sort(function (a,b) { return String(a.time || '').localeCompare(String(b.time || '')) }) : null
      var tier = sem ? sem.resolvedTier === 'c3' ? 'C3 · Python' : sem.resolvedTier === 'c2' ? 'C2 · ' + L('内置语义', 'Semantic') : 'C1 · BM25' : L('暂不可用', 'Unavailable')
      function sectionTitle(icon, title, action, target) { return h('div', { className: 'i5-section-heading' }, h('h2', null, h(Iter5Icon, { name: icon }), title), h('button', { className: 'i5-link', onClick: function () { props.onNav(target) } }, action, ' →')) }
      function info(label, value) { return h('div', { className: 'i5-session-field' }, h('dt', null, label), h('dd', null, value)) }
      return h('div', { className: 'i5-home i5-native-home' },
        result.error || values.some(function (r) { return r.status === 'rejected' }) ? h(Iter5Error, { error: result.error || L('部分数据暂不可用', 'Some data is unavailable'), retry: result.retry }) : null,
        h('div', { className: 'i5-native-band', 'aria-busy': result.loading },
          h('div', { className: 'i5-band-cell i5-band-water' },
            h('div', { className: 'i5-ring i5-water-ring' },
              h('svg', { viewBox: '0 0 100 100' },
                h('defs', null, h('linearGradient', { id: 'i5-water-grad', x1: '0', y1: '0', x2: '1', y2: '1' }, h('stop', { offset: '0%', stopColor: 'var(--i5-fill)' }), h('stop', { offset: '100%', stopColor: 'var(--i5-blue)' }))),
                h('circle', { className: 'i5-ring-track', cx: '50', cy: '50', r: '44', pathLength: '100' }),
                pct ? h('circle', { className: 'i5-ring-progress', cx: '50', cy: '50', r: '44', pathLength: '100', stroke: 'url(#i5-water-grad)', style: { '--i5-sweep': String(pct) } }) : null),
              h('div', null, h('strong', null, pct == null ? '—' : String(pct)), h('small', null, '%'))),
            h('div', { className: 'i5-band-water-copy' },
              h('strong', null, L('上下文水位', 'Context used')),
              h('small', null, known ? water.tokens.toLocaleString() + ' / ' + water.window.toLocaleString() + ' tokens' : L('接入会话后显示实时占用', 'Live usage once a session connects')))),
          h('div', { className: 'i5-band-cell i5-band-activity' },
            h('div', { className: 'i5-band-head' }, h('strong', null, L('近 7 日新增', 'Last 7 days')), h('span', null, weekTotal ? '+' + weekTotal : '—')),
            h('div', { className: 'i5-activity-chart', role: 'img', 'aria-label': L('近 7 日新增记忆', 'New memories in the last 7 days') },
              days.map(function (d) { return h('div', { key: d.date, className: 'i5-activity-col', 'data-today': d.today ? 'true' : undefined, title: d.date + ' · ' + d.count + ' ' + L('条', 'items') },
                h('i', d.count ? { style: { height: Math.max(10, Math.round(d.count / maxDay * 100)) + '%' } } : { 'data-zero': 'true' }),
                h('small', null, d.label)) }))),
          h('div', { className: 'i5-band-cell i5-band-comp' },
            h('div', { className: 'i5-band-head' }, h('strong', null, L('记忆构成', 'Composition')), h('span', null, files ? String(files.length) + ' ' + L('条', 'total') : '—')),
            h('div', { className: 'i5-comp-bar', role: 'img', 'aria-label': L('记忆构成占比', 'Memory composition') }, compTotal ? comp.map(function (s) { return h('i', { key: s.kind, style: { flexGrow: s.count, background: s.color }, title: s.label + ' ' + s.count }) }) : h('i', { 'data-zero': 'true' })),
            comp.length ? h('div', { className: 'i5-comp-legend' }, comp.map(function (s) { return h('span', { key: s.kind }, h('i', { style: { background: s.color } }), s.label + ' ' + s.count) })) : h('small', { className: 'i5-muted' }, L('写入记忆后显示构成', 'Composition appears once memories exist'))),
          h('div', { className: 'i5-native-metrics-action' }, h('p', null, recent && recent.length && recent[0].date ? L('最近写入 · ', 'Last write · ') + recent[0].date : files && files.length ? L('已积累 ', '') + files.length + L(' 条记忆', ' memories so far') : L('还没有记忆，从第一条开始。', 'No memories yet — start with the first one.')), h('button', { className: 'i5-primary-soft', onClick: function () { props.onNav('library') } }, L('打开记忆库', 'Open memory'), ' →'))),
        h('div', { className: 'i5-native-home-columns' },
          h(Iter5Card, { className: 'i5-native-recent' }, sectionTitle('timeline', L('最近记录', 'Recent records'), L('查看全部', 'View all'), 'library'),
            result.loading ? h(Loading) : recent && recent.length ? recent.slice(0, 8).map(function (r) { return h('button', { className: 'i5-activity-row', key: r.path, onClick: function () { props.onNav('library', { path: r.path }) } }, h('span', { className: 'i5-badge' }, h(Iter5Icon, { name: 'note' })), h('div', null, h('strong', null, r.label, ' · ', kindLabel(r.kind)), h('small', null, previews[r.path] || kindLabel(r.kind))), h('small', { className: 'i5-activity-meta' }, h('span', null, r.date || ''), h('span', null, fmtSize(r.size)))) }) : h(Iter5Empty, { title: files ? L('还没有记录', 'No records yet') : L('记忆暂不可用', 'Memory unavailable'), text: L('记忆文件会按当前工作区显示。', 'Memory files appear for the current workspace.') })),
          h('div', { className: 'i5-native-session-column' },
            h(Iter5Card, null, sectionTitle('pulse', L('当前会话', 'Current session'), L('查看接续', 'Continue'), 'handoff'),
              h('dl', { className: 'i5-session-details' },
                info(L('工作区', 'Workspace'), state && state.ws ? pathName(state.ws) : L('尚未选择', 'Not selected')),
                info(L('当前检索', 'Retrieval'), tier),
                info(L('自动沉淀', 'Automatic memory'), state && state.autoStats && typeof state.autoStats.count === 'number' ? state.autoStats.count : '—'))),
            h(Iter5Card, { className: 'i5-daily-card' }, sectionTitle('calendar', L('今日日程', "Today's schedule"), L('管理日程', 'Manage'), 'calendar'),
              h('p', { className: 'i5-muted' }, today),
              events && events.length ? events.map(function (e,i) { return h('button', { key: i, className: 'i5-activity-row', onClick: function () { props.onNav('calendar') } }, h('span', { className: 'i5-event-dot', 'data-done': String(!!e.done) }, e.done ? '✓' : ''), h('small', null, e.time || '—'), h('strong', null, e.title)) }) : h('p', { className: 'i5-muted' }, events ? L('今天没有安排。', 'No plans today.') : L('日程暂不可用', 'Schedule unavailable'))))),
        h('details', { className: 'i5-card i5-secondary-details' }, h('summary', null, L('工作区概览、总结与技术详情', 'Workspace overview, summaries and technical details')), h('div', { className: 'i5-hosted' }, h(OverviewTab, { nonce: props.nonce }))))
    }
