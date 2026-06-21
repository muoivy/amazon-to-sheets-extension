# Standalone Google Apps Script

Bản này dùng cho Apps Script project tạo riêng tại:

```txt
https://script.google.com/home
```

## Việc cần sửa trong Code.gs

### 1. Dán Spreadsheet ID

Trong `Code.gs`, sửa:

```js
const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
```

Spreadsheet ID lấy từ URL Google Sheets:

```txt
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

### 2. Sửa tên tab sheet nếu cần

```js
const SHEET_NAME = "Listing Product";
```

Tên này phải khớp chính xác với tab sheet bên dưới Google Sheets.

## Header cần có ở hàng 1

```txt
Product Link | SKU | TRADEMARK | Variants | Cost | Product Image
```

Có thể đổi thứ tự cột. Script tự tìm cột theo header.

## Deploy

Trong Apps Script:

```txt
Deploy → New deployment → Web app
```

Cấu hình:

```txt
Execute as: Me
Who has access: Anyone
```

Sau đó copy Web App URL và dán vào `.env` của extension.

## Ghi chú

Bản này dùng:

```js
SpreadsheetApp.openById(SPREADSHEET_ID)
```

Không dùng:

```js
SpreadsheetApp.getActiveSpreadsheet()
```
