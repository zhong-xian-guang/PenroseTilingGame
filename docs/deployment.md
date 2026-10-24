# 部署

正式站以 **Cloudflare Workers（靜態資源）+ Workers Builds 的 Git 整合**部署：Cloudflare 連上 GitHub repo 後自行建置並上傳，不經 GitHub Actions、repo 裡也沒有 API token。沒有 Worker 程式，只有 `dist/` 的靜態檔。

- push 到 `main` → 建置並更新正式站（`penrosetilinggame.<帳號子網域>.workers.dev`）
- 其他分支 → 預設只上傳新版本、不影響正式站；可在 Worker 的 **Settings → Builds** 調整非正式分支的行為與預覽網址
- commit 訊息含 `[skip ci]` 可跳過該次建置

## 設定

`wrangler.jsonc` 指定 Worker 名稱與資源目錄 `./dist`。這個檔不可省略：沒有它時 `wrangler deploy` 會嘗試自動設定專案（安裝套件、改 package.json），在 Cloudflare 的建置環境裡會失敗。

Cloudflare 上 Worker 的 **Settings → Builds**：

| 項目 | 值 |
| --- | --- |
| Git repository | `zhong-xian-guang/PenroseTilingGame` |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | （空白） |

Worker 名稱必須和 `wrangler.jsonc` 的 `name`（`penrosetilinggame`）一致。

Node 版本由 repo 根目錄的 `.node-version` 指定（目前 24）。不可省略：建置的第一步 `node scripts/build-fonts.ts` 依賴 Node 預設開啟的 type stripping（22.18 起），而建置映像預設的 Node 比這舊。

`npm run build` 會跑型別檢查（`npm run check`），沒通過就不會部署。單元測試不在建置裡，合併前請在本機跑 `npm test`。

字型子集已 commit 在 `src/fonts/`；只要介面用到的字元集沒變，建置不需要 Python 或下載字型。若改了文案卻沒在本機重建字型，Cloudflare 上的建置會嘗試下載並呼叫 Python，可能失敗；改文案後請在本機跑 `npm run fonts` 並 commit 結果。

本機可用 `npx wrangler deploy --dry-run`（先 `npm run build`）確認設定能被讀取，不會真的上傳。

## 快取標頭

`public/_headers` 會隨建置複製到 `dist/`，Workers 靜態資源會套用它：`/assets/*`（檔名帶內容雜湊）長期快取，其餘檔案沿用預設的重新驗證。`sw.js`、`index.html` 和 manifest 必須維持預設，PWA 才能偵測到新版本。
