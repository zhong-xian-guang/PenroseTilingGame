# Penrose Tiling Game

以 Penrose tiling 的非週期鋪砌為核心的網頁遊戲：玩家持續拼接拼塊，一旦放錯導致無法合法延伸即遊戲結束，鋪砌的大小即為得分。需可在瀏覽器遊玩，並以 PWA 形式安裝到手機。原始構想見 `想法.txt`。

使用者偏好的溝通語言是繁體中文：回覆、說明與文件請用繁體中文（程式碼、識別字與 commit 訊息照既有慣例）。

部署：Cloudflare Pages Git 整合，push 到 `main` 即上線，見 `docs/deployment.md`。

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
