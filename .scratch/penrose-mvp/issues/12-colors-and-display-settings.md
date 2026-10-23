# 12: 配色與顯示設定

**What to build:** 在設定面板中，玩家可以自訂 kite、dart 和背景的顏色，也能從幾組 preset 配色中選一組；Conway 弧線可以開關，預設顯示，顏色由配色自動推導成對比色。設定存在 IndexedDB，下次開啟時保留。

**Blocked by:** 07 棋譜與自動存檔續玩

**Status:** ready-for-agent

- [ ] 設定面板（原生 `<dialog>`）可以選擇 kite、dart、背景色
- [ ] 提供幾組 preset 配色
- [ ] 可以開關 Conway 弧線，預設開啟；弧線顏色依配色自動推導，在任何 preset 上都清楚可見
- [ ] 設定存進 IndexedDB，重新整理後保留
- [ ] 對話框可以用 Esc 關閉，關閉後焦點回到開啟它的按鈕
