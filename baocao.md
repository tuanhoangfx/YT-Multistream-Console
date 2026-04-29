 - **Ngay/Gio:** 2026-04-29 22:31:03
 - **Tinh nang:** Tu dong doc Version Log tu CHANGELOG.md
 - **Trang thai:** Lam moi hoan toan
 - **Mo ta ngan gon:** Them IPC `changelog:read` tai `electron/main.cjs` va `electron/preload.cjs`; bo sung API/type tai `src/api.ts`, `src/types.ts`; cap nhat `src/App.tsx` de tai changelog runtime va fallback an toan khi loi.

- **Ngày/Giờ:** 2026-04-29 22:40 (UTC+7)
- **Tính năng:** Chuẩn hoá style changelog và hiển thị version + timestamp
- **Trạng thái:** Tiếp tục làm dở dang
- **Mô tả ngắn gọn:** Chuẩn hoá `CHANGELOG.md` theo metadata `Version/Timestamp/Commit/Type/Status` + `### Changes`; cập nhật parser changelog tại `electron/main.cjs`; mở rộng type `ChangelogEntry` trong `src/types.ts`; cập nhật hiển thị timestamp badge trong `src/App.tsx` và `src/styles.css`.

- **Ngày/Giờ:** 2026-04-29 23:33 (UTC+7)
- **Tính năng:** Thiết lập workflow phát triển P0 (lint/format/CI/test ổn định)
- **Trạng thái:** Làm mới hoàn toàn
- **Mô tả ngắn gọn:** Cập nhật `package.json` scripts cho lint/format/test/live; thêm `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `CONTRIBUTING.md`, `.github/workflows/ci.yml`; mở rộng `.gitignore`; cập nhật `README.md`; cải tiến `scripts/smoke-test.cjs` với cờ `SKIP_DRIVE_CHECK` để giảm flaky khi CI/local.

- **Ngày/Giờ:** 2026-04-29 23:40 (UTC+7)
- **Tính năng:** Dọn warning lint và chuẩn hóa lệnh smoke test
- **Trạng thái:** Tiếp tục làm dở dang
- **Mô tả ngắn gọn:** Chỉnh `src/App.tsx` để loại bỏ biến/hàm không dùng và thêm ghi chú dependency cho scheduler effect; cập nhật `package.json` thêm `test:smoke:full`; cập nhật `README.md` mô tả lệnh smoke full alias.

- **Ngày/Giờ:** 2026-04-29 23:44 (UTC+7)
- **Tính năng:** Tách module nền tảng theo kiến trúc scale dài hạn
- **Trạng thái:** Tiếp tục làm dở dang
- **Mô tả ngắn gọn:** Tách logic dùng chung khỏi `src/App.tsx` sang `src/features/drive/drive-utils.ts`, `src/features/app/storage.ts`, `src/utils/time.ts`; cập nhật `src/App.tsx` dùng import module mới và chuyển persistence sang hàm chuyên biệt (`persistTheme/persistJobs/persistDriveLibrary`) để giảm coupling và chuẩn bị cho chia nhỏ feature tiếp theo.

- **Ngày/Giờ:** 2026-04-29 23:46 (UTC+7)
- **Tính năng:** Tách component UI dùng chung khỏi App monolith
- **Trạng thái:** Tiếp tục làm dở dang
- **Mô tả ngắn gọn:** Tạo `src/components/SmartFilterDropdown.tsx` và `src/components/StatusBadges.tsx`; cập nhật `src/App.tsx` để import component/type thay vì khai báo nội bộ, giúp giảm kích thước file chính và tăng khả năng tái sử dụng.

- **Ngày/Giờ:** 2026-04-29 23:52 (UTC+7)
- **Tính năng:** Bổ sung nền tảng test unit và chuẩn kiến trúc scale dài hạn
- **Trạng thái:** Tiếp tục làm dở dang
- **Mô tả ngắn gọn:** Thêm module scheduler `src/features/streams/scheduler.ts`; thêm `vitest` + `jsdom`, `vitest.config.ts`, script `test:unit`; tạo test `src/features/drive/drive-utils.test.ts` và `src/features/app/storage.test.ts`; cập nhật CI chạy unit tests; thêm `ARCHITECTURE.md` để định nghĩa cấu trúc module và quy tắc mở rộng.

- **Ngày/Giờ:** 2026-04-29 23:57 (UTC+7)
- **Tính năng:** Tách stream actions và Drive metadata scanner thành module độc lập
- **Trạng thái:** Tiếp tục làm dở dang
- **Mô tả ngắn gọn:** Thêm `src/features/streams/actions.ts` cho validate/update patch stream state; thêm hook `src/features/drive/useDriveMetadataScanner.ts`; cập nhật `src/App.tsx` dùng các module mới để giảm logic side-effect trực tiếp trong file chính mà vẫn giữ nguyên hành vi.

- **Ngày/Giờ:** 2026-04-30 00:00 (UTC+7)
- **Tính năng:** Tách Drive actions và Stream selectors để giảm monolith App
- **Trạng thái:** Tiếp tục làm dở dang
- **Mô tả ngắn gọn:** Thêm `src/features/drive/actions.ts` (append/remove/group/metadata pending) và `src/features/streams/selectors.ts` (queue/library/config filters); cập nhật `src/App.tsx` dùng module mới thay cho logic inline nhằm giảm coupling và tăng khả năng test/mở rộng.
