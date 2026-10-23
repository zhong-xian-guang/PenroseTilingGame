# 13: 雙語介面與字型

**What to build:** 介面可以在繁體中文與英文之間切換，所有字串都集中在語系檔。文字使用由 LINE Seed 子集化並改名的字型：LINE Seed Sans（EN）負責拉丁字母，LINE Seed TW 負責中文，CSS 以 `unicode-range` 分工。子集由建置步驟依語系檔中實際出現的字元自動產生，並把字型名稱表改寫成專案自己的名稱（保留字型名稱與商標條款的要求）。關於頁註明「基於 LY Corporation 的 LINE Seed Sans 與 LINE Seed TW」，並附上 SIL OFL 1.1 全文。字型的來源與授權已經查證，見設計文件的 Risks。

**Blocked by:** 01 專案骨架與第一片拼塊

**Status:** ready-for-agent

- [ ] zh-TW 與 en 語系檔，介面上可以切換語言
- [ ] 建置步驟從官方字型（https://seed.line.me/）產生子集，只包含語系檔中出現的字元
- [ ] 子集的字型名稱表已改成專案名稱，不再叫 LINE Seed Sans 或 LINE Seed TW
- [ ] 只使用兩者共有的字重（Thin、Regular、Bold、ExtraBold）
- [ ] 新增介面字串後重新建置，不會缺字
- [ ] 語系檔中不使用兩套字型都沒有的符號（²、≈、✓）；建置步驟偵測到時發出警告
- [ ] 關於頁註明字型出處，並附上 OFL 全文
