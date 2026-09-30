    // Two distinct presentations of the same resolved home data; no extra requests.
    function Iter5AlternateHome(p) {
      var water = p.variant === 'water'
      var count = p.files ? p.files.length : null
      var phase = !p.known ? L('会话未接入 · 仪表待机', 'No session · gauge idle') : p.hot ? L('已达接续阈值，可接续', 'Handoff threshold reached') : L('监测中 · 未达阈值', 'Monitoring · below threshold')
      var maximum = Math.max.apply(null, p.days.map(function (d) { return d.count }).concat([1]))
      var reading = h('div', { className: 'i5-alt-reading' },
        h('div', { className: 'i5-alt-label' }, L('上下文水位', 'Context water level')),
        h('strong', { className: 'i5-alt-percent i5-num' }, p.known ? p.pct : '—', p.known ? h('small', null, '%') : null),
        h('p', { className: 'i5-alt-tokens' }, p.known ? Number(p.water.tokens).toLocaleString() + ' / ' + Number(p.water.window).toLocaleString() + ' tokens' : '—'), h('p', null, phase))
      var loop = h('div', { className: 'i5-alt-loop' }, h('span', null, L('监测水位', 'Monitor level')), h('span', { 'aria-hidden': true }, '→'), h('button', { onClick: function () { p.onNav('handoff') } }, L('接续 HANDOFF', 'Handoff')), h('span', { 'aria-hidden': true }, '→'), h('span', null, L('新会话带记忆重生', 'Reborn with memory')))
      var ruler = h('div', { className: 'i5-alt-ruler', role: 'img', 'aria-label': L('上下文水位', 'Context water level') + ': ' + (p.known ? p.pct + '%' : '—') },
        h('div', { className: 'i5-alt-ruler-line' }),
        [0,20,40,60,80,100].map(function (n) { return h('span', { key: n, style: { left: n + '%' } }, n) }),
        p.known ? h('i', { className: 'i5-alt-pointer', style: { left: Math.max(0,Math.min(100,p.pct)) + '%' } }) : null,
        p.band ? h('b', { className: 'i5-alt-threshold', style: { left: p.band.lo + '%', width: (p.band.hi - p.band.lo) + '%' }, title: L('接续阈值', 'Threshold') + ' ' + p.band.lo + '–' + p.band.hi + '%' }) : null)
      var trace = h('section', { className: 'i5-alt-trace' }, h('h2', null, L('近 7 日沉淀', 'Last 7 days')),
        h('div', { className: 'i5-alt-total i5-num' }, p.files ? '+' + p.weekTotal : '—'),
        h('div', { className: 'i5-alt-days' }, p.days.map(function (d) { return h('div', { key:d.date, 'data-today': String(d.today) }, h('span', null, d.label, ' ', h('small', null, d.date.slice(5))), h('i', null, h('b', { style: { width: p.files ? (d.count / maximum * 100) + '%' : '0' } })), h('strong', null, p.files ? d.count : '—')) })))
      var mix = h('section', { className: 'i5-alt-mix' }, h('h2', null, L('记忆构成', 'Memory mix')), h('div', { className: 'i5-alt-total i5-num' }, count === null ? '—' : count),
        p.comp.map(function (c) { return h('div', { className: 'i5-alt-mix-row', key:c.kind }, h('span', null,c.label), h('i', null,h('b',{style:{width:p.compTotal ? c.count/p.compTotal*100+'%' : '0'}})), h('strong',null,p.files?c.count:'—'), h('small',null,p.compTotal?(c.count/p.compTotal*100).toFixed(1)+'%':'—')) }))
      var schedule = h('section', { className: 'i5-alt-schedule' }, h('h2', null, L('今日日程', "Today's schedule")), h('time', null,p.today),
        h('button', { className: 'i5-alt-calendar-link', onClick:function(){p.onNav('calendar')} }, p.calText),
        h('dl', { className: 'i5-alt-session' }, h('dt',null,L('工作区','Workspace')),h('dd',null,currentWs()?pathName(currentWs()):'—'),h('dt',null,L('检索','Retrieval')),h('dd',null,p.semantic?(p.semantic.resolvedTier||'c1').toUpperCase():'—'),h('dt',null,L('自动沉淀','Auto memory')),h('dd',null,p.state&&p.state.autoStats&&typeof p.state.autoStats.count==='number'?p.state.autoStats.count:'—')))
      function record(r) { return h('button',{className:'i5-alt-record',key:r.path,onClick:function(){p.onNav('library',{path:r.path})}},h('time',null,r.date?r.date.slice(5):'—'),h('span',null,p.previews[r.path]||r.label),h('small',null,fmtSize(r.size))) }
      var records = h('section', { className: 'i5-alt-records' },h('div',{className:'i5-alt-records-head'},h('h2',null,L('最近记录','Recent records')),h('small',null,L('按写入时间','By write time'))),
        p.result.loading?h(Loading):p.files===null?h(Iter5Empty,{title:L('记忆暂不可用','Memory unavailable')}):!p.files.length?h(Iter5Empty,{title:L('还没有记录','No records yet')}):water?
          h('div',{className:'i5-water-strata'},p.comp.map(function(c){var group=(p.recent||[]).filter(function(r){return r.kind===c.kind});return h('section',{className:'i5-water-layer',key:c.kind,'data-kind':c.kind},h('div',{className:'i5-water-layer-label'},c.label,h('strong',null,c.count)),h('div',null,group.length?group.slice(0,5).map(record):h('span',{className:'i5-muted'},'—'))) })):
          h('div',{className:'i5-editor-records'},(p.recent||[]).slice(0,9).map(record)))
      var error = p.result.error || p.values.some(function(r){return r.status==='rejected'}) ? h(Iter5Error,{error:p.result.error||L('部分数据暂不可用','Some data is unavailable'),retry:p.result.retry}) : null
      return h('div',{className:'i5-alt-home i5-alt-'+p.variant,'aria-busy':p.result.loading},error,
        water?h('div',{className:'i5-water-surface','aria-hidden':true},h('svg',{viewBox:'0 0 1440 60',preserveAspectRatio:'none'},h('path',{d:'M0 24 Q90 8 180 24 T360 24 T540 24 T720 24 T900 24 T1080 24 T1260 24 T1440 24 V60 H0Z'})),[0,1,2].map(function(n){return h('i',{key:n,className:'i5-water-mote',style:{left:(20+n*29)+'%',animationDelay:(-n*3)+'s'}})})):null,
        h('div',{className:'i5-alt-hero'},reading,h('div',{className:'i5-alt-story'},h('h2',null,L('记忆构成','Memory mix')),h('div',{className:'i5-alt-story-count'},count===null?'—':count,h('small',null,L(' 条记忆 · 4 通道',' memories · 4 channels'))),h('p',null,L('记忆文件会按当前工作区显示。','Memory files appear for the current workspace.')),loop)),
        water?h('div',{className:'i5-water-mid'},schedule):ruler,
        water?h('div',{className:'i5-water-handoff'},p.band?h('span',null,L('接续阈值','Threshold'),' ',p.band.lo,'–',p.band.hi,'%'):h('span',null,phase),loop):null,
        water?h('div',{className:'i5-water-bed'},trace,records):h(React.Fragment,null,h('div',{className:'i5-editor-columns'},trace,mix,schedule),records),
        h('details',{className:'i5-secondary-details'},h('summary',null,L('工作区概览、总结与技术详情','Workspace overview, summaries and technical details')),h('div',{className:'i5-hosted'},h(OverviewTab,{nonce:p.nonce}))))
    }
