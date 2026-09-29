    function iter5WorkspaceLayout(workspaces, graph) {
      var nodes = [], edges = [], centers = [], columns = Math.max(1, Math.ceil(Math.sqrt(workspaces.length)))
      var groups = workspaces.map(function (ws) {
        var topics = ws.graphTopics && ws.graphTopics.length ? ws.graphTopics : (ws.items || []).map(function (item) { return { label: typeof item === 'string' ? item : JSON.stringify(item) } })
        return { ws: ws, topics: topics }
      })
      var rings = Math.max(1, Math.ceil(Math.max.apply(null, groups.map(function (group) { return group.topics.length }).concat([0])) / 6))
      var cell = 580 + (rings - 1) * 440
      groups.forEach(function (group, index) {
        var center = { x: 40 + cell * (index % columns) + cell / 2, y: 40 + cell * Math.floor(index / columns) + cell / 2, width: 200, height: 76, workspace: group.ws, label: group.ws.name || pathName(group.ws.path), kind: 'workspace', id: 'w' + index }
        nodes.push(center); centers.push(center)
        group.topics.forEach(function (topic, i) {
          var ring = Math.floor(i / 6), count = Math.min(6, group.topics.length - ring * 6), angle = -Math.PI / 2 + (i % 6) * 2 * Math.PI / count
          var radius = 200 + ring * 220
          var node = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, width: 176, height: 68, label: String(topic.label || topic || ''), detail: String(topic.detail || ''), workspace: group.ws, kind: 'topic', id: 't' + index + '-' + i }
          nodes.push(node); edges.push({ from: center, to: node, shared: false })
        })
      })
      function find(value) { var matches = centers.filter(function (node) { return node.workspace.path === value || node.workspace.name === value }); return matches.length === 1 ? matches[0] : null }
      ;(graph && graph.links || []).forEach(function (link) { var from = find(link.from), to = find(link.to); if (from && to) edges.push({ from: from, to: to, shared: true, label: link.label || '' }) })
      return { nodes: nodes, edges: edges, width: Math.max(580, columns * cell + 80), height: Math.max(580, Math.ceil(groups.length / columns) * cell + 80) }
    }
    function Iter5WorkspaceGraph(props) {
      var root = useRef(null), width = useState(640), height = useState(540), drag = useRef(null), overview = useState(false)
      var current = props.current || (props.workspaces || [])[0]
      var shown = overview[0] ? props.workspaces || [] : current ? [current] : []
      var layout = iter5WorkspaceLayout(shown, props.graph)
      useEffect(function () {
        var el = root.current
        if (!el) return
        function measure() { width[1](Math.max(1, el.clientWidth)); height[1](Math.max(1, el.clientHeight)) }
        measure()
        var observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        if (observer) observer.observe(el)
        return function () { if (observer) observer.disconnect() }
      }, [])
      useEffect(function () { if (root.current) { root.current.scrollLeft = 0; root.current.scrollTop = 0 } }, [props.fitKey])
      var fit = Math.min((width[0] - 16) / layout.width, (height[0] - 16) / layout.height, 1)
      var zoom = Math.max(.25, Number(props.scale) || 1), factor = Math.max(.01, fit) * zoom
      function release(e) { if (!drag.current || e.pointerId !== drag.current.id) return; drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }
      return h('div', { className: 'i5-native-map-root' },
        h('label', { className: 'i5-native-map-scope' }, L('查看范围 ', 'View '), h('select', { 'aria-label': L('关系图范围', 'Graph scope'), value: overview[0] ? '__all' : current && current.path || '', onChange: function (e) { overview[1](e.target.value === '__all'); var target = (props.workspaces || []).find(function (ws) { return ws.path === e.target.value }); if (target) props.onSelect(target) } }, (props.workspaces || []).map(function (ws) { return h('option', { key: ws.path, value: ws.path }, ws.name || pathName(ws.path)) }), h('option', { value: '__all' }, L('全部工作区', 'All workspaces')))),
        h('div', { className: 'i5-native-map', ref: root, 'data-fit-scale': fit,
        onPointerDown: function (e) { if (e.button !== 0 || e.target.closest('[data-native-map-node]')) return; drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop }; e.currentTarget.setPointerCapture(e.pointerId) },
        onPointerMove: function (e) { var start = drag.current; if (!start || start.id !== e.pointerId) return; e.currentTarget.scrollLeft = start.left + start.x - e.clientX; e.currentTarget.scrollTop = start.top + start.y - e.clientY },
        onPointerUp: release, onPointerCancel: release, onLostPointerCapture: function () { drag.current = null } },
        h('svg', { viewBox: '0 0 ' + layout.width + ' ' + layout.height, width: layout.width * factor, height: layout.height * factor, role: 'group', 'aria-label': L('工作区与记忆主题关系图', 'Workspace and memory topic graph') },
          layout.edges.map(function (edge, i) { return h('g', { key: 'e' + i }, h('line', { x1: edge.from.x, y1: edge.from.y, x2: edge.to.x, y2: edge.to.y, stroke: edge.shared ? 'var(--i5-muted)' : 'var(--i5-fill)', strokeWidth: 1.5, strokeDasharray: edge.shared ? '5 5' : undefined }), edge.label ? h('text', { x: (edge.from.x + edge.to.x) / 2, y: (edge.from.y + edge.to.y) / 2 - 8, textAnchor: 'middle', fill: 'var(--i5-secondary)', fontSize: 12 }, edge.label) : null) }),
          layout.nodes.map(function (node) {
            var active = node.kind === 'workspace', lines = Array.from(node.label).reduce(function (out, letter, i) { var n = Math.floor(i / 13); out[n] = (out[n] || '') + letter; return out }, [])
            return h('g', { key: node.id, 'data-native-map-node': node.kind, role: 'button', tabIndex: 0, 'aria-label': node.label, onClick: function () { props.onSelect(node.workspace) }, onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onSelect(node.workspace) } } },
              h('title', null, node.label + (node.detail ? '\n' + node.detail : '')),
              h('rect', { x: node.x - node.width / 2, y: node.y - node.height / 2, width: node.width, height: node.height, rx: 12, fill: active ? 'var(--i5-primary)' : 'var(--i5-bg)', stroke: active ? 'var(--i5-primary)' : 'var(--i5-fill)', strokeOpacity: active ? 1 : .45 }),
              h('text', { x: node.x, y: node.y - 8, textAnchor: 'middle', fill: active ? 'var(--i5-on-accent)' : 'var(--i5-text)', fontSize: active ? 17 : 14, fontWeight: 600 }, lines.slice(0, 2).map(function (line, i) { return h('tspan', { key: i, x: node.x, dy: i ? 18 : 0 }, line + (i === 1 && lines.length > 2 ? '…' : '')) })),
              active ? h('text', { x: node.x, y: node.y + 25, textAnchor: 'middle', fill: 'var(--i5-on-accent)', fontSize: 12 }, typeof node.workspace.logCount === 'number' ? node.workspace.logCount + L(' 份日志', ' logs') : L('工作区', 'Workspace')) : null)
          }))),
        h('div', { className: 'i5-native-map-topics' }, layout.nodes.filter(function (node) { return node.kind === 'topic' }).map(function (node) { return h('button', { key: node.id, onClick: function () { props.onSelect(node.workspace) } }, node.label) })))
    }
