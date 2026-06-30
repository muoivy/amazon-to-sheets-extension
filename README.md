# Product To Google Sheets

Chrome Extension MV3 de lay du lieu san pham tu cac retailer duoc ho tro va gui sang Google Sheets bang Google Apps Script.

Nguon hien tai:

- Amazon product pages
- Instacart product pages

## Du lieu gui sang Sheets

```txt
Source | Product Link | SKU | TRADEMARK | Variants | Cost | Product Image
```

Cot `Product Link` la cot link chung duy nhat cho ca Amazon va Instacart. Ban co the dan san link vao cot nay, hoac bam Get Product tren extension de extension tu ghi link vao cung cot do.

Ban co the bo cot `Source` neu khong can. Script tu tim cot theo header, nen thu tu cot khong quan trong.

Voi Instacart, `SKU` la product ID trong URL. Vi du:

```txt
https://www.instacart.com/products/3310402-popcorners-popped-corn-snacks-sweet-salty-kettle-corn-7-oz?retailerSlug=walmart
```

SKU se la:

```txt
3310402
```

## Cau truc scraper

```txt
content.js                 # router nhan message tu popup
scrapers/shared.js         # helper dung chung
scrapers/amazon.js         # logic Amazon
scrapers/instacart.js      # logic Instacart
popup.js                   # UI va flow scrape/send
background.js              # gui payload sang Apps Script
Code.gs                    # Apps Script ghi vao Google Sheets
```

## Viec can sua trong Code.gs

### 1. Dan Spreadsheet ID

Trong `Code.gs`, sua:

```js
const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";
```

Spreadsheet ID lay tu URL Google Sheets:

```txt
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

### 2. Sua ten tab sheet neu can

```js
const SHEET_NAME = "Listing Product";
```

Ten nay phai khop chinh xac voi tab sheet ben duoi Google Sheets.

## Deploy Apps Script

Trong Apps Script:

```txt
Deploy -> New deployment -> Web app
```

Cau hinh:

```txt
Execute as: Me
Who has access: Anyone
```

Sau do copy Web App URL va dan vao `.env` cua extension.

## Build config

```bash
npm run build:config
```

## Ghi chu ve Instacart

Instacart phu thuoc vao retailer, location va session hien tai. Extension uu tien lay JSON-LD cua trang, sau do fallback sang du lieu render trong HTML/DOM. Cac truong on dinh nhat la link, SKU/product ID, image, trademark/brand, variant hien tai va cost hien tai.
