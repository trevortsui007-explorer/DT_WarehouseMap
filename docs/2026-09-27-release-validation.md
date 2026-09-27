# 分層提交驗證紀錄（2026-09-27）

本次保留既有提交 `8f155bb`，按 tooling、core、persistence、remote、application、runtime、renderers、editor、packaging、docs 順序整理目前成果。中間提交可能尚未完整接線，以下結果針對完整工作區。

## 本次實際驗證

- `npm run check`：5 組檢查全部通過。
- `npm test`：13 個測試檔案、67 個測試全部通過。
- `npm run lint`：通過。
- `npm run format:check`：通過。
- `npm run build`：通過，153 個模組完成轉換。
- 正式 JavaScript 產物 969.30 kB，gzip 283.51 kB。

測試與建置首次執行遭 Windows 沙箱祖先目錄存取限制阻擋，經授權在沙箱外重跑成功，未修改程式來繞過限制。建置仍有超過 500 kB 的 chunk 提示及 SignalR 套件 PURE 註解位置提示，均未阻止產物生成。

## 邊界

本次未執行真實瀏覽器 GPU、滑鼠操作或 C# / WMS 服務聯調。自動化測試不代表這些人工與外部整合驗收已完成。`.env.example` 保留空白設定；依賴、暫存檔及生成的 `dist/` 不納入新提交。
