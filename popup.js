const getProductBtn = document.getElementById("getProductBtn");
const statusBox = document.getElementById("status");

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

// Gửi message sang content.js.
// Nếu content.js chưa được inject vì tab đã mở trước khi cài extension,
// ta inject lại content.js bằng chrome.scripting.
async function scrapeCurrentTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      action: "SCRAPE_AMAZON_PRODUCT"
    });
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    return await chrome.tabs.sendMessage(tabId, {
      action: "SCRAPE_AMAZON_PRODUCT"
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

    if (!tab.url || !tab.url.includes("amazon.")) {
      throw new Error("Vui lòng mở trang chi tiết sản phẩm Amazon trước khi bấm Get Product.");
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

    let message = "✅ Đã gửi sản phẩm vào Google Sheets thành công.";

    if (scrapeResult.warnings && scrapeResult.warnings.length > 0) {
      message += "\n\n⚠️ Thiếu dữ liệu: " + scrapeResult.warnings.join(", ");
    }

    message += `\n\nASIN/SKU: ${productData.asin || "N/A"}`;
    message += `\nTitle: ${productData.title || "N/A"}`;

    setStatus(message, "success");
  } catch (error) {
    setStatus("❌ " + error.message, "error");
  } finally {
    getProductBtn.disabled = false;
  }
});
