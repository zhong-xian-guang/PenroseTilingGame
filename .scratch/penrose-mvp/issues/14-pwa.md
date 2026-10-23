# 14: PWA

**What to build:** 玩家可以在手機上把遊戲加入主畫面，以全螢幕的 App 形式開啟；第一次載入之後，沒有網路也能玩。這張以 vite-plugin-pwa 產生 manifest 與 service worker，預先快取應用程式與字型子集。

**Blocked by:** 13 雙語介面與字型

**Status:** resolved

- [x] manifest 包含名稱、圖示、主題色，以及全螢幕或 standalone 顯示模式
- [x] 第一次載入後，離線狀態下可以開啟並完整遊玩
- [x] 字型子集被預先快取
- [ ] 在 Android Chrome 與 iOS Safari 上可以加入主畫面，並以 App 形式開啟（手動驗證）
- [x] 推出新版本時，玩家會得到更新，而進行中的局不會遺失

## Notes

- 驗證方式：`npm run build` + `vite preview`，以 headless Edge + CDP 檢查 manifest（name、standalone、theme_color、4 個圖示）、service worker 啟用、8 個 woff2 在 precache 中；切到離線後重新載入，App、Canvas、按鈕與字型都正常，深層路徑也回落到 index.html。
- 更新策略：`registerType: 'prompt'` 但不跳提示。新版本在背景安裝並等待，等 App 所有視窗都關閉後才接手，下次開啟就是新版。進行中的局永遠不會被強制重新載入。若之後想要「有新版本」提示，可改用 `virtual:pwa-register` 的 `onNeedRefresh`，並在 07 自動存檔之後再 reload。
- 圖示：`public/icon.svg`（P2 太陽）為來源，`npm run icons` 以 @vite-pwa/assets-generator 產生 PNG/ICO，產物已提交。
- 尚未完成：Android Chrome / iOS Safari 實機加入主畫面需人工驗證（需要 HTTPS 部署）。
