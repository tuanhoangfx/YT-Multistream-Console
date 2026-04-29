 - **Ngay/Gio:** 2026-04-29 22:31:03
 - **Tinh nang:** Tu dong doc Version Log tu CHANGELOG.md
 - **Trang thai:** Lam moi hoan toan
 - **Mo ta ngan gon:** Them IPC `changelog:read` tai `electron/main.cjs` va `electron/preload.cjs`; bo sung API/type tai `src/api.ts`, `src/types.ts`; cap nhat `src/App.tsx` de tai changelog runtime va fallback an toan khi loi.

- **Ngày/Giờ:** 2026-04-29 22:40 (UTC+7)
- **Tính năng:** Chuẩn hoá style changelog và hiển thị version + timestamp
- **Trạng thái:** Tiếp tục làm dở dang
- **Mô tả ngắn gọn:** Chuẩn hoá `CHANGELOG.md` theo metadata `Version/Timestamp/Commit/Type/Status` + `### Changes`; cập nhật parser changelog tại `electron/main.cjs`; mở rộng type `ChangelogEntry` trong `src/types.ts`; cập nhật hiển thị timestamp badge trong `src/App.tsx` và `src/styles.css`.
