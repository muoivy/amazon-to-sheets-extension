const getProductBtn = document.getElementById("getProductBtn");
const statusBox = document.getElementById("status");

const CONTENT_SCRIPT_FILES = [
  "scrapers/shared.js",
  "scrapers/amazon.js",
  "scrapers/instacart.js",
  "content.js"
];

const SUPPORTED_HOSTS = [
  /(^|\.)amazon\./i,
  /(^|\.)instacart\.com$/i
];

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = type;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0];
}

function isSupportedProductUrl(url) {
  try {
    const parsedUrl = new URL(url);

    return SUPPORTED_HOSTS.some(pattern => pattern.test(parsedUrl.hostname));
  } catch (error) {
    return false;
  }
}

async function scrapeCurrentTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });

  try {
    return await chrome.tabs.sendMessage(tabId, {
      action: "SCRAPE_PRODUCT"
    });
  } catch (error) {
    return await chrome.tabs.sendMessage(tabId, {
      action: "SCRAPE_PRODUCT"
    });
  }
}

getProductBtn.addEventListener("click", async () => {
  getProductBtn.disabled = true;
  setStatus("Getting product data...", "loading");

  try {
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
      throw new Error("Không tìm thấy tab hiện tại.");
    }

    if (!tab.url || !isSupportedProductUrl(tab.url)) {
      throw new Error("Vui lòng mở trang chi tiết sản phẩm Amazon hoặc Instacart trước khi bấm Get Product.");
    }

    const scrapeResult = await scrapeCurrentTab(tab.id);

    if (!scrapeResult || !scrapeResult.ok) {
      throw new Error(scrapeResult?.error || "Không lấy được dữ liệu sản phẩm.");
    }

    const productData = scrapeResult.data;

    const sendResult = await chrome.runtime.sendMessage({
      action: "SEND_PRODUCT_TO_SHEETS",
      payload: productData
    });

    if (!sendResult || !sendResult.ok) {
      throw new Error(sendResult?.error || "Gửi dữ liệu sang Google Sheets thất bại.");
    }

    let message = sendResult.action === "updated"
      ? "Đã cập nhật sản phẩm trong Google Sheets."
      : "Đã thêm sản phẩm mới vào Google Sheets.";

    if (scrapeResult.warnings && scrapeResult.warnings.length > 0) {
      message += "\n\nThiếu dữ liệu: " + scrapeResult.warnings.join(", ");
    }

    message += `\n\nSource: ${productData.source || "N/A"}`;
    message += `\nSKU: ${productData.sku || productData.asin || "N/A"}`;

    setStatus(message, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    getProductBtn.disabled = false;
  }
});
