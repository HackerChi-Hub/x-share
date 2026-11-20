# x-share · 黑粉科技 X 一键带图直发台

公开 GitHub Pages：https://hackerchi-hub.github.io/x-share/

## 组成
| 文件 | 作用 |
|---|---|
| `index.html` | 直发台页面。读取 `posts/<id>/manifest.json`，展示正文（免费版 ≤280 加权字数计数）与配图。链接带 `auto=1` 且检测到用户脚本时，自动跳转 `x.com/intent/post` 预填正文。 |
| `hfkj-x-autoattach.user.js` | Tampermonkey 用户脚本。在直发台登记本次配图（`GM_setValue`，5 分钟有效），到 X 发帖框后用 `GM_xmlhttpRequest` 下载配图，依次尝试 `input[data-testid=fileInput]` 注入 / 模拟粘贴 / 模拟拖入，挂载成功后才消费登记。只挂图，不代点「发帖」。 |
| `posts/<stamp>/` | 树莓派 `x_share_launchpad.py` 每班次写入的发布包（`manifest.json` + `0.png…`），保留 21 天，`posts/latest/` 为最新一期。 |

## 安装（每个 Chrome 用户一次）
1. 安装 Tampermonkey。
2. `chrome://extensions` → Tampermonkey「详情」→ 打开 **「允许用户脚本」**（Chrome 138+ 必需，不开脚本完全不运行）。
3. 打开 https://hackerchi-hub.github.io/x-share/hfkj-x-autoattach.user.js → 安装。

直发台显示「🟢 自动挂图脚本已生效」即可；显示「🔴」说明脚本未运行。

## 复用到其他项目
任何页面只要：
```js
document.dispatchEvent(new CustomEvent("hfkj-xshare-queue", {
  detail: JSON.stringify({ imageUrls: ["https://.../a.png"], fileName: "a.png", text: "..." })
}));
location.href = "https://x.com/intent/post?text=" + encodeURIComponent(text);
```
且页面域名在脚本 `@match` 内、图片域名在 `@connect` 内（当前：`hackerchi-hub.github.io`、`raw.githubusercontent.com`、`cdn.jsdelivr.net`），即可复用自动挂图。新增域名需同时改 `@match`/`@connect` 并升 `@version`。

## 生产端
- 生成：`channel-scripts/x_share_launchpad.py`（`publish_x_share_pack`，链接格式 `?id=<stamp>&tab=<n>&auto=1`）。
- 调用：`channel-scripts/geek_briefing_pipeline.py` 每个简报班次（09:00/13:00/20:00）。
