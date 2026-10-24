# 14: PWA

**What to build:** 玩家可以在手機上把遊戲加入主畫面，以全螢幕的 App 形式開啟；第一次載入之後，沒有網路也能玩。這張以 vite-plugin-pwa 產生 manifest 與 service worker，預先快取應用程式與字型子集。

**Blocked by:** 13 雙語介面與字型

**Status:** resolved

- [x] manifest 包含名稱、圖示、主題色，以及全螢幕或 standalone 顯示模式
- [x] 第一次載入後，離線狀態下可以開啟並完整遊玩
- [x] 字型子集被預先快取
- [x] 在 Android Chrome 上可以加入主畫面，並以 App 形式開啟（自動化實機驗證，見 Comments）
- [ ] ~~在 iOS Safari 上可以加入主畫面，並以 App 形式開啟~~（wontfix：使用者沒有 iOS 裝置，2026-10-24 決定 MVP 不驗證 iOS）
- [x] 推出新版本時，玩家會得到更新，而進行中的局不會遺失

## Notes

- 驗證方式：`npm run build` + `vite preview`，以 headless Edge + CDP 檢查 manifest（name、standalone、theme_color、4 個圖示）、service worker 啟用、8 個 woff2 在 precache 中；切到離線後重新載入，App、Canvas、按鈕與字型都正常，深層路徑也回落到 index.html。
- 更新策略：`registerType: 'prompt'` 但不跳提示。新版本在背景安裝並等待，等 App 所有視窗都關閉後才接手，下次開啟就是新版。進行中的局永遠不會被強制重新載入。若之後想要「有新版本」提示，可改用 `virtual:pwa-register` 的 `onNeedRefresh`，並在 07 自動存檔之後再 reload。
- 圖示：`public/icon.svg`（P2 太陽）為來源，`npm run icons` 以 @vite-pwa/assets-generator 產生 PNG/ICO，產物已提交。
- iOS Safari 不驗證（使用者沒有 iOS 裝置，決定 MVP 不驗證）。Android 已在實機上驗證，見下方。

## Comments

**Android 實機（2026-10-24）**：ASUS ZenFone 5Z（Android 10，Chrome 147）。用 `vite preview` 提供 production build，並以 `adb reverse tcp:4173` 讓手機開 `http://localhost:4173`。localhost 算安全環境，所以不需要 HTTPS。
腳本 `scripts/device/pwa.mjs`（`npm run device:pwa`），4 項全部通過：

- 安裝：從 Chrome 選單的「加到主畫面」打開「安裝應用程式」對話框，按「安裝」。這台手機的 Play 服務無法產生 WebAPK（Finsky：`AuthFailureError: User needs to (re)enter credentials`，手機上的 Google 帳戶需要重新登入；Chrome 選單裡也顯示「Google 帳戶錯誤」）。Chrome 因此改為釘選一般的網頁應用程式捷徑，經啟動器「自動新增」確認後出現在主畫面上。這是手機帳戶的問題，與 App 無關；帳戶正常時應該會安裝成 WebAPK。
- 從主畫面圖示啟動（先 force-stop Chrome，冷啟動）：前景 activity 是 `org.chromium.chrome.browser.webapps.WebappActivity`，不是 Chrome 分頁；`display-mode` 是 **fullscreen**，因為 manifest 的 `display_override` 把 fullscreen 排第一。
- 頂端：fullscreen 下狀態列與導覽列都隱藏。瀏海與狀態列那條（87 裝置 px）以黑色留空，頁面從它下面開始（viewport 375×751 CSS px），HUD、縮放與選單按鈕都沒有被狀態列或瀏海蓋住。若想改成一般的 standalone（保留狀態列），從 `display_override` 拿掉 `fullscreen` 即可。
- 對話框（`100dvh`）：在已安裝的 App 中開啟「關於」，高 382 px，位於 751 px 的 viewport 之內（top 185、bottom 566），不需要捲動，截圖正常。其他對話框沒有逐一量測。小瑕疵：開啟時焦點框落在授權條款的 `<summary>` 上。
- 離線：移除 adb reverse（伺服器無法連線），以 `svc wifi disable` 與 `svc data disable` 關閉網路（`Active default network: none`，`navigator.onLine === false`），再從圖示冷啟動：由 service worker 接手，Canvas、托盤與兩個字型都正常載入；用真實 swipe 從托盤拖出風箏，成功放上預放，可以遊玩。之後 Wi-Fi 與行動數據都恢復開啟，飛航模式維持關閉，adb reverse 也已恢復。
- 手機上留著測試安裝的 Penrose 捷徑，在主畫面預設頁的左邊一頁。重跑安裝時產生的兩個重複捷徑已移除。

**iOS（不驗證，見上方 wontfix；日後若有裝置可參考）：** 要部署到 HTTPS。用 Safari 的「分享 > 加入主畫面」，從圖示開啟，確認是 standalone、狀態列與瀏海區域（`apple-mobile-web-app-status-bar-style`）的顯示，以及離線後重開能玩。
