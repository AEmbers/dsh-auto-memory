# 实现边界

- 注册槽位使用 Iter5Surface，样式引用计数清理，各根自动跟随实际宿主主题。浮层将主题根一起 portal 到 body，避免宿主 overlay stacking context 遮挡。
- DSH 设置使用 Iter5HostSettings → 生成的 Iter5Settings，复用四分组、patch 保存与草稿。实例 ID 隔离，工作区切换重新挂载，宿主关闭/换页保护。
- 欢迎保留九步内容，更新主视觉构图与滚动正文/固定动作区；复用 SkinHero 资源路由，透明生成素材兼容浅深色。
- 轻面板保留共享 tab、固定、拖动、尺寸控制；默认概览，展开后展示原分区。
- ui.js/views.js/surfaces.js/skin.css 是生成源，client.js 手写部分保留槽位接线与经典实现。
- 验收只使用隔离真实 DSH，下载写入被拦截，不把下载/模型执行记为通过。宿主自身侧栏与窗口尺寸不越界修改。
