# 前端架构

## 入口与状态

`frontend/src/main.tsx` 挂载 React 应用，`App.tsx` 是顶层状态容器。当前没有路由库，所有功能在单屏面板内完成。

`App.tsx` 管理以下状态：
- `boardDate`：当前查看的日期。
- `tasks`：当天查询出来的任务列表。
- `theme`：浅色 / 深色 / 系统，持久化在 `qb-theme`。
- `editor`：新建或编辑弹窗状态。
- `draftQueue` / `draftHistory`：AI 草稿待确认队列与“上一条”恢复栈；另有 `draftBatchStatus`、`draftClearDue` 记录对剩余草稿的批量微调。
- `deleting`：卡片悬停删除后的二次确认对象。
- `syncDraft`：根据当前面板生成的今日同步草稿。
- `boardView`：顶部三段视图（当前 / 待 Review / 归档）。
- `boardLayout`：象限 / 散点两种布局切换。
- `searchText` / `scopeFilter` / `statusFilter` / `focusFilter`：搜索与多维筛选条件。
- `weekReview`：周回顾统计数据，`aiPrefillPrompt` 用于把周回顾结果回填到 AI 输入框。
- `backupOpen` / `backupSummary`：备份说明弹窗与后端数据自检结果。
- `aiEnabled` / `aiModel`：AI 是否可用及模型名，决定是否展示输入框。
- `aiCollapsed`：AI 输入区是否收起，持久化在 `qb-ai-collapsed`；收起时只渲染一个展开开关，腾出首屏空间。
- `readingMode`：阅读模式开关，持久化在 `qb-reading-mode`；开启后给 `.app` 挂 `reading-mode` class 隐藏外围 chrome、瘦身顶栏。只对象限布局有效（`inReadingMode = readingMode && boardLayout === 'quadrant'`），进入时由 `toggleReadingMode` 顺手清空筛选。

状态流转原则：`App` 持有跨组件状态，子组件只通过回调上报动作；所有后端请求集中在 `api.ts`。拖拽会先更新本地 `tasks`，接口结束后再调用 `load()` 以数据库为准。

筛选与派生数据走 `useMemo`：`filteredTasks` 串联 `matchScope / matchStatus / matchFocus / matchSearch`，`focusQueue` 由 `buildFocusQueue` 算出收口建议，避免主题切换、弹窗开合等动作重复过滤全部任务。视图、布局、筛选谓词等纯逻辑抽到 `taskViews.ts`，状态标签与排序权重集中在 `statusMeta.ts`。

## 组件分层

- `AiQuickAdd`：多行自然语言输入，调用 AI parse 接口，返回草稿队列；内置模板 + 本地存储的最近提示词和自定义模板，35 秒 `AbortController` 超时，区分超时与网络错并支持重试。
- `QuadrantBoard`：按 `important + due_date` 分象限，处理状态/截止日排序、拖拽落点和三段视图下的卡片展示。
- `TaskScatter`：散点坐标布局，X 轴是时限压力（无期限→已过期）、Y 轴是重要性，自带贪心碰撞避让，把全部任务摊在一屏对照。
- `TaskCard`：展示序号、状态、截止日、备注和缩略图，提供状态推进 / 快捷改期 / 清期限 / 复制等卡片操作，处理卡片级拖放与缩略图复制。
- `TaskEditor`：编辑字段、图片粘贴、上传、删除、未保存关闭确认，负责新建时先暂存本地图片、保存后再上传。
- `Lightbox`：图片预览，Esc / 点空白关闭，复制按钮走剪贴板 API，右键保留浏览器原生菜单兜底。
- `ErrorBoundary`：包裹应用根，捕获子树渲染异常，提供“重试渲染 / 刷新页面”兜底，避免白屏。

## 四象限规则

四象限不存枚举，完全由任务字段派生：
- 上下：`important`。
- 左右：`due_date !== null`。

有期限象限先看截止日期：

1. 截止日期越近越靠前，过期日期自然排在今天之前。
2. 同一天内按状态排序：`doing`、`verify`、`todo`、`review`。
3. 日期和状态都相同，才按手动拖拽顺序。

无期限象限没有日期压力，先按状态排序，再按手动拖拽顺序。

UI 展示上,顶部三段视图把任务分成「当前 / 待 Review / 归档」：
- 当前：`doing / verify / todo`，显示完整卡片，可拖拽。
- 待 Review：只显示 `review`，显示完整卡片，可点击编辑，不拖拽。
- 归档：只显示 `done`，显示完整卡片，可点击编辑恢复状态，不拖拽。

跨象限拖拽只在「当前」视图且无筛选时启用（`canDrag = canEditCurrent && !isFiltered`），避免筛选子集下拖动算错落点；前端只提交最小必要字段：`important`、`due_date`、`sort_order`。

拖到左列会把 `due_date` 设为 `null`。拖到有期限象限的卡片上，会沿用落点卡片的截止日；拖到空白处则按 `due_date ?? last_due_date ?? 今天` 还原——优先用自己现有日期，其次还原「被清空前的截止日期」，最后才退到今天。`last_due_date` 由后端在清空时自动维护，前端乐观更新清空时也同步本地值（`dueClearPatch`），避免后端 `load()` 返回前快速拖回还原失败。

拖拽落点状态（`draggingId`）在每条「放下」路径（`dropAt` / `dropOnCard` 自落）里立即清除，而不是只靠被拖元素的 `dragend`：跨象限移动会让卡片换父容器被 React 销毁重建，其 `dragend` 不再触发，只靠它会让卡片一直带 `card-dragging` 半透明卡住；`dragend` 仅作为「拖到非可放区 / 浏览器外取消」的兜底。

散点布局（`boardLayout = 'scatter'`）是同一份任务的另一种呈现，不改字段，只把 `important + due_date + status` 映射成坐标，用来一屏对照“优先收口 / 低压储备 / 长期事项”。

## 视图、筛选与回顾

筛选与回顾的纯逻辑都放在工具模块里，组件只负责触发和展示：

- `taskViews.ts`：三段视图切分、`scope / status / focus` 筛选谓词、关键词匹配，以及 `focusScore` / `buildFocusQueue` 给出的收口建议队列（过期 > 今日截止 > 待验证 > 隔夜进行 > 重要进行中 > 明日截止）。
- `taskReview.ts`：`buildWeekReview` 聚合最近 7 天任务，算出新增 / 完成 / 净变化 / 收口重点等周统计；`buildWeekReviewText`、`buildWeekAiSummaryPrompt` 分别产出可复制文本和喂给 AI 的总结提示词。
- `taskReports.ts`：今日同步文本、当前视图的 Markdown / JSON 导出、AI 复盘提示词，以及触发浏览器下载的工具。

周回顾结果可一键填进 AI 输入框（`aiPrefillPrompt` → `AiQuickAdd` 监听后回填），把“看统计”直接接到“让 AI 写总结”。备份弹窗调用 `/api/maintenance/summary`，把任务数、图片数、磁盘占用和孤儿文件检查展示给用户，作为备份前的体检。

AI 草稿是一条带回退的队列：拆出的多条草稿逐个弹 `TaskEditor`（`key` 含草稿序号以强制重挂载），保存才入库；放弃的草稿压入 `draftHistory`，可用“上一条”恢复；对队列里剩余草稿还能批量改状态或清期限。

## 弹窗和图片交互

`TaskEditor` 的关闭规则是显式的：点遮罩时，如果字段、状态或待上传图片有变化，就弹「保存 / 不保存 / 继续编辑」三选一；没有变化才直接关闭。

图片有两类生命周期：
- 编辑已有任务时，图片选中或粘贴后立即上传到后端。
- 新建任务时，图片先以 `URL.createObjectURL` 预览，保存任务成功后再批量上传。

卡片缩略图点击只复制图片，不打开编辑窗。复制失败不会打断任务操作。灯箱提供「复制图片」按钮，并在打开时预先把图片准备为 PNG；按钮点击时直接写剪贴板，降低用户手势丢失概率。如果浏览器仍拒绝程序化写入，图片右键不被拦截，可使用浏览器原生菜单复制。

键盘交互通过 `useDocumentEvent` 这个文档级事件 Hook 注册，并按“是否有弹窗打开”分成两组。弹窗内：AI 输入框 Enter 拆任务（Shift+Enter 换行）；编辑弹窗 Ctrl/Cmd + Enter 保存、Esc 走未保存关闭确认；删除确认 Enter 删除、Esc 取消；今日同步弹窗 Ctrl/Cmd + Enter 复制、Esc 关闭。无弹窗时的全局导航：`[` / `]` 切换前后一天、`T` 回今天、`N` 新建（仅今天）、`F` 打开收口建议、`1/2/3` 切三段视图、`4` 切象限 / 散点布局、`R` 切换阅读模式（仅象限布局）、`/` 聚焦搜索框、`Esc` 在阅读模式下退出阅读、否则清空筛选。

## 日期规则

业务日期 MUST 使用 `dates.ts` 的 `toDateStr` 手拼。禁止用 `toISOString()`，因为 UTC 会让 Asia/Shanghai 日期出现跨日偏差。

## 样式规则

项目无 UI 库，样式集中在 `frontend/src/styles.css`。主题颜色 MUST 走 CSS 变量，深色主题在 `[data-theme='dark']` 覆盖。

布局是整页滚动工作台：`.app` 用 `min-height` 而非固定 `height`，`.board` 与象限列表 `.q-list` 都按内容自适应高度、不再各自内部滚动，任务多时整页只出一个滚动条；`.topbar` 吸顶（`position: sticky`），下滚时仍能切日期 / 视图 / 主题。宽屏下左列无期限较窄、右列有期限较宽（右列 `auto-fill` 自动多列）；窄屏在 `760px` 以下退化为单列。卡片备注 `.card-desc` 完整展开，不再截断为两行。AI 输入区可一键收起（`.ai-zone` / `.ai-toggle`），收起时省去约百余像素首屏高度。阅读模式给 `.app` 加 `reading-mode` class，纯 CSS 隐藏 AI 区 / 搜索 / 筛选 / 统计 / 收口建议，并把顶栏瘦身到只剩日期导航和「退出阅读」按钮，把象限内容顶到首屏。新增样式时优先复用现有 CSS 变量，不在组件里写内联颜色。

## 性能边界

这是单人本机工具，当前前端目标是稳定支撑数百条历史任务、百级活跃任务。四象限按 `tasks` 输入做一次分组和排序缓存，避免主题切换、弹窗开合等渲染动作重复过滤全部任务。

如果单日活跃任务长期超过 1000 条，再考虑给 `/api/tasks` 增加按状态、象限或关键词过滤，并在前端引入虚拟列表；在此之前不增加分页，避免破坏拖拽排序和整页扫视的工作流。

## 手动回归重点

- 今日 / 历史日期切换。
- 整页滚动：任务多时整页只有一个滚动条，象限内部不再独立滚动；下滚时顶栏吸顶常驻。
- AI 输入区收起 / 展开开关，刷新后保持；周回顾或复盘填入时自动展开。
- 拖拽同象限排序和跨象限移动；跨象限拖完卡片恢复正常亮度，不再半透明卡住。
- 拖去无期限象限再拖回有期限象限，原截止日期能还原（不退化成今天），快速连续往返也成立。
- 阅读模式：`R` 或顶栏按钮进入/退出，`Esc` 退出；进入时清空筛选，只对象限布局生效，刷新后保持。
- 顶部三段视图切换：当前、待 Review、归档；象限 / 散点布局切换。
- 搜索、范围 / 状态 / 收口筛选，以及筛选下拖拽禁用。
- 今日同步草稿、Markdown / JSON 导出、周回顾统计与填入 AI。
- 备份说明弹窗的数据自检读取。
- 新建、编辑、点外部三选一关闭确认。
- 粘贴图片、卡片缩略图复制、灯箱按钮/右键复制。
- AI 多草稿逐条弹窗保存、上一条恢复、批量微调。
