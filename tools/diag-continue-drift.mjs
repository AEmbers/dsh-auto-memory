import { readFileSync } from 'node:fs'

const IDX = readFileSync('D:/dsh-auto-memory/lib/index.js', 'utf8')
const CLI = readFileSync('D:/dsh-auto-memory/lib/client.js', 'utf8')

const show = (label, src, anchors) => {
  console.log('\n=== ' + label + ' ===')
  for (const a of anchors) {
    const n = src.split(a).length - 1
    console.log('命中 ' + n + ' 次 :: ' + JSON.stringify(a.slice(0, 120)))
  }
}

// 1. handoffPanelData 的刷新 sid 计算（缺陷 1 现场）
show('缺陷1 现场（宿主 L5336-5337）', IDX, [
  "    // 刷新仪式的会话 id:内存态为空时走磁盘回退(宿主重启后 _lastAgent 未重建的窗口期)\r\n    const sid = this.currentSessionId() || this.recentSessionIdFallback()",
])

// 2. handoffPanelData 签名 + else 分支（要改成按会话）
show('缺陷1 参数与 else 分支', IDX, [
  "  async handoffPanelData(fileQ, sessionId) {",
  "    } else {\r\n      p = (this.state.handoffDir || this.state.planPath)",
  "      if (!this.state.waterLevelWindow && this.config.handoffEnabled !== false) {",
])

// 3. 客户端刷新仪式取数（缺陷 2 现场）
show('缺陷2 现场（客户端）', CLI, [
  "        var st = await apiGet(API.handoffState)\r\n        var rf = st && st.refresh",
])

// 4. 客户端 fromSidForCarry
show('缺陷2 现场2（客户端 L6933）', CLI, [
  "        var fromSidForCarry = String(lastRefreshSessionId || currentSessionIdClient() || '')",
])

// 5. 路由（要透传 sessionId 给 handoffPanelData）
show('路由', IDX, [
  "          return writeJson(res, 200, await engine.handoffPanelData(url.searchParams.get('file'), url.searchParams.get('sessionId')))",
])

// 6. recentSessionIdFallback 的全局扫描（要按会话收窄）
show('全局扫描（缺陷1 源头）', IDX, [
  "      const root = path.join(dshHome(), 'sessions')\r\n      let best = ''",
  "      for (const wsDir of readdirSync(root, { withFileTypes: true })) {",
])
