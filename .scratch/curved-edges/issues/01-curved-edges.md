# 01: 弧形邊拼塊

**What to build:** 把配對規則刻進拼塊外框：每條邊畫成一段對稱的圓弧，沿外框逆時針走時 H→T 的邊往外凸、T→H 的邊往內凹。合法擺法就是凸邊對凹邊，掉頭的拼塊會變成凸對凸，玩家看形狀就知道卡不卡得進去，不必理解弧線規則。只改畫法，引擎的 H/T 判斷不動。

**Blocked by:** —

**Status:** resolved

- [x] 盤面、待定拼塊、預覽、拖曳中的拼塊都用弧形外框
- [x] 托盤圖示用弧形外框
- [x] 回放與分析頁的盤面一致
- [x] 圖塊快取的外框餘裕涵蓋弧的凸出量
- [x] 移除「顯示弧線」設定與 Conway 弧線的繪製；已存的設定裡殘留的 `showArcs` 欄位讀取時忽略，不報錯
- [x] Android 實機上確認觀感與拖放手感

## Notes

- 來源：prototype 分支 `prototype/jigsaw-edges`（commit 4f674c7），`src/board/edge-variants.prototype.ts` 的 `curve` 樣式。當時比較了 arcs、knob、tooth、soft、curve 五種，2026-10-24 使用者選定 `curve`。
- 為什麼成立：P2 每條邊都是一端 H、一端 T，頂點規則等於「邊的方向要一致」。對稱的弧只需要凸或凹就能表達方向；每個角恰好一條凸邊一條凹邊，所以角度不變。
- prototype 參數：弧高 = 0.12 × 邊長，每條邊 16 段折線；凸出最多約 0.19，`tile-layer.ts` 的 `PAD` 在 prototype 中改成 0.25。
- Conway 弧線在弧形邊上對不到邊的交點，弧形邊樣式下不畫。
- 決定（2026-10-24，使用者）：只用弧形邊，直接取代直邊；移除「顯示弧線」設定，不提供切回原版樣式的選項。

## Comments

**實作（2026-10-24，分支 `feat/curved-edges`）**：`src/board/outline.ts` 的 `tileOutline` / `edgeArc`，測試在 `tests/board/outline.test.ts`（用引擎產生的真實鋪砌驗證：相鄰兩片在共用邊上的弧重合、掉頭的拼塊對不上、外框通過每個角）。點擊與懸停判定也改用弧形外框，死路標示和回放的「關鍵一步」外框沿弧形邊畫。引擎沒有改動；`TileShape.arcs` 資料現在沒有地方使用，但保留。電腦上以 Edge 手機尺寸截圖確認過棋盤、托盤與死路標示。Android 實機尚未驗證：測試時手機停在鎖定畫面。

**Android 實機（2026-10-24）**：ZenFone 5Z，production build（`vite build` + `vite preview`，`adb reverse tcp:4173`），`npm run device:touch` 12 項全部通過；截圖確認弧形外框、待定拼塊的紅框與托盤圖示都正確。第一次執行時「心流模式：拖出拼塊放下」失敗，原因是那局隨機開局的推薦位置放不下風箏（畫面提示「這種拼塊放不進推薦位置」），測試固定拖風箏所以沒放下；重跑一次通過。這是測試腳本依賴隨機開局的既有問題，與本票無關。
另：`npm run build` 的字型子集化步驟（`scripts/subset_fonts.py`）在這台電腦上讀 `.cache/fonts/*.zip` 時路徑中文編碼出錯而失敗，與本票無關；本票沒有新增文字，沿用已提交的字型檔，直接 `vite build`。
更正（同日）：移除弧線設定的字串改變了介面字元集，已提交的字型子集因此不再相符，Cloudflare 建置會需要自己用 Python 子集化。已修正 `scripts/subset_fonts.py` 改以 UTF-8 讀取 stdin 的工作參數，重新產生 `src/fonts/` 的子集（367 字）；`npm run build` 現在顯示 `subsets up to date`。

