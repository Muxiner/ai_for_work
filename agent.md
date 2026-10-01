# agent.md

本项目是一个**零依赖、可本地运行的在线上可编辑简历工具**：网页编辑内容 → 保存到 Markdown 文件 → 一键导出 A4 PDF。

## 运行

```bash
npm start          # = node --watch server.js，默认 http://localhost:5173（PORT 可改）
npm run dev        # 同上（开发）
npm run serve      # = node server.js，不自动重启
```

- 无需 `npm install`，零依赖，无构建步骤。
- **改代码不用手动重启**：
  - 改 `server.js` → `node --watch` 自动重启（浏览器 SSE 会自动重连）。
  - 改 `public/**`（HTML/CSS/JS）→ 服务端监听并推送 `{reload:true}`，浏览器**自动刷新**（有未保存改动会先保存）。
  - 改 `docs/*.md` → 通过 SSE 自动同步到页面。
- 必须通过该服务访问才会读写 `.md` 文件；直接双击 `public/index.html`（file://）不可用（ES 模块需 HTTP）。

## 文件结构

```
.
├── server.js              # 零依赖 Node 服务：静态托管 public/ + 简历 API + SSE + 文件监听
├── package.json           # npm start / dev / serve
├── agent.md               # 本文件
├── docs/                  # 你的简历（每份一个 .md，已被 .gitignore 忽略）
│   └── .backups/          # 覆盖/删除前的自动备份
│   ├── readme.md
│   └── 互联网.md
├── samples/               # 示例简历（多职业，只读模板，每份一个 .md）
│   ├── 嵌入式软件工程师.md
│   ├── 硬件工程师.md
│   ├── 软件工程师.md
│   ├── 行政职员.md
│   └── 应届毕业生.md
└── public/                # 前端工程
    ├── index.html         # 结构（工具栏 + 页面容器 + 默认模板）
    ├── css/
    │   ├── base.css       # 变量/重置/工具栏/页面/页眉/照片/区块/编辑控件/标签
    │   ├── templates.css  # 模板：modern / minimal / elegant / sidebar
    │   ├── timeline.css   # 时间轴：线条 / 节点 / 布局
    │   └── print.css      # @page 与打印样式
    └── js/                # ES Modules
        ├── app.js         # 入口：绑定、初始化
        ├── state.js       # 全局状态、常量、通用工具（esc/txt/关键词/文件名）
        ├── icons.js       # SVG 图标表
        ├── markdown.js    # parseMarkdown / serialize
        ├── render.js      # renderResume、条目模板、时间轴渲染、可编辑态
        ├── api.js         # 服务端 API + SSE 订阅
        ├── persist.js     # 保存/同步/文件列表/加载简历
        ├── photo.js       # 照片读写与压缩
        ├── fonts.js       # 中英文字体、自定义字体（IndexedDB）
        ├── settings.js    # 配色/模板/字体/关键词/时间轴等设置与工具栏绑定
        ├── editor.js      # 页面内编辑交互（增删/移动/关键词/照片）
        └── exporter.js    # PDF / PNG / JPG 导出
```

模块依赖（单向，无环）：`state → icons → markdown → render → persist → editor`，`fonts/settings → render`，`exporter → persist`，`app` 汇总。

## 数据流

```
浏览器编辑 ──(防抖500ms / 每15s / 关闭时beacon)──► POST /api/resume?file=xx.md ──► 写文件
文件被外部修改 ──fs.watch──► GET /api/events (SSE) ──► 浏览器拉取并重新渲染
index.html / public/** 被修改 ──fs.watch──► SSE {reload:true} ──► 浏览器自动刷新（先保存未存改动）
```

- 本地缓存：`localStorage`（设置、当前文件、按文件存的照片、离线兜底 md）。
- 防冲突：页面有未保存改动（`dirty`）时，外部文件变更不覆盖；自身保存产生的事件按时间戳忽略，避免回环与光标跳动。

## 服务端 API（server.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/resumes` | 列出 `docs/` 所有 `.md` → `{ files: [] }` |
| POST | `/api/resumes` | 新建简历，body `{ name }`，用默认模板创建，409 表示同名 |
| GET | `/api/resume?file=x.md` | 读取简历内容 |
| POST | `/api/resume?file=x.md` | 覆盖写入简历 |
| DELETE | `/api/resume?file=x.md` | 删除简历 |
| GET | `/api/samples` | 列出 `samples/` 所有 `.md` → `{ files: [] }` |
| GET | `/api/sample?file=x.md` | 读取示例内容（只读） |
| POST | `/api/backup?file=x.md` | 备份当前简历到 `docs/.backups/`，返回备份名 |
| GET | `/api/backups?file=x.md` | 列出该简历的备份（新→旧） |
| POST | `/api/restore?file=x.md&backup=…` | 用备份覆盖恢复（恢复前会再备份一次） |
| GET | `/api/events` | SSE 推送 `{ file, at }` 或 `{ reload: true }` |

安全：文件名经 `safeName()` 校验（仅根目录、`*.md`、禁 `..` 与路径分隔符），防路径穿越。

## Markdown 简历格式规范

```markdown
# 姓名
职位 · 经验 · 方向                 ← 首个不含冒号的段落 = 职位

电话：138-0000-0000                ← 任意「标签：值」= 基本信息字段
邮箱：a@b.com
城市：深圳
学历：本科
求职情况：在职，考虑机会
期望岗位：嵌入式软件工程师
工作地点：深圳
期望薪资：面议

## 个人简介
正文段落。

## 工作经历
### 公司名称 · 职位名称
2024.12 – 至今                    ← 以 4 位数字开头 = 日期行
关键词：状态机、PI 环路、保护策略    ← 「关键词：」= 关键词标签
- 要点一
- 要点二

## 项目经历
（同上）

## 教育背景
### 学校 · 专业 · 学历
2019.09 – 2023.06
关键词：主修课程

## 资格证书
### 证书名称 · 颁发机构
2020.03

## 技能特长
- **分类**：技能关键词
```

解析规则（`parseMarkdown`）：

- `#` 姓名；`##` 章节；`###` 条目（按 ` · ` 拆成标题/副标题）；`- ` 列表；`**加粗**：` 技能。
- 首个无冒号段落 → 职位；`标签：值` → 基本信息（标签通用，图标按 `LABEL_ICON` 匹配，未知用默认点）。
- 日期行：`/^\d{4}/`。
- 关键词行：`^(关键词|关键字|技术栈|主修课程|标签)[:：]`，分隔符 `、,，;；/|`。
- 章节 key 映射见 `SECTION_KEYS`：`summary / experience / projects / education / skills / certificates / intent / custom-N`。

序列化（`serialize`）反向生成，DOM 顺序即输出顺序（顺序调整会持久化）。

## 前端功能一览

- **模板**：classic / modern / minimal / elegant / sidebar（`body[data-template]`）
- **字体（中英文分开）**：英文 `fontLatin` + 中文 `fontCJK`，JS 组合成 `--font`（英文列表在前、中文在后、末尾通用族），`body.style.setProperty("--font", …)`
  - 英文：system/times/georgia/garamond/cambria/calibri/arial/helvetica/verdana/tahoma/courier/consolas/custom
  - 中文：system/yahei/pingfang/sourcehan/heiti/simsun/sourceserif/kai/fangsong/custom
  - **自定义字体嵌入**：上传 `.ttf/.otf/.woff/.woff2` → `FontFace` 注册为 `ResumeCustomFont` + 存 IndexedDB（库 `resume-fonts`，键 `custom`），刷新后自动恢复；打印导出时浏览器会把该字体嵌入 PDF
- **配色**：8 色 swatch + 「跟随模板」；写入 `body.style --accent`
- **照片**：点击照片框上传，自动压缩为 480px JPEG，**按简历文件**存 localStorage
- **关键词开关**：`body.hide-keywords` 隐藏所有关键词行（不改 md 数据）
- **时间轴**：`body.timeline` + 章节 `timeline-on` 类
  - 仅当章节内**带日期条目 ≥ 2** 时启用
  - 可选内容类型（`timelineTypes`）：工作经历/项目经历/教育背景/资格证书
  - 线条 `timelineLine`：solid / dashed / dotted / none（`data-tlline`）
  - 节点 `timelineNode`：dot / arrow / square / diamond / none（`data-tlnode`）
  - 布局 `timelineLayout`：right / dateLeft / stacked / card（`data-tllayout`）
- **编辑交互**：所有文本 `contenteditable`；条目悬停出现 `↑ ↓ ×`；章节标题悬停出现 `↑ ↓`；各章节「+ 添加」；技能/联系方式可单独删除
- **多简历**：顶栏下拉切换、新建、删除
- **示例简历**：顶栏「示例」下拉来自服务端 `samples/*.md`（嵌入式软件工程师 / 硬件工程师 / 软件工程师 / 行政职员 / 应届毕业生 / 外贸专员 / 外贸助理），点「恢复示例」拉取所选示例并覆盖当前简历；新增职业示例只需往 `samples/` 放一个 `.md`
- **覆盖保护**：套用示例 / 删除简历前会自动备份到 `docs/.backups/<文件名>.<时间戳>.md`；顶栏「恢复备份」可用最近一次备份还原当前简历
- **导出**：顶栏「导出格式」下拉选 PDF / PNG / JPG + 「导出」按钮
  - PDF：`window.print()`，导出前把 `document.title` 设为「姓名-岗位」作为默认文件名
  - PNG/JPG：`renderImageDataUrl(type)` 用 **SVG `<foreignObject>` + canvas** 渲染（浏览器真实渲染引擎，无需依赖、支持 `color-mix`/`:has`/伪元素/自定义字体），2 倍分辨率，`toDataURL` 后下载；文件名同为「姓名-岗位」

## 打印 / PDF（关键约束）

- `@page { size: A4; margin: 12mm 15mm }`，`.page` 打印时 `padding:0`，保证每页统一边距。
- 内容**紧密跨页**：`.section`/`.item` 允许分页，仅 `.section-head`/`.item-row`/`li`/`.item-kw` 禁止断开。
- `print-color-adjust: exact` 强制打印背景色（色块页眉、时间轴、关键词标签）。
- 打印时隐藏：`.toolbar .hint .add-btn .del-btn .photo-del .item-actions .section-actions`。

## 本地存储键

| key | 内容 |
|---|---|
| `resume-settings-v1` | 模板/字体/配色/照片开关/关键词/时间轴等全部设置 |
| `resume-file-v1` | 当前简历文件名 |
| `resume-photo-v1:<file>` | 该简历的照片 dataURL |
| `resume-md-v1` | 无服务时的离线兜底内容 |

## 扩展指南

- **新增基本信息字段**：无需改解析（标签通用）；如需图标，在 `js/icons.js` 的 `LABEL_ICON` 加映射（图标路径在 `ICON_PATHS`）。
- **新增章节类型**：`js/state.js` 的 `SECTION_KEYS` 加标题→key；`js/icons.js` 的 `SECTION_ICON` 加图标；如需特殊渲染，在 `js/render.js` 的 `renderResume` 加分支；如需「+ 添加」模板，在 `js/render.js` 的 `TEMPLATES` 加 key。
- **新增模板**：`css/templates.css` 加 `body[data-template="x"]` 样式 + `public/index.html` 顶栏 `<option>`。
- **新增时间轴样式**：`css/timeline.css` 加 `body[data-tlline/tlnode/tllayout="x"]` 规则 + `public/index.html` 对应 `<option>`。
- **改 PDF 文件名规则**：`js/exporter.js` 的 `exportFileName()`。

## 提交约定

- **完成一个任务后直接提交**：改动完成并自测通过后，立即 `git add -A && git commit`，无需等待用户确认。
- 一次任务一个提交，提交信息简洁（如 `feat: 新增外贸示例` / `fix: 修正时间轴布局`）。
- `docs/` 已在 `.gitignore` 中忽略，简历内容不会被提交；提交前用 `git status` 确认未包含 `docs/`。

## 注意事项

- 节点使用 `:has`、`color-mix`、CSS 变量，需较新浏览器（Chrome 105+/Safari 15.4+）。
- `?nosync=1` 参数可禁用自动保存与 SSE（便于无头截图/打印测试）。
- 修改 `public/**` 后页面会自动刷新（SSE）；修改 `.md` 会自动同步（SSE）。
- 无测试框架；可用无头 Chromium 验证：
  ```bash
  "/Applications/Chromium.app/Contents/MacOS/Chromium" --headless=new \
    --virtual-time-budget=6000 --dump-dom "http://localhost:5173/?nosync=1"
  ```
