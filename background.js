let cachedConfig = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== "SEND_PRODUCT_TO_SHEETS") {
    return;
  }

  sendProductToSheets(message.payload)
    .then(result => {
      sendResponse(result);
    })
    .catch(error => {
      sendResponse({
        ok: false,
        error: error.message || "Không gửi được dữ liệu sang Google Sheets."
      });
    });

  return true;
});

async function loadConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configUrl = chrome.runtime.getURL("config.json");
    const response = await fetch(configUrl, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Không tìm thấy file config.json.");
    }

    const config = await response.json();

    if (!config.GOOGLE_APPS_SCRIPT_WEB_APP_URL) {
      throw new Error("Thiếu GOOGLE_APPS_SCRIPT_WEB_APP_URL trong config.json.");
    }

    cachedConfig = config;
    return cachedConfig;
  } catch (error) {
    throw new Error(
      "Chưa cấu hình Google Apps Script Web App URL. " +
      "Hãy copy .env.example thành .env, dán URL thật, rồi chạy: npm run build:config"
    );
  }
}

async function sendProductToSheets(productData) {
  const config = await loadConfig();
  const googleAppsScriptWebAppUrl = config.GOOGLE_APPS_SCRIPT_WEB_APP_URL;

  if (
    !googleAppsScriptWebAppUrl ||
    googleAppsScriptWebAppUrl.includes("YOUR_DEPLOYMENT_ID") ||
    googleAppsScriptWebAppUrl.includes("PASTE_YOUR")
  ) {
    throw new Error("Web App URL chưa hợp lệ. Hãy kiểm tra lại file .env và chạy lại npm run build:config.");
  }

  const payload = {
    link: productData.link || "",
    asin: productData.asin || "",
    brand: productData.brand || "",
    price: productData.price || "",
    variants: productData.variants || "",
    image: productData.image || ""
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const response = await fetch(googleAppsScriptWebAppUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Apps Script trả về lỗi HTTP ${response.status}: ${responseText}`);
  }

  let result;

  try {
    result = JSON.parse(responseText);
  } catch (error) {
    throw new Error("Apps Script không trả về JSON hợp lệ: " + responseText);
  }

  if (!result.ok) {
    throw new Error(result.error || "Apps Script xử lý thất bại.");
  }

  return result;
}
