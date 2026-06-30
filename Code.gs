/**
 * Google Apps Script standalone project.
 *
 * Dung cho Apps Script project tao rieng tai:
 * https://script.google.com/home
 */

// Dan Spreadsheet ID cua file Google Sheets vao day.
// Vi du URL sheet:
// https://docs.google.com/spreadsheets/d/1AbcDEFxxxxxxxxxxxx/edit
// thi Spreadsheet ID la phan: 1AbcDEFxxxxxxxxxxxx
const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";

// Ten tab sheet ben duoi Google Sheets.
// Phai khop chinh xac chu hoa/thuong va khoang trang.
const SHEET_NAME = "Listing Product";

const HEADER_ROW = 1;
const DATA_START_ROW = 2;

/**
 * FORMULA = hien thi anh truc tiep trong o bang =IMAGE("url")
 * URL     = chi luu URL anh dang text
 */
const PRODUCT_IMAGE_MODE = "FORMULA";

/**
 * Mapping field tu Extension sang ten cot trong Google Sheets.
 *
 * Co the doi thu tu cot thoai mai.
 * Neu doi ten header, them ten moi vao alias tuong ung.
 */
const HEADER_ALIASES = {
  source: [
    "Source",
    "Marketplace",
    "Retailer",
    "Platform",
    "Store",
    "Amazon",
    "Instacart",
    "Amazon/Instacart",
    "Amazon Instacart"
  ],

  link: [
    "Product Link",
    "Link",
    "URL"
  ],

  sku: [
    "SKU",
    "ASIN",
    "Product ID",
    "Instacart Product ID"
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
    message: "Product to Google Sheets Web App is running.",
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
      throw new Error("Ban chua cau hinh SPREADSHEET_ID trong Code.gs.");
    }

    const data = JSON.parse(e.postData.contents);

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = getTargetSheet(ss);
    const headerMap = getHeaderMap(sheet);

    const incomingLink = data.link || "";
    const valuesToWrite = {
      source: data.source || inferSourceFromLink(incomingLink),
      link: incomingLink,
      sku: data.sku || data.asin || "",
      brand: data.brand || "",
      variants: data.variants || "",
      price: data.price || "",
      image: data.image || ""
    };

    const linkColumnIndex = findColumnIndexByAliases(headerMap, HEADER_ALIASES.link);
    const skuColumnIndex = findColumnIndexByAliases(headerMap, HEADER_ALIASES.sku);
    let targetRow = null;
    let isUpdate = false;

    // Product Link la cot link chung cho ca Amazon va Instacart.
    // Uu tien tim theo link truoc de khop dung dong user da dan san.
    if (linkColumnIndex && valuesToWrite.link) {
      targetRow = findRowByLink(sheet, linkColumnIndex, valuesToWrite.link);
      if (targetRow) {
        isUpdate = true;
      }
    }

    if (skuColumnIndex && valuesToWrite.sku) {
      targetRow = targetRow || findRowBySku(sheet, skuColumnIndex, valuesToWrite.sku);
      if (targetRow) {
        isUpdate = true;
      }
    }

    if (!targetRow) {
      targetRow = findFirstEmptyRow(sheet);
    }

    const missingHeaders = [];

    Object.keys(valuesToWrite).forEach(field => {
      const columnIndex = findColumnIndexByAliases(headerMap, HEADER_ALIASES[field]);

      if (!columnIndex) {
        if (["link", "sku"].includes(field)) {
          missingHeaders.push(field);
        }
        return;
      }

      // Khi update: giu Product Link cu neu o nay da co du lieu.
      if (isUpdate && field === "link") {
        const currentLink = getCellLinkValue(sheet.getRange(targetRow, columnIndex));

        if (currentLink) {
          return;
        }
      }

      writeCellValue(sheet, targetRow, columnIndex, field, valuesToWrite[field]);
    });

    if (missingHeaders.length > 0) {
      throw new Error(
        "Khong tim thay header cho field bat buoc: " + missingHeaders.join(", ") +
        ". Hay kiem tra hang 1 hoac them alias trong HEADER_ALIASES."
      );
    }

    return jsonResponse({
      ok: true,
      message: isUpdate
        ? "Da cap nhat san pham trong Google Sheets (row " + targetRow + ")."
        : "Da them san pham moi vao Google Sheets (row " + targetRow + ").",
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
      "Khong tim thay tab sheet ten '" + SHEET_NAME + "'. " +
      "Hay doi ten tab sheet hoac sua SHEET_NAME trong Code.gs."
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
    throw new Error("Sheet chua co header o hang 1.");
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

function normalizeSku(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function inferSourceFromLink(value) {
  const text = String(value || "").trim();

  if (/amazon\./i.test(text)) {
    return "Amazon";
  }

  if (/instacart\.com/i.test(text)) {
    return "Instacart";
  }

  return "";
}

function extractSkuFromLink(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?#&]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?#&]|$)/i,
    /\/product\/([A-Z0-9]{10})(?:[/?#&]|$)/i,
    /[?&]asin=([A-Z0-9]{10})(?:[&#]|$)/i,
    /\/products\/(\d+)(?:-|\/|[?#]|$)/i,
    /[?&]product_id=(\d+)(?:[&#]|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match && match[1]) {
      return normalizeSku(match[1]);
    }
  }

  return normalizeSku(text);
}

function normalizeProductLinkForCompare(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    const sku = extractSkuFromLink(url.href);

    if (/amazon\./i.test(url.hostname) && sku) {
      return "amazon:" + sku;
    }

    if (/instacart\.com$/i.test(url.hostname) && sku) {
      const retailerSlug = url.searchParams.get("retailerSlug") || "";
      return "instacart:" + sku + ":" + retailerSlug.toLowerCase();
    }

    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    [
      "ref",
      "tag",
      "psc",
      "qid",
      "sr",
      "sprefix",
      "crid",
      "keywords",
      "th",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content"
    ].forEach(param => url.searchParams.delete(param));

    return url.href.toLowerCase();
  } catch (error) {
    return text.toLowerCase();
  }
}

function getCellLinkValue(range) {
  const displayValue = String(range.getDisplayValue() || "").trim();

  if (/^https?:\/\//i.test(displayValue)) {
    return displayValue;
  }

  const formula = String(range.getFormula() || "").trim();
  const formulaMatch = formula.match(/HYPERLINK\(\s*"([^"]+)"/i);

  if (formulaMatch && formulaMatch[1]) {
    return formulaMatch[1];
  }

  try {
    const richTextValue = range.getRichTextValue();
    const linkUrl = richTextValue && richTextValue.getLinkUrl();

    if (linkUrl) {
      return linkUrl;
    }
  } catch (error) {
    // Ignore rich text read errors.
  }

  return displayValue;
}

function getColumnLinkValues(sheet, columnIndex, numberOfRows) {
  const range = sheet.getRange(DATA_START_ROW, columnIndex, numberOfRows, 1);
  const displayValues = range.getDisplayValues();
  const formulas = range.getFormulas();
  let richTextValues = [];

  try {
    richTextValues = range.getRichTextValues();
  } catch (error) {
    richTextValues = [];
  }

  return displayValues.map((row, index) => {
    const displayValue = String(row[0] || "").trim();
    const formula = String((formulas[index] && formulas[index][0]) || "").trim();
    const formulaMatch = formula.match(/HYPERLINK\(\s*"([^"]+)"/i);
    const richTextValue = richTextValues[index] && richTextValues[index][0];
    const richTextLink = richTextValue && richTextValue.getLinkUrl && richTextValue.getLinkUrl();

    return richTextLink || (formulaMatch && formulaMatch[1]) || displayValue;
  });
}

function findRowBySku(sheet, skuColumnIndex, skuToFind) {
  const lastRow = sheet.getLastRow();

  if (lastRow < DATA_START_ROW) {
    return null;
  }

  const normalizedTarget = normalizeSku(skuToFind);

  if (!normalizedTarget) {
    return null;
  }

  const numberOfRows = lastRow - DATA_START_ROW + 1;
  const values = sheet
    .getRange(DATA_START_ROW, skuColumnIndex, numberOfRows, 1)
    .getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const cellSku = normalizeSku(values[i][0]);

    if (cellSku && cellSku === normalizedTarget) {
      return DATA_START_ROW + i;
    }
  }

  return null;
}

function findRowByLink(sheet, linkColumnIndex, linkToFind) {
  const lastRow = sheet.getLastRow();

  if (lastRow < DATA_START_ROW) {
    return null;
  }

  const numberOfRows = lastRow - DATA_START_ROW + 1;
  const values = getColumnLinkValues(sheet, linkColumnIndex, numberOfRows);
  const normalizedTarget = normalizeProductLinkForCompare(linkToFind);
  const targetSku = extractSkuFromLink(linkToFind);
  const targetSource = inferSourceFromLink(linkToFind);

  for (let i = 0; i < values.length; i++) {
    const cellValue = String(values[i] || "").trim();
    const normalizedCellValue = normalizeProductLinkForCompare(cellValue);

    if (cellValue && normalizedCellValue && normalizedCellValue === normalizedTarget) {
      return DATA_START_ROW + i;
    }

    if (
      targetSku &&
      extractSkuFromLink(cellValue) === targetSku &&
      inferSourceFromLink(cellValue) === targetSource
    ) {
      return DATA_START_ROW + i;
    }
  }

  return null;
}

/**
 * Tim dong trong dau tien tu hang 2 tro xuong.
 * Neu mot dong co text o bat ky o nao thi bo qua dong do.
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
