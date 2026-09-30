#!/usr/bin/env python3
"""重建「双皮肤块」：旧款（3.2.5 的新款皮肤）为默认 + 三套变体（仪器/编辑/活水）经下拉选择。

一次性脚本。步骤：
  1. 改源：skins/iter5/style-choice.js（四款注册 + 默认 legacy + 互斥同步）
  2. 改源：skins/iter5/ui.js（三套变体里的「返回」改为回旧款）
  3. 改生成器：并入 legacy 块重建 + 挂载点双分派 + 样式旋钮
  4. 跑生成器
"""
import io, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

def read(p):
    return io.open(p, encoding='utf-8', newline='').read()

def write(p, s):
    io.open(p, 'w', encoding='utf-8', newline='').write(s)

def must(s, sub, n=1):
    c = s.count(sub)
    if c != n:
        raise SystemExit('expected %d of %r, got %d' % (n, sub[:80], c))

# ─────────────────────────────────────────────────────────
# 1) style-choice.js：四款注册，默认 legacy
# ─────────────────────────────────────────────────────────
p = 'skins/iter5/style-choice.js'
s = read(p)
NL = '\r\n' if '\r\n' in s else '\n'
J = lambda x: x.replace('\n', NL)

must(s, J("    var ITER5_STYLE_KEY = 'dsh-auto-memory.presentation.v1'\n    var ITER5_STYLE_IDS = ['instrument', 'editorial', 'water']"))
s = s.replace(J("    var ITER5_STYLE_KEY = 'dsh-auto-memory.presentation.v1'\n    var ITER5_STYLE_IDS = ['instrument', 'editorial', 'water']"), J("""    var ITER5_STYLE_KEY = 'dsh-auto-memory.presentation.v1'
    // ★2026-09-30（用户裁定）：下拉框同管**四款**——旧款（3.2.5 的「新款」，默认）
    //   + 仪器 / 编辑 / 活水三套变体。旧款不属于本块的样式系统，
    //   故它改变的是**挂载点分派**（damSkinStyleSet）而非样式变量；
    //   三套变体则走本块的 ITER5_STYLE_KEY（两者互斥，切换时互相写对方）。
    var ITER5_STYLE_IDS = ['instrument', 'editorial', 'water']
    var ITER5_ALL_SKINS = ['legacy', 'instrument', 'editorial', 'water']"""), 1)

must(s, J("    function iter5NormalizeStyle(value) { return ITER5_STYLE_IDS.indexOf(value) >= 0 ? value : 'instrument' }"))
s = s.replace(J("    function iter5NormalizeStyle(value) { return ITER5_STYLE_IDS.indexOf(value) >= 0 ? value : 'instrument' }"),
              J("    function iter5NormalizeStyle(value) { return ITER5_ALL_SKINS.indexOf(value) >= 0 ? value : 'legacy' }"), 1)

must(s, J("        try { iter5StyleValue = iter5NormalizeStyle(localStorage.getItem(ITER5_STYLE_KEY)) } catch (e) { iter5StyleValue = 'instrument' }"))
s = s.replace(J("        try { iter5StyleValue = iter5NormalizeStyle(localStorage.getItem(ITER5_STYLE_KEY)) } catch (e) { iter5StyleValue = 'instrument' }"),
              J("        try { var rawStyle = localStorage.getItem(ITER5_STYLE_KEY); iter5StyleValue = rawStyle ? iter5NormalizeStyle(rawStyle) : 'legacy' } catch (e) { iter5StyleValue = 'legacy' }"), 1)

must(s, J("""    function iter5SetStyle(value, persist) {
      var next = iter5NormalizeStyle(value)
      iter5StyleValue = next
      if (persist !== false) { try { localStorage.setItem(ITER5_STYLE_KEY, next) } catch (e) {} }
      iter5StyleListeners.forEach(function (listener) { listener(next) })
    }"""))
s = s.replace(J("""    function iter5SetStyle(value, persist) {
      var next = iter5NormalizeStyle(value)
      iter5StyleValue = next
      if (persist !== false) { try { localStorage.setItem(ITER5_STYLE_KEY, next) } catch (e) {} }
      iter5StyleListeners.forEach(function (listener) { listener(next) })
    }"""), J("""    function iter5SetStyle(value, persist) {
      var next = iter5NormalizeStyle(value)
      iter5StyleValue = next
      if (persist !== false) {
        try { localStorage.setItem(ITER5_STYLE_KEY, next) } catch (e) {}
        // 两个开关互斥保持同步：选 legacy 则挂载点走旧块，否则走本块。
        try { if (typeof damSkinStyleSet === 'function') damSkinStyleSet(next) } catch (e2) {}
      }
      iter5StyleListeners.forEach(function (listener) { listener(next) })
    }"""), 1)

must(s, J("      return locale === 'zh' ? ['界面皮肤', '仪器', '编辑', '活水'] : locale === 'ja' ? ['スキン', '計器', '編集', 'ウォーター'] : ['Interface skin', 'Instrument', 'Editorial', 'Water']"))
s = s.replace(J("      return locale === 'zh' ? ['界面皮肤', '仪器', '编辑', '活水'] : locale === 'ja' ? ['スキン', '計器', '編集', 'ウォーター'] : ['Interface skin', 'Instrument', 'Editorial', 'Water']"),
              J("      return locale === 'zh' ? ['界面皮肤', '新款（经典）', '仪器', '编辑', '活水'] : locale === 'ja' ? ['スキン', 'ニュー（クラシック）', '計器', '編集', 'ウォーター'] : ['Interface skin', 'New (classic)', 'Instrument', 'Editorial', 'Water']"), 1)

must(s, J("ITER5_STYLE_IDS.map(function (id, i) { return h('option', { key: id, value: id }, labels[i + 1]) })"))
s = s.replace(J("ITER5_STYLE_IDS.map(function (id, i) { return h('option', { key: id, value: id }, labels[i + 1]) })"),
              J("ITER5_ALL_SKINS.map(function (id, i) { return h('option', { key: id, value: id }, labels[i + 1]) })"), 1)
write(p, s)
print('1/4 style-choice.js OK')

# ─────────────────────────────────────────────────────────
# 2) ui.js：三套变体里的「返回」回旧款
# ─────────────────────────────────────────────────────────
p = 'skins/iter5/ui.js'
s = read(p)
NL = '\r\n' if '\r\n' in s else '\n'
J = lambda x: x.replace('\n', NL)
old = J("""      function exitClassic() {
        if (root.current && root.current.querySelector('[data-i5-dirty="true"]') && !window.confirm(L('有未保存的修改，确定切回经典？', 'Discard unsaved changes and return to classic?'))) return
        if (page[0] === 'settings') delete iter5SettingsDrafts[iter5Identity() + '|workbench']
        damSkinSet('classic'); props.onExit()
      }""")
must(s, old)
s = s.replace(old, J("""      function exitClassic() {
        if (root.current && root.current.querySelector('[data-i5-dirty="true"]') && !window.confirm(L('有未保存的修改，确定切回旧款？', 'Discard unsaved changes and return to the classic new UI?'))) return
        if (page[0] === 'settings') delete iter5SettingsDrafts[iter5Identity() + '|workbench']
        // ★2026-09-30（用户裁定）：三套新皮肤里的「返回」回**旧款**（3.2.5 的新款 UI），
        //   而不是直接回经典；旧款里的「返回经典皮肤」保持原样。两者语义不同，不得合并。
        iter5SetStyle('legacy'); props.onExit()
      }"""), 1)
write(p, s)
print('2/4 ui.js OK')
