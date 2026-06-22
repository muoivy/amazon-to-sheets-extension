/**
 * Google Apps Script standalone project.
 *
 * Dùng cho trường hợp Apps Script tạo riêng tại:
 * https://script.google.com/home
 *
 * Không dùng SpreadsheetApp.getActiveSpreadsheet()
 * mà dùng SpreadsheetApp.openById(SPREADSHEET_ID)
 */

// Dán Spreadsheet ID của file Google Sheets vào đây.
// Ví dụ URL sheet:
// https://docs.google.com/spreadsheets/d/1AbcDEFxxxxxxxxxxxx/edit
// thì Spreadsheet ID là phần: 1AbcDEFxxxxxxxxxxxx
const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";

// Tên tab sheet bên dưới Google Sheets.
// Phải khớp chính xác chữ hoa/thường và khoảng trắng.
const SHEET_NAME = "Listing Product";

const HEADER_ROW = 1;
const DATA_START_ROW = 2;

/**
 * FORMULA = hiển thị ảnh trực tiếp trong ô bằng =IMAGE("url")
 * URL     = chỉ lưu URL ảnh dạng text
 */
const PRODUCT_IMAGE_MODE = "FORMULA";

/**
 * Mapping field từ Extension sang tên cột trong Google Sheets.
 *
 * Có thể đổi thứ tự cột thoải mái.
 * Nếu đổi tên header, thêm tên mới vào alias tương ứng.
 */
const HEADER_ALIASES = {
  link: [
    "Product Link",
    "Link",
    "URL",
    "Amazon Link"
  ],

  asin: [
    "SKU",
    "ASIN"
  ],

  brand: [
    "TRADEMARK",
    "Trademark",
    "Brand",
    "Product Brand"
  ],

  variants: [
    "Variants",
    "Variant",
    "Variation",
    "Size"
  ],

  price: [
    "Cost",
    "Price",
    "Product Cost"
  ],

  image: [
    "Product Image",
    "Image",
    "Image URL",
    "Main Image"
  ]
};

function doGet() {
  return jsonResponse({
    ok: true,
    message: "Amazon to Google Sheets Web App is running.",
    spreadsheetId: SPREADSHEET_ID,
    sheetName: SHEET_NAME
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No POST data received.");
    }

    if (!SPREADSHEET_ID || SPREADSHEET_ID === "PASTE_YOUR_SPREADSHEET_ID_HERE") {
      throw new Error("Bạn chưa cấu hình SPREADSHEET_ID trong Code.gs.");
    }

    const data = JSON.parse(e.postData.contents);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getTargetSheet(ss);

    const headerMap = getHeaderMap(sheet);

    const valuesToWrite = {
      link: data.link || "",
      asin: data.asin || "",
      brand: data.brand || "",
      variants: data.variants || "",
      price: data.price || "",
      image: data.image || ""
    };

    // Tìm row đã có Product Link trùng → update, không tạo mới
    const linkColumnIndex = findColumnIndexByAliases(headerMap, HEADER_ALIASES["link"]);
    let targetRow = null;
    let isUpdate = false;

    if (linkColumnIndex && valuesToWrite.link) {
      targetRow = findRowByLink(sheet, linkColumnIndex, valuesToWrite.link);
      if (targetRow) {
        isUpdate = true;
      }
    }

    // Nếu không tìm thấy row trùng → append dòng mới
    if (!targetRow) {
      targetRow = findFirstEmptyRow(sheet);
    }

    const missingHeaders = [];

    Object.keys(valuesToWrite).forEach(field => {
      const columnIndex = findColumnIndexByAliases(headerMap, HEADER_ALIASES[field]);

      if (!columnIndex) {
        // Chỉ báo lỗi với các field bắt buộc (bỏ qua field không có cột tương ứng)
        if (["link", "asin"].includes(field)) {
          missingHeaders.push(field);
        }
        return;
      }

      // Khi update: bỏ qua ghi đè cột link (đã có rồi)
      if (isUpdate && field === "link") {
        return;
      }

      writeCellValue(sheet, targetRow, columnIndex, field, valuesToWrite[field]);
    });

    if (missingHeaders.length > 0) {
      throw new Error(
        "Không tìm thấy header cho field bắt buộc: " + missingHeaders.join(", ") +
        ". Hãy kiểm tra hàng 1 hoặc thêm alias trong HEADER_ALIASES."
      );
    }

    return jsonResponse({
      ok: true,
      message: isUpdate
        ? "Đã cập nhật sản phẩm trong Google Sheets (row " + targetRow + ")."
        : "Đã thêm sản phẩm mới vào Google Sheets (row " + targetRow + ").",
      row: targetRow,
      action: isUpdate ? "updated" : "inserted"
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.message || "Unknown Apps Script error."
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      // Ignore lock release error.
    }
  }
}

function writeCellValue(sheet, rowIndex, columnIndex, field, value) {
  const range = sheet.getRange(rowIndex, columnIndex);

  if (field === "image" && value) {
    if (PRODUCT_IMAGE_MODE === "FORMULA") {
      range.setFormula('=IMAGE("' + escapeFormulaString(value) + '", 1)');
      sheet.setRowHeight(rowIndex, 120);
      return;
    }

    range.setValue(value);
    return;
  }

  range.setValue(value);
}

function escapeFormulaString(value) {
  return String(value || "").replace(/"/g, '""');
}

function getTargetSheet(ss) {
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(
      "Không tìm thấy tab sheet tên '" + SHEET_NAME + "'. " +
      "Hãy đổi tên tab sheet hoặc sửa SHEET_NAME trong Code.gs."
    );
  }

  return sheet;
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getHeaderMap(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error("Sheet chưa có header ở hàng 1.");
  }

  const headers = sheet
    .getRange(HEADER_ROW, 1, 1, lastColumn)
    .getDisplayValues()[0];

  const headerMap = {};

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);

    if (normalized) {
      headerMap[normalized] = index + 1;
    }
  });

  return headerMap;
}

function findColumnIndexByAliases(headerMap, aliases) {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);

    if (headerMap[normalizedAlias]) {
      return headerMap[normalizedAlias];
    }
  }

  return null;
}

/**
 * Tìm row đã có link trùng trong cột Product Link.
 * Trả về row index (1-based) nếu tìm thấy, null nếu không.
 */
function findRowByLink(sheet, linkColumnIndex, linkToFind) {
  const lastRow = sheet.getLastRow();

  if (lastRow < DATA_START_ROW) {
    return null;
  }

  const numberOfRows = lastRow - DATA_START_ROW + 1;
  const values = sheet
    .getRange(DATA_START_ROW, linkColumnIndex, numberOfRows, 1)
    .getDisplayValues();

  const normalizedTarget = String(linkToFind).trim().toLowerCase();

  for (let i = 0; i < values.length; i++) {
    const cellValue = String(values[i][0] || "").trim().toLowerCase();
    if (cellValue && cellValue === normalizedTarget) {
      return DATA_START_ROW + i;
    }
  }

  return null;
}

/**
 * Tìm dòng trống đầu tiên từ hàng 2 trở xuống.
 * Nếu một dòng có text ở bất kỳ ô nào thì bỏ qua dòng đó.
 */
function findFirstEmptyRow(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), DATA_START_ROW);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);

  const numberOfRows = Math.max(lastRow - DATA_START_ROW + 1, 1);

  const values = sheet
    .getRange(DATA_START_ROW, 1, numberOfRows, lastColumn)
    .getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const isEmptyRow = row.every(cell => String(cell || "").trim() === "");

    if (isEmptyRow) {
      return DATA_START_ROW + i;
    }
  }

  return lastRow + 1;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
