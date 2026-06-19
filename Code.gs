/**
 * Google Apps Script nhận dữ liệu từ Chrome Extension
 * và fill vào đúng cột theo tên header ở hàng 1.
 *
 * Sheet tab nên đặt tên là: Listing Product
 * Nếu bạn dùng tên tab khác, sửa SHEET_NAME bên dưới.
 */

const SHEET_NAME = "Listing Product";

const HEADER_ROW = 1;
const DATA_START_ROW = 2;

/**
 * Mapping field từ Extension sang tên cột trong Google Sheets.
 *
 * Có thể đổi thứ tự cột thoải mái.
 * Nếu đổi tên header, hãy thêm tên mới vào mảng alias tương ứng.
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
    "Variation"
  ],

  price: [
    "Cost",
    "Price",
    "Product Cost"
  ]
};

function doGet() {
  return jsonResponse({
    ok: true,
    message: "Amazon to Google Sheets Web App is running."
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No POST data received.");
    }

    const data = JSON.parse(e.postData.contents);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getTargetSheet(ss);

    const headerMap = getHeaderMap(sheet);
    const targetRow = findFirstEmptyRow(sheet);

    /**
     * Chỉ fill các cột bạn yêu cầu:
     * Product Link, SKU, TRADEMARK, Variants, Cost
     */
    const valuesToWrite = {
      link: data.link || "",
      asin: data.asin || "",
      brand: data.brand || "",
      variants: data.variants || "",
      price: data.price || ""
    };

    const missingHeaders = [];

    Object.keys(valuesToWrite).forEach(field => {
      const columnIndex = findColumnIndexByAliases(headerMap, HEADER_ALIASES[field]);

      if (!columnIndex) {
        missingHeaders.push(field);
        return;
      }

      sheet.getRange(targetRow, columnIndex).setValue(valuesToWrite[field]);
    });

    if (missingHeaders.length > 0) {
      throw new Error(
        "Không tìm thấy header cho field: " + missingHeaders.join(", ") +
        ". Hãy kiểm tra hàng 1 hoặc thêm alias trong HEADER_ALIASES."
      );
    }

    return jsonResponse({
      ok: true,
      message: "Saved to Google Sheets successfully.",
      row: targetRow
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

function getTargetSheet(ss) {
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(
      "Không tìm thấy sheet tab tên '" + SHEET_NAME + "'. " +
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
