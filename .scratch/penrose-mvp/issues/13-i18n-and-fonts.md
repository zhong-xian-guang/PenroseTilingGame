# 13: 雙語介面與字型

**What to build:** 介面可以在繁體中文與英文之間切換，所有字串都集中在語系檔。文字使用由 LINE Seed 子集化並改名的字型：LINE Seed Sans（EN）負責拉丁字母，LINE Seed TW 負責中文，CSS 以 `unicode-range` 分工。子集由建置步驟依語系檔中實際出現的字元自動產生，並把字型名稱表改寫成專案自己的名稱（保留字型名稱與商標條款的要求）。關於頁註明「基於 LY Corporation 的 LINE Seed Sans 與 LINE Seed TW」，並附上 SIL OFL 1.1 全文。字型的來源與授權已經查證，見設計文件的 Risks。

**Blocked by:** 01 專案骨架與第一片拼塊

**Status:** resolved

- [x] zh-TW 與 en 語系檔，介面上可以切換語言
- [x] 建置步驟從官方字型（https://seed.line.me/）產生子集，只包含語系檔中出現的字元
- [x] 子集的字型名稱表已改成專案名稱，不再叫 LINE Seed Sans 或 LINE Seed TW
- [x] 只使用兩者共有的字重（Thin、Regular、Bold、ExtraBold）
- [x] 新增介面字串後重新建置，不會缺字
- [x] 語系檔中不使用兩套字型都沒有的符號（²、≈、✓）；建置步驟偵測到時發出警告
- [x] 關於頁註明字型出處，並附上 OFL 全文

## Comments

- 語系檔：`src/i18n/locales/{zh-TW,en}.json`；`t()` 與語言狀態在 `src/i18n/index.svelte.ts`（偏好存在 localStorage，預設依瀏覽器語言）。右上角有語言切換與「關於」按鈕（`src/ui/Menu.svelte`），關於頁是原生 `<dialog>`。
- 字型建置：`npm run fonts`（`npm run build` 會先跑它）。字元集取自所有語系檔、`src/fonts/OFL.txt` 與 `scripts/build-fonts.ts` 的 `EXTRA_TEXT`，外加可列印 ASCII（執行時產生的數字）。字元集與 `src/fonts/manifest.json` 相同時沿用已提交的子集；不同時從 seed.line.me 下載官方 zip 到 `.cache/fonts/`，再由 `scripts/subset_fonts.py`（fontTools）子集化、改名為 PTG Sans／PTG Sans TC 並輸出 WOFF2 與 `fonts.css`。因此**改了介面字串的人需要 Python + `pip install fonttools brotli`**；沒有的話建置會失敗並提示，不會悄悄缺字。
- 名稱表只保留著作權、設計者、授權欄位，移除商標欄位（7）與所有舊名稱。
- 兩套字型都沒有的字元，建置會逐一警告；`⌂`（置中按鈕）因此改成 SVG 圖示。語系檔中出現 ²、≈、✓ 時，建置警告，`tests/i18n/locales.test.ts` 也會失敗。
- 環境備註：在含中文字元的路徑（本 repo 的 worktree 路徑）下，Vitest 4/rolldown 的依賴預先打包會失敗（`Could not resolve 'node:module' … Tsconfig not found`），與本票無關；從 ASCII 路徑的 junction 執行即可通過。
