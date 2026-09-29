    function Iter5StorageSources(props) {
      var data = props.data
      return h('div', { className: 'i5-storage-table-wrap' }, h('table', { className: 'i5-storage-table' },
        h('thead', null, h('tr', null, [L('来源','Source'), L('索引状态','Index status'), L('说明','Details'), L('操作','Actions')].map(function (label) { return h('th', { key: label, scope: 'col' }, label) }))),
        h('tbody', null, (data.sources || []).map(function (source) {
          var enabled = data.indexEnabled !== false
          var status = !enabled ? L('未启用','Disabled') : source.status === 'ok' ? L('一致','Consistent') : source.status === 'stale' ? L('待重建','Needs rebuild') : L('需检查','Needs inspection')
          return h('tr', { key: source.sourceRef },
            h('td', null, h('strong', null, source.sourceRef), source.file ? h('small', null, source.file) : null),
            h('td', null, h('span', { className: 'i5-tag', 'data-state': enabled ? source.status : 'disabled' }, status)),
            h('td', null, (source.reasons || []).join(' · ') || '—'),
            h('td', null, h('button', { disabled: !enabled || source.status !== 'stale', onClick: function () { props.act('repair', { items: [{ file: source.file, sourceRef: source.sourceRef }] }) } }, L('修复索引','Repair index'))))
        }))))
    }
