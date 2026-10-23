# 14: PWA

**What to build:** 玩家可以在手機上把遊戲加入主畫面，以全螢幕的 App 形式開啟；第一次載入之後，沒有網路也能玩。這張以 vite-plugin-pwa 產生 manifest 與 service worker，預先快取應用程式與字型子集。

**Blocked by:** 13 雙語介面與字型

**Status:** ready-for-agent

- [ ] manifest 包含名稱、圖示、主題色，以及全螢幕或 standalone 顯示模式
- [ ] 第一次載入後，離線狀態下可以開啟並完整遊玩
- [ ] 字型子集被預先快取
- [ ] 在 Android Chrome 與 iOS Safari 上可以加入主畫面，並以 App 形式開啟（手動驗證）
- [ ] 推出新版本時，玩家會得到更新，而進行中的局不會遺失
