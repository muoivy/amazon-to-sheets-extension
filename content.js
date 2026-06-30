(() => {
  if (window.__PRODUCT_TO_SHEETS_CONTENT_LOADED__) {
    return;
  }

  window.__PRODUCT_TO_SHEETS_CONTENT_LOADED__ = true;

  const SCRAPE_ACTIONS = new Set([
    "SCRAPE_PRODUCT",
    "SCRAPE_AMAZON_PRODUCT",
    "SCRAPE_INSTACART_PRODUCT"
  ]);

  function getScraperForCurrentPage() {
    const registry = window.ProductToSheetsScrapers;

    if (!registry || !Array.isArray(registry.scrapers)) {
      return null;
    }

    return registry.scrapers.find(scraper => scraper.matches(window.location));
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!SCRAPE_ACTIONS.has(message.action)) {
      return;
    }

    try {
      const scraper = getScraperForCurrentPage();

      if (!scraper) {
        sendResponse({
          ok: false,
          error: "Trang hiện tại chưa được extension hỗ trợ."
        });
        return true;
      }

      sendResponse(scraper.scrape());
    } catch (error) {
      sendResponse({
        ok: false,
        error: error.message || "Lỗi không xác định khi scrape dữ liệu sản phẩm."
      });
    }

    return true;
  });
})();
