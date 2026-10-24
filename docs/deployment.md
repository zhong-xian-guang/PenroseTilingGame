# 部署

正式站以 **Cloudflare Pages 的 Git 整合**部署：Cloudflare 連上 GitHub repo 後自行建置，不經 GitHub Actions、repo 裡也沒有 API token。

- push 到 `main` → 建置並更新正式站（`<project>.pages.dev`）
- 其他分支與 PR → 各自的預覽網址，Cloudflare 會在 PR 上留言附網址與建置狀態
- commit 訊息含 `[skip ci]` 可跳過該次建置

## Cloudflare 專案設定

| 項目 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | None（或 Vite） |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Build system version | v3 |

Node 版本由 repo 根目錄的 `.node-version` 指定（目前 24）。不可省略：建置的第一步 `node scripts/build-fonts.ts` 依賴 Node 預設開啟的 type stripping（22.18 起），而 Pages v3 映像預設是 22.16。

`npm run build` 會跑型別檢查（`npm run check`），沒通過就不會部署。單元測試不在建置裡，合併前請在本機跑 `npm test`。

字型子集已 commit 在 `src/fonts/`；只要介面用到的字元集沒變，建置不需要 Python 或下載字型。若改了文案卻沒在本機重建字型，Cloudflare 上的建置會嘗試下載並呼叫 Python，可能失敗；改文案後請在本機跑 `npm run fonts` 並 commit 結果。

## 快取標頭

`public/_headers` 會隨建置複製到 `dist/`，讓 `/assets/*`（檔名帶內容雜湊）長期快取。其餘檔案沿用 Pages 預設的 `max-age=0, must-revalidate`。`sw.js`、`index.html` 和 manifest 必須維持這個預設，PWA 才能偵測到新版本。

## 首次設定（只做一次）

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授權 Cloudflare GitHub App 存取 `zhong-xian-guang/PenroseTilingGame`
3. 依上表填入設定 → **Save and Deploy**
4. （選用）**Custom domains** 綁定自有網域
