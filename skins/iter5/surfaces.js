    // Each registered surface owns a theme boundary, including sibling overlays.
    function Iter5Surface(props) {
      var deep = useDeepTheme()
      var tick = useTick()
      useEffect(function () { return controller.subscribe(tick[1]) }, [])
      useEffect(function () {
        var style = document.getElementById('dam-shared-ui-style')
        if (!style) {
          style = document.createElement('style')
          style.id = 'dam-shared-ui-style'
          style.dataset.plugin = '@a9i5k4/dsh-auto-memory'
          style.textContent = ITER5_CSS
          document.head.appendChild(style)
        }
        style.dataset.users = String(Number(style.dataset.users || 0) + 1)
        return function () {
          var count = Number(style.dataset.users || 1) - 1
          style.dataset.users = String(count)
          if (!count) style.remove()
        }
      }, [])
      var node = h('div', { 'data-dam-theme': props.kind || 'overlay', 'data-deep': String(deep),
        style: { '--dam-user-scale': FONT_SCALE_VALUES[fontScale] || '1' } }, props.children)
      // shell.overlay lives in a z-index:20 host stacking context, below settings.
      // Portal the boundary too, so sibling dialogs retain their theme tokens.
      return createPortal && ['panel', 'dialogs', 'autocont'].indexOf(props.kind) >= 0
        ? createPortal(node, document.body) : node
    }
    function Iter5HostSettings(props) {
      var identity = useState(iter5Identity)
      var root = useRef(null)
      useEffect(function () {
        function guard(e) {
          var el = root.current, dialog = el && el.closest('[role=dialog]')
          if (!el || !dialog || !el.querySelector('[data-i5-dirty=true]')) return
          if (e.type === 'click' && (!dialog.contains(e.target) || el.contains(e.target) || !e.target.closest('button'))) return
          if (e.type === 'keydown' && (e.key !== 'Escape' || dialogState)) return
          if (!window.confirm(L('有未保存的修改，确定离开？', 'Discard unsaved changes and leave?'))) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
          }
        }
        window.addEventListener('click', guard, true)
        window.addEventListener('keydown', guard, true)
        return function () { window.removeEventListener('click', guard, true); window.removeEventListener('keydown', guard, true) }
      }, [])
      useEffect(function () {
        var timer = setInterval(function () { identity[1](iter5Identity()) }, 500)
        return function () { clearInterval(timer) }
      }, [])
      return h(Iter5Surface, { kind: 'settings' },
        h('div', { ref: root, 'data-iter5': '', 'data-i5-embedded': '' },
          h('div', { className: 'i5-main' }, h(Iter5Settings, { key: identity[0], close: props && props.close }))))
    }
    var iter5SettingsSequence = 0
