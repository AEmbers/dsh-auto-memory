import { readFileSync, writeFileSync } from 'node:fs'
const IDX = 'D:/dsh-auto-memory/lib/index.js'
const PY = 'D:/dsh-auto-memory/python/worker_semantic_v1.py'
const CRLF = '\r\n'
let pass = 0, fail = 0
const ok = (c, n) => { if (c) { pass++; console.log('  ok - ' + n) } else { fail++; console.error('  FAIL - ' + n) } }
const idx0 = readFileSync(IDX, 'utf8')
const py0 = readFileSync(PY, 'utf8')
const M_JS = 'G1 · 发射闸单钥匙化'
const M_PY = '2026-09-30 G 批 · 发射闸单钥匙化'

// ===== index.js A：semantic-emit 端点把两把钥匙对齐 =====
ok(!idx0.includes(M_JS), 'index.js: 幂等标记未存在（对入口快照判定）')
const A_ANCHOR = '          cfg.activationEmitMode = mode' + CRLF
ok(idx0.split(A_ANCHOR).length - 1 === 1, 'A 锚点恰命中 1 次')
const A_ADD = [
  '          cfg.activationEmitMode = mode',
  '          // ★' + M_JS + '（用户裁定：「另一把闸也要做好联动，用户确定要开自动唤回就一定能开」）——',
  '          //   Python worker 的 **v1 通道（M7-6 双阈值）** 读的是**另一把钥匙** activationPolicy.mode，',
  '          //   而该键在用户面**零写入点**（设置页 / 新手向导 / 本端点三处都只写 activationEmitMode）',
  '          //   ⇒ 用户把「记忆唤起」开到 active，v1 通道恒 shadow：判定照跑、shadow 行照写，',
  '          //   但 activation_request 帧永不发出。「两把钥匙，一把没人转」。',
  '          //   处置：**单钥匙化** —— 本端点是唯一写入面，写入时把两键对齐',
  '          //   （active ⇒ 两把全开；其余档 ⇒ 两把全关），磁盘状态自洽、诊断读数一致。',
  '          //   ⚠️ 这不是把 JS 与 Python 两套引擎联动：**引擎选择仍完全独立**（语义引擎铁律）；',
  '          //      对齐的只是「同一套引擎的投递闸」两处读数，不改变择一逻辑。',
  '          if (!cfg.activationPolicy || typeof cfg.activationPolicy !== \'object\') cfg.activationPolicy = {}',
  '          cfg.activationPolicy.mode = mode === \'active\' ? \'active\' : \'shadow\'',
].join(CRLF) + CRLF
let idx = idx0.replace(A_ANCHOR, A_ADD)

// ===== index.js B：诊断回显第二把闸 =====
const B_ANCHOR2 = "jsEmitModeLive: (() => { try { return typeof this.jsEmitMode === 'function' ? this.jsEmitMode() : 'n/a' } catch (_) { return 'err' } })(),";
ok(idx.split(B_ANCHOR2).length - 1 === 1, 'B 锚点恰命中 1 次')
const B_ADD = B_ANCHOR2 + CRLF + [
  '        // ★' + M_JS + '：第二把闸的实时读数 —— Python v1 通道读 activationPolicy.mode，',
  '        //   与 activationEmitMode 由本插件写入时对齐（semantic-emit 单钥匙化）；一并回显便于核对两闸是否一致。',
  '        activationPolicyModeLive: (() => { try { const p = path.join(memoryDir(\'semantic\'), \'embedding-config.json\'); const j = JSON.parse(readFileSync(p, \'utf8\')); return String((j && j.activationPolicy && j.activationPolicy.mode) || \'shadow\') } catch (_) { return \'err\' } })(),',
].join(CRLF)
idx = idx.replace(B_ANCHOR2, B_ADD)
ok(idx !== idx0 && idx.includes(M_JS), 'index.js 两处补丁已应用')

// ===== python C：v1 通道判定改读投递开关 =====
ok(!py0.includes(M_PY), 'python: 幂等标记未存在（对入口快照判定）')
const C_ANCHOR = "                    if self.activation_policy['mode'] == 'active':" + CRLF
ok(py0.split(C_ANCHOR).length - 1 === 1, 'C 锚点恰命中 1 次')
const C_ADD = [
  '                    # ' + M_PY + '：本通道（M7-6 双阈值）此前只看 activationPolicy.mode，',
  '                    # 而该键在**用户面零写入点**（设置页 / 向导 / semantic-emit 端点均只写 activationEmitMode）',
  '                    # ⇒ 用户在 UI 开「记忆唤起」后本通道恒沉默（判定照跑、shadow 行照记、帧不发）。',
  '                    # 判定改为「以投递开关为准」：activationEmitMode == active 即放行；',
  '                    # 同时保留 activationPolicy.mode == active 的**显式**路径（校准脚本 / 老配置仍有效）。',
  '                    # ⚠️ 非引擎联动：JS 与 Python 两套引擎的选择逻辑完全不动（语义引擎铁律）。',
  "                    if (self.activation_policy['mode'] == 'active'",
  "                            or self.activation_emit_mode == 'active'):",
].join(CRLF) + CRLF
let py = py0.replace(C_ANCHOR, C_ADD)

// ===== python D：同 observation 双帧去重（两通道 activationId 同源） =====
const D_ANCHOR = [
  "        except Exception as _fv2_err:",
  "            base.diag('fv2-callsite-error: ' + str(_fv2_err)[:300])",
  "        return frames",
].join(CRLF) + CRLF
ok(py.split(D_ANCHOR).length - 1 === 1, 'D 锚点恰命中 1 次')
const D_ADD = [
  "        except Exception as _fv2_err:",
  "            base.diag('fv2-callsite-error: ' + str(_fv2_err)[:300])",
  '        # ' + M_PY + '：单钥匙化后 v1(M7-6) 与 fv2 两车道可能对**同一 observation** 各产一帧；',
  '        # 两者 activationId 同源（均走 _build_activation，只由 obs 派生）⇒ 同 id 双帧。',
  '        # 不靠下游收件箱的「重复」门兜底：此处按 activationId **保序去重**（保留首帧）。',
  "        try:",
  "            _seen_aid, _uniq = set(), []",
  "            for _f in frames:",
  "                _aid = ''",
  "                if isinstance(_f, dict) and _f.get('type') == 'activation_request':",
  "                    _pl = _f.get('payload') or {}",
  "                    _ac = _pl.get('activation') if isinstance(_pl, dict) else None",
  "                    _aid = str((_ac or {}).get('activationId') or '') if isinstance(_ac, dict) else ''",
  "                    if _aid and _aid in _seen_aid:",
  "                        continue",
  "                    if _aid:",
  "                        _seen_aid.add(_aid)",
  "                _uniq.append(_f)",
  "            frames = _uniq",
  "        except Exception as _dd_err:",
  "            base.diag('activation-dedup-error: ' + str(_dd_err)[:200])",
  "        return frames",
].join(CRLF) + CRLF
py = py.replace(D_ANCHOR, D_ADD)
ok(py !== py0 && py.includes(M_PY), 'python 两处补丁已应用')

writeFileSync(IDX, idx, 'utf8')
writeFileSync(PY, py, 'utf8')
console.log('== patch done: pass ' + pass + ' / fail ' + fail + ' ==')
if (fail) process.exit(1)
