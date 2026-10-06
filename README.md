# Komari Theme 1999 (Fork)

Fork of [r1cebucket/komari-theme-1999](https://github.com/r1cebucket/komari-theme-1999). A neo-brutalist monitoring dashboard for [Komari Monitor](https://github.com/komari-monitor/komari), featuring heavy borders, hard shadows, pixel-inspired loading states, and responsive node detail charts.


## Preview

![cover](./static/cover-image.png)

## Features

- Responsive grid and list views with persistent view preference
- Dynamic site name from Komari public settings
- Live CPU, memory, disk, network, uptime, and latency data
- Node detail modal with hardware, system, storage, and network summaries
- ECharts history views for load and latency with independent time ranges
- Managed accent color, card border style, and uptime visibility options
- Keyboard-friendly modal controls, including `Esc` to close

## Fork 特色

本 fork 在原主题基础上新增以下内容，全部可在 Komari 后台「1999 主题设置」页签中开关和调整。

### 三网延迟与丢包

节点卡片和列表中按 **CT 电信 / CU 联通 / CM 移动** 显示平均延迟、平均丢包，以及一条 20 格历史条：格子颜色表示该时段延迟（≤60 / 100 / 160 / 200 ms 分档），底部色带表示丢包（>1% 才显示），悬停可看具体时段数值，斜纹格表示该时段无采样。

- 历史条用 canvas 按屏幕物理像素绘制：外框为主题墨色的 2px 粗线（与其他边框一致），格间为 1px 细线、颜色取墨色与卡片底色的混合色（比外框弱一档，随明暗主题自动变化），在 100%、125%、150% 等任意系统缩放下粗细完全一致；有丢包的格子上下两半等高，分隔线居中；条在两侧数字之间左右对称。
- 延迟与丢包数字按同一档位着色，浅色主题用加深色、深色主题用提亮色，所有配色下对比度均 ≥ 4.5:1。
- 数据来自一次 `public:queryMetrics` 调用（所有节点一起取，每 60 秒刷新），不随实时轮询重复请求。
- Komari 的 Ping 汇总把丢包样本记为 −1 计入平均值，主题会按同时段丢包率还原真实延迟，避免丢包时延迟被低估。
- 任务归类：后台三个 Ping 任务选择器全部留空时，按任务名自动识别（电信/telecom/ctcc/chinanet/cn2、联通/unicom/cucc、移动/mobile/cmcc/cmi/cmin2）；只要选了任意一个，就只使用所选任务。
- 需要 Komari 服务端 ≥ 1.4.3（`public:queryMetrics`）并已创建对应 Ping 任务。

### 剩余天数与剩余价值

读取节点的到期时间、价格、计费周期和货币：

- 剩余天数：≤10 天黄色、≤5 天或已过期红色，超过 100 年显示 LONG-TERM。
- 剩余价值 = 价格 × 剩余天数 ÷ 计费周期，以节点自身货币显示；价格为 −1 显示 FREE，未设置价格不显示。
- 可设置「未登录隐藏价格」，访客仍能看到剩余天数。

### 流量重置日与日均可用流量

- 显示每个节点的流量重置日（对应 agent 的 `--month-rotate DAY`）和距下次重置的天数。
- 设置了流量上限的节点额外显示「日均可用」= (流量上限 − 已用) ÷ 距下次重置天数，已用量按节点的流量计算方式（max/min/sum/up/down）取值。
- agent 不会把 `--month-rotate` 上报给服务端，主题无法读取，需要在后台「各节点重置日」中按行填写，例如：

  ```text
  HK-1=5
  US-2=15@-7
  # 未列出的节点默认每月 1 号
  ```

  `@` 后为该 VPS 的 UTC 偏移小时数，不写则使用「VPS 默认时区」设置（默认 0，即 UTC）。当月没有该日期时（如 31 号）顺延到下月 1 号，与 agent 的规则一致。
- 限制：填写的日期必须与 agent 实际参数一致；如果 agent 没有开启 `--month-rotate`，流量统计本身不会按月清零，此处显示的日均值也就不准确。

### 卡片对齐

所有卡片的每一行都在同一高度：节点名单行显示，系统版本和 CPU 型号各占一行，过长时以省略号截断，悬停可看全文。缺少的数据显示占位符而不是整行消失：无到期日或价格显示 `—`，无流量上限的「日均可用」显示 `∞`，没有三网 Ping 任务的节点显示三行 `--`。卡片底部的网速与运行时间始终贴底，同一排卡片的底栏对齐。

### 国旗与世界地图

- 卡片和列表的节点名前显示国旗。国旗来自节点的「地区」字段：Komari 的 GeoIP 会自动填入国旗 emoji，也可以在后台手动填写国旗或两位国家代码（如 `HK`）。
- 页头统计改为两排三列，右侧是像素世界地图：每个有国家信息的节点在对应国家显示国旗，同一国家多台机器会显示数量；离线节点为灰色。
- 各节点用流动虚线连到「地图连线终点」（默认 `CN`，留空则不画线）；跨越太平洋的连线会从地图边缘绕过去。
- 地图像地球仪一样自西向东无限滚动，速度由「地图旋转速度（秒/圈）」控制（默认 120，0 为不自动滚动）；鼠标或手指可左右无限拖拽，鼠标悬停时暂停。系统开启「减少动态效果」时不自动滚动。
- 两排统计等高，网速在一行内显示。
- 屏幕宽度 ≤768px 时隐藏地图，恢复原来的统计布局。
- Windows 自带字体不显示国旗，主题内置了 Twemoji 国旗字体，只作用于国旗字符。

### 页面背景纹理

后台「页面背景纹理」可选 `none`（默认，纯色）、`dots` 点阵、`grid` 网格、`cross` 十字、`diagonal` 斜线。纹理极淡、无缝密铺，按屏幕物理像素绘制，任意缩放下点线粗细一致，并跟随配色主题的明暗。

### 配色主题

后台「配色主题」可选 11 种：

- 浅色（只换强调色）：`yellow-light`、`red-light`、`blue-light`、`green-light`、`purple-light`
- 深色：`tokyonight-dark`、`dracula-dark`、`monokai-dark`、`nord-dark`、`gruvbox-dark`、`catppuccin-dark`（Mocha）

深色主题沿用各配色方案的官方色值；卡片、三网历史条、图表和提示框都会跟随切换。页头保持亮色强调色底配深色字。所选配色会记在浏览器本地，下次打开时不会先闪白屏。

### 节点详情

详情弹窗新增 BILLING & TRAFFIC 区块：价格、到期日、剩余天数、剩余价值、重置日、下次重置时间、剩余流量、日均可用。

延迟图中丢包不再把曲线打断：曲线保持连续，丢包样本以对应任务颜色的短竖线标在横轴上。

### 不依赖第三方资源

主题不再请求任何外部域名：ECharts、Archivo Black、Space Grotesk 和国旗字体都打包在 `src/vendor/` 中，随 release 发布（来源与许可证见 `src/vendor/LICENSES.md`）。

构建时会给所有本地资源地址加上 `?v=<版本号>`，每次发版都是新地址。如果站点前面有 CDN（例如 Cloudflare 会默认缓存 `.js`/`.css`），升级后不会再拿到旧文件。从 v1.2.0 或更早版本升级时，需要在 CDN 里清一次缓存，因为旧版的地址没有带版本号。

## Installation

1. Download `komari-1999-fork-v*.zip` from [Releases](https://github.com/10ta/komari-theme-1999-fork/releases).
2. Open the Komari admin panel and go to theme management.
3. Upload the ZIP package and select **Komari 1999 (Fork)**.
4. Adjust options under the **1999 主题设置 / 1999 Theme** tab, then refresh the monitor page.

The theme short name is `komari-1999-fork`, so it installs alongside the original `komari-1999` without overwriting it.

The package contains `komari-theme.json` and the compiled files under `dist/`.

## Development

### Requirements

- Node.js 18 or newer
- npm
- `zip`

No npm dependencies are currently required. ECharts and web fonts are loaded from public CDNs at runtime.

```bash
npm run build      # Copy source files into dist/
npm run package    # Build and create komari-1999-fork-v<version>.zip
npm run clean      # Remove dist/
```

To preview locally, run `npm run build` and serve `dist/` with a static server. API-backed data requires a Komari installation.

## Project Structure

```text
src/
├── index.html       # Dashboard template and required Komari placeholders
├── styles.css       # Theme, responsive, modal, and animation styles
└── script.js        # RPC data, rendering, preferences, and ECharts logic
custom-body/         # Optional Komari custom-body snippets
static/              # Theme cover image (`cover-image.png`) included in the packaged ZIP
komari-theme.json    # Theme metadata and managed settings
build-theme.sh       # ZIP packaging script
tools/build.mjs      # Copies src/ to dist/ and adds ?v=<version> to local asset URLs
tools/gen-worldmap.mjs  # Regenerates src/worldmap.js (dev only, see the file header)
src/vendor/          # Bundled ECharts and fonts (see LICENSES.md)
.github/workflows/   # CI build (build-ci.yml) and release on version bump (release.yml)
```

`dist/` and `*.zip` are generated files and are ignored by Git.

## Configuration

Settings are declared in `komari-theme.json` under `configuration` (`type: managed`), so Komari (server ≥ 1.0.5) renders them as a theme settings tab in the admin panel. Saved values are exposed publicly through `/api/public` → `theme_settings`; do not put secrets here.

| Group | Key | Type | Default |
| --- | --- | --- | --- |
| Appearance | `colorScheme` | select: yellow-light, red-light, blue-light, green-light, purple-light, tokyonight-dark, dracula-dark, monokai-dark, nord-dark, gruvbox-dark, catppuccin-dark | `yellow-light` |
| Appearance | `pageBackground` | select: none, dots, grid, cross, diagonal | `none` |
| Appearance | `cardStyle` | select: thick, thin, double | `thick` |
| Appearance | `showUptime` | switch | on |
| Appearance | `showLoginButton` | switch | on |
| Appearance | `showWorldMap` | switch | on |
| Appearance | `mapHub` | string, ISO 3166 alpha-2 code | `CN` |
| Appearance | `mapSpinSeconds` | number, seconds per turn (0 = off) | `120` |
| Carrier latency | `carrierPingEnabled` | switch | on |
| Carrier latency | `carrierPingHours` | number (1-720) | `24` |
| Carrier latency | `carrierCtTasks` / `carrierCuTasks` / `carrierCmTasks` | Ping task picker | empty (auto by name) |
| Billing | `showBilling` | switch | on |
| Billing | `hidePriceWhenLoggedOut` | switch | off |
| Traffic plan | `showTrafficPlan` | switch | on |
| Traffic plan | `trafficResetUtcOffset` | number (hours) | `0` |
| Traffic plan | `trafficResetDays` | text, one `NodeName=DAY[@offset]` per line | empty (1st of month) |

`komari-theme.json` is the single source of truth for the version; `build-theme.sh` and the release workflow both read it.

## Release

`.github/workflows/release.yml` runs when `komari-theme.json` changes on `main`. If no release exists for `v<version>`, it builds the ZIP and publishes a GitHub Release (tag, title and auto-generated notes) with the package attached. Pushing without a version change publishes nothing; re-running is safe.

One-time setup: enable Actions in the fork (Actions tab → enable workflows). The workflow uses the built-in `GITHUB_TOKEN` with `contents: write`; no PAT is needed.

Each release:

```bash
V=1.1.1
sed -i -E 's/("version": ")[^"]+"/\1'"$V"'"/' komari-theme.json
git commit -am "release: v$V"
git push
```

## CI

`.github/workflows/build-ci.yml` runs for pushes and pull requests targeting `main`, and can also be started manually. It builds the theme with Node.js 24 and uploads `komari-theme.json` plus `dist/` as a GitHub Actions artifact. The downloaded artifact ZIP can be uploaded directly to Komari.

## Komari Compatibility

The template preserves the required title, description, `</head>`, and `</body>` placeholders used by Komari. It also keeps the **Powered by Komari Monitor** footer attribution. User preferences use Komari-compatible localStorage keys such as `nodeViewMode`.

## References

- [Komari Theme Development Guide](https://komari-document.pages.dev/dev/theme.html)
- [Komari Web](https://github.com/komari-monitor/komari-web)

## Acknowledgements

Special thanks to [komari-theme-naive](https://github.com/lyimoexiao/komari-theme-naive) by [lyimoexiao](https://github.com/lyimoexiao). Its chart presentation, historical-data handling, and packaging approach provided valuable reference and inspiration.

The fork's carrier latency, billing and release-on-version-bump features follow the approach of [Glassmorphism-Enhanced](https://github.com/casiuna/Glassmorphism-Enhanced) by casiuna.

Country flag artwork comes from [Twemoji](https://github.com/twitter/twemoji) (© Twitter, Inc and other contributors, CC BY 4.0) via [country-flag-emoji-polyfill](https://github.com/talkjs/country-flag-emoji-polyfill). Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain).

## License

MIT
