# Amazon Product To Google Sheets Extension

Chrome Extension Manifest V3 dùng để lấy dữ liệu sản phẩm Amazon và gửi vào Google Sheets qua Google Apps Script Web App.

## Dữ liệu được nhập

Extension hiện chỉ nhập các cột sau:

```txt
Product Link | SKU | TRADEMARK | Variants | Cost
```

Mapping dữ liệu:

```txt
Product Link = Amazon URL
SKU = ASIN
TRADEMARK = Brand
Variants = Selected variants
Cost = Amazon price
```

Dữ liệu bắt đầu từ hàng 2. Nếu một hàng đã có text ở bất kỳ ô nào, script sẽ tự động bỏ qua và ghi vào hàng trống tiếp theo.

## Tên sheet

Tên file Google Sheets không quan trọng.

Bạn cần đổi tên tab sheet bên dưới thành:

```txt
Listing Product
```

Nếu muốn dùng tên tab khác, sửa dòng này trong `Code.gs`:

```js
const SHEET_NAME = "Listing Product";
```

## Header

Header nằm ở hàng 1.

Có thể đổi thứ tự cột thoải mái vì Apps Script tự tìm cột theo tên header.

Nếu đổi tên header, cần thêm tên mới vào `HEADER_ALIASES` trong `Code.gs`.

Ví dụ nếu đổi `TRADEMARK` thành `Brand Name`, thêm:

```js
brand: [
  "TRADEMARK",
  "Trademark",
  "Brand",
  "Product Brand",
  "Brand Name"
]
```

## Cài Apps Script

1. Mở Google Sheets.
2. Vào:

```txt
Extensions → Apps Script
```

3. Dán code trong file `Code.gs`.
4. Save.
5. Deploy:

```txt
Deploy → New deployment → Web app
```

Cấu hình:

```txt
Execute as: Me
Who has access: Anyone
```

Copy Web App URL sau khi deploy.

## Cấu hình Extension

Copy `.env.example` thành `.env`:

```bash
cp .env.example .env
```

Dán Web App URL vào `.env`:

```txt
GOOGLE_APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/xxxxxxxxxxxx/exec
```

Tạo `config.json`:

```bash
npm run build:config
```

Nếu không dùng Node.js, copy `config.example.json` thành `config.json` rồi sửa URL trực tiếp.

## Load Extension

Mở Chrome:

```txt
chrome://extensions/
```

Sau đó:

```txt
Bật Developer mode
→ Load unpacked
→ Chọn thư mục amazon-to-sheets-extension
```

## Sử dụng

1. Mở trang chi tiết sản phẩm Amazon.
2. Bấm icon extension.
3. Bấm `Get Product`.
4. Kiểm tra Google Sheets.

## Không commit lên Git

Không commit:

```txt
.env
config.json
node_modules/
```
