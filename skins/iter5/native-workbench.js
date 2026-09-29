    function Iter5Home(props) {
      var result = useIter5Data(function () { return Promise.allSettled([iter5MemorySnapshot(), apiGet(API.handoffState, { sessionId: currentSessionIdClient() }), apiGet(API.calendar), apiGet(API.semanticStatus)]) }, [props.nonce])
      var values = result.data || []
      function data(i) { return values[i] && values[i].status === 'fulfilled' ? values[i].value : null }
      var memory = data(0), state = memory && memory[1], list = memory && memory[0], handoff = data(1), calendar = data(2), sem = data(3)
      var files = memory ? iter5MemoryRows(list, state) : null
      var recent = files && files.slice().sort(function (a,b) { return String(b.date || '').localeCompare(String(a.date || '')) })
      var water = handoff && handoff.waterLevel
      var known = water && water.window > 0 && Number.isFinite(water.ratio) && water.modelKnown !== false
      var today = iter5Date(new Date())
      var events = calendar && Array.isArray(calendar.entries) ? calendar.entries.filter(function (e) { return e.date === today }).sort(function (a,b) { return String(a.time || '').localeCompare(String(b.time || '')) }) : null
      var tier = sem ? sem.resolvedTier === 'c3' ? 'C3 · Python' : sem.resolvedTier === 'c2' ? 'C2 · ' + L('内置语义', 'Semantic') : 'C1 · BM25' : L('暂不可用', 'Unavailable')
      function sectionTitle(icon, title, action, target) { return h('div', { className: 'i5-section-heading' }, h('h2', null, h(Iter5Icon, { name: icon }), title), h('button', { className: 'i5-link', onClick: function () { props.onNav(target) } }, action, ' →')) }
      function info(label, value) { return h('div', { className: 'i5-session-field' }, h('dt', null, label), h('dd', null, value)) }
      return h('div', { className: 'i5-home i5-native-home' },
        result.error || values.some(function (r) { return r.status === 'rejected' }) ? h(Iter5Error, { error: result.error || L('部分数据暂不可用', 'Some data is unavailable'), retry: result.retry }) : null,
        h('div', { className: 'i5-native-metrics', 'aria-busy': result.loading },
          h(Iter5Stat, { icon: 'library', label: L('记忆文件', 'Memory files'), value: files && files.length, hint: L('总量 · 含日志与反思', 'Includes logs and reflections') }),
          h(Iter5Stat, { icon: 'folder', label: L('项目日志', 'Project logs'), value: list && list.logs ? list.logs.length : null, hint: L('记忆文件中的日志', 'Logs within memory files') }),
          h(Iter5Stat, { icon: 'recall', label: L('反思记录', 'Reflections'), value: list && list.reflections ? list.reflections.length : null, hint: L('记忆文件中的反思', 'Reflections within memory files') }),
          h('div', { className: 'i5-native-metrics-action' }, h('p', null, L('让过去的积累，成为下一次的起点。', 'Build on what you learned.')), h('button', { className: 'i5-primary-soft', onClick: function () { props.onNav('library') } }, L('打开记忆库', 'Open memory'), ' →'))),
        h('div', { className: 'i5-native-home-columns' },
          h(Iter5Card, { className: 'i5-native-recent' }, sectionTitle('timeline', L('最近记录', 'Recent records'), L('查看全部', 'View all'), 'library'),
            result.loading ? h(Loading) : recent && recent.length ? recent.slice(0, 8).map(function (r) { return h('button', { className: 'i5-activity-row', key: r.path, onClick: function () { props.onNav('library', { path: r.path }) } }, h('span', { className: 'i5-badge' }, h(Iter5Icon, { name: 'note' })), h('div', null, h('strong', null, r.label), h('small', null, r.kind === 'user' ? L('用户偏好', 'User preferences') : r.kind === 'reflections' ? L('反思记录', 'Reflection') : r.kind === 'logs' ? L('项目日志', 'Project log') : L('项目笔记', 'Project notes'))), h('small', null, fmtSize(r.size))) }) : h(Iter5Empty, { title: files ? L('还没有记录', 'No records yet') : L('记忆暂不可用', 'Memory unavailable'), text: L('记忆文件会按当前工作区显示。', 'Memory files appear for the current workspace.') })),
          h('div', { className: 'i5-native-session-column' },
            h(Iter5Card, null, sectionTitle('pulse', L('当前会话', 'Current session'), L('查看接续', 'Continue'), 'handoff'),
              h('dl', { className: 'i5-session-details' },
                info(L('工作区', 'Workspace'), state && state.ws ? pathName(state.ws) : L('尚未选择', 'Not selected')),
                info(L('当前检索', 'Retrieval'), tier),
                info(L('上下文水位', 'Context used'), known ? Math.round(water.ratio * 100) + '%' : L('尚无可靠计量', 'Not measured')),
                info(L('上下文容量', 'Context capacity'), known ? water.tokens.toLocaleString() + ' / ' + water.window.toLocaleString() + ' tokens' : '—'),
                info(L('自动沉淀', 'Automatic memory'), state && state.autoStats && typeof state.autoStats.count === 'number' ? state.autoStats.count : '—'))),
            h(Iter5Card, { className: 'i5-daily-card' }, sectionTitle('calendar', L('今日日程', "Today's schedule"), L('管理日程', 'Manage'), 'calendar'),
              h('p', { className: 'i5-muted' }, today),
              events && events.length ? events.map(function (e,i) { return h('button', { key: i, className: 'i5-activity-row', onClick: function () { props.onNav('calendar') } }, h('span', { className: 'i5-event-dot', 'data-done': String(!!e.done) }, e.done ? '✓' : ''), h('small', null, e.time || '—'), h('strong', null, e.title)) }) : h('p', { className: 'i5-muted' }, events ? L('今天没有安排。', 'No plans today.') : L('日程暂不可用', 'Schedule unavailable'))))),
        h('details', { className: 'i5-card i5-secondary-details' }, h('summary', null, L('工作区概览、总结与技术详情', 'Workspace overview, summaries and technical details')), h('div', { className: 'i5-hosted' }, h(OverviewTab, { nonce: props.nonce }))))
    }
