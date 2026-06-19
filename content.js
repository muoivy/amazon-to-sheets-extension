(() => {
  // Tránh đăng ký listener nhiều lần nếu content.js bị inject lại.
  if (window.__AMAZON_TO_SHEETS_CONTENT_LOADED__) {
    return;
  }

  window.__AMAZON_TO_SHEETS_CONTENT_LOADED__ = true;

  function cleanText(value) {
    return (value || "")
      .replace(/\s+/g, " ")
      .replace(/\u200e/g, "")
      .trim();
  }

  function getText(selector) {
    const el = document.querySelector(selector);
    return el ? cleanText(el.textContent) : "";
  }

  function getTextFromSelectors(selectors) {
    for (const selector of selectors) {
      const text = getText(selector);
      if (text) return text;
    }

    return "";
  }

  function normalizePrice(price) {
    return cleanText(price)
      .replace(/\s+/g, "")
      .trim();
  }

  function getProductLink() {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;

    if (canonical) {
      return canonical;
    }

    return window.location.href;
  }

  function getASIN() {
    const inputSelectors = [
      "#ASIN",
      "input[name='ASIN']",
      "input[name='asin']"
    ];

    for (const selector of inputSelectors) {
      const input = document.querySelector(selector);
      const value = input?.value?.trim();

      if (value && /^[A-Z0-9]{10}$/i.test(value)) {
        return value.toUpperCase();
      }
    }

    const detailBulletsText = document.body.innerText || "";
    const asinMatchFromText = detailBulletsText.match(/\bASIN\s*[:‏‎]?\s*([A-Z0-9]{10})\b/i);

    if (asinMatchFromText) {
      return asinMatchFromText[1].toUpperCase();
    }

    const urlPatterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/product\/([A-Z0-9]{10})/i
    ];

    for (const pattern of urlPatterns) {
      const match = window.location.href.match(pattern);

      if (match) {
        return match[1].toUpperCase();
      }
    }

    return "";
  }

  function getBrandFromTable() {
    const rows = document.querySelectorAll(`
      #productOverview_feature_div tr,
      #prodDetails tr,
      #detailBullets_feature_div li,
      #productDetails_techSpec_section_1 tr,
      #productDetails_detailBullets_sections1 tr,
      table.a-normal tr
    `);

    for (const row of rows) {
      const rowText = cleanText(row.textContent);

      if (!/brand/i.test(rowText)) {
        continue;
      }

      const th = row.querySelector("th, .a-color-secondary, .a-span3");
      const td = row.querySelector("td, .a-span9");

      const label = cleanText(th?.textContent).replace(":", "").toLowerCase();

      if (label === "brand" && td) {
        return cleanText(td.textContent);
      }

      const match = rowText.match(/^Brand\s*[:‏‎]?\s*(.+)$/i);

      if (match) {
        return cleanText(match[1]);
      }
    }

    return "";
  }

  function getBrand() {
    let brand = getTextFromSelectors([
      "#bylineInfo",
      "a#bylineInfo",
      "#brand",
      ".po-brand .po-break-word"
    ]);

    if (brand) {
      brand = brand
        .replace(/^Visit the\s+/i, "")
        .replace(/\s+Store$/i, "")
        .replace(/^Brand\s*:\s*/i, "")
        .replace(/^by\s+/i, "")
        .trim();

      return brand;
    }

    return getBrandFromTable();
  }

  function getTitle() {
    return getTextFromSelectors([
      "#productTitle",
      "#title",
      "span#productTitle"
    ]);
  }

  function extractPriceFromText(text) {
    const clean = cleanText(text);

    if (!clean) {
      return "";
    }

    const match = clean.match(/(?:[$€£¥₹]\s*\d[\d,.]*|\d[\d,.]*\s*(?:USD|EUR|GBP|JPY|CAD|AUD))/i);

    return match ? match[0].replace(/\s+/g, "") : "";
  }

  /**
   * Ưu tiên lấy Typical price nếu sản phẩm đang giảm giá.
   *
   * Ví dụ Amazon hiển thị:
   * Typical price: $4.48
   *
   * Kết quả Cost sẽ là:
   * $4.48
   *
   * Nếu không có Typical price thì fallback lấy giá hiện tại.
   */
  function getTypicalPrice() {
    const priceRoots = document.querySelectorAll(`
      #corePrice_feature_div,
      #corePriceDisplay_desktop_feature_div,
      #corePriceDisplay_mobile_feature_div,
      #apex_desktop,
      #centerCol,
      #desktop_buybox,
      #buybox
    `);

    /**
     * Cách 1: tìm text có dạng "Typical price: $4.48"
     */
    for (const root of priceRoots) {
      const rootText = cleanText(root.textContent);

      const directMatch = rootText.match(/Typical\s+price\s*:?\s*([$€£¥₹]\s*\d[\d,.]*)/i);

      if (directMatch && directMatch[1]) {
        return directMatch[1].replace(/\s+/g, "");
      }
    }

    /**
     * Cách 2: tìm element có chữ "Typical price",
     * sau đó lấy price trong chính element hoặc parent gần nhất.
     */
    const allElements = document.querySelectorAll("span, div, td, th");

    for (const el of allElements) {
      const text = cleanText(el.textContent);

      if (!/Typical\s+price/i.test(text)) {
        continue;
      }

      const directMatch = text.match(/Typical\s+price\s*:?\s*([$€£¥₹]\s*\d[\d,.]*)/i);

      if (directMatch && directMatch[1]) {
        return directMatch[1].replace(/\s+/g, "");
      }

      const parent = el.closest("tr, .a-section, .a-row, .basisPrice, #corePrice_feature_div, #corePriceDisplay_desktop_feature_div");

      if (parent) {
        const offscreenPrice = parent.querySelector(".a-price .a-offscreen, .a-offscreen");

        if (offscreenPrice) {
          const price = extractPriceFromText(offscreenPrice.textContent);

          if (price) {
            return price;
          }
        }

        const price = extractPriceFromText(parent.textContent);

        if (price) {
          return price;
        }
      }
    }

    return "";
  }

  function getCurrentPrice() {
    const priceSelectors = [
      "#corePrice_feature_div .a-price .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
      "#corePriceDisplay_mobile_feature_div .a-price .a-offscreen",
      "#apex_desktop .a-price .a-offscreen",
      ".priceToPay .a-offscreen",
      "#tp_price_block_total_price_ww .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      "#priceblock_saleprice",
      ".a-price .a-offscreen"
    ];

    for (const selector of priceSelectors) {
      const elements = document.querySelectorAll(selector);

      for (const el of elements) {
        const price = normalizePrice(el.textContent);

        if (price && /[$€£¥₹]?\d/.test(price)) {
          return price;
        }
      }
    }

    const metaPrice = document.querySelector("meta[itemprop='price']")?.content;
    const metaCurrency = document.querySelector("meta[itemprop='priceCurrency']")?.content;

    if (metaPrice) {
      return metaCurrency ? `${metaCurrency} ${metaPrice}` : metaPrice;
    }

    return "";
  }

  function getPrice() {
    return getTypicalPrice() || getCurrentPrice();
  }

  function normalizeSizeValue(value) {
    return cleanText(value)
      .replace(/^selected\s+/i, "")
      .replace(/^currently selected\s+/i, "")
      .replace(/^size\s*:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Chỉ lấy Size đang được chọn trên Amazon.
   *
   * Ví dụ Amazon hiển thị:
   * Size: 6 Count (Pack of 1)
   *
   * Kết quả trả về:
   * 6 Count (Pack of 1)
   *
   * Không lấy Color, Style, Flavor...
   */
  function getVariants() {
    const sizeContainerSelectors = [
      "#variation_size_name",
      "#variation_size",
      "#variation_count",
      "#variation_item_package_quantity",
      "#variation_number_of_items",
      "[id='variation_size_name']",
      "[id='variation_size']"
    ];

    /**
     * Cách 1: lấy trực tiếp từ block size chuẩn.
     */
    for (const selector of sizeContainerSelectors) {
      const container = document.querySelector(selector);

      if (!container) {
        continue;
      }

      let value = cleanText(container.querySelector(".selection")?.textContent);

      const inlineText = container.querySelector("[id^='inline-twister-expanded-dimension-text']");
      if (!value && inlineText) {
        value = cleanText(inlineText.textContent);
      }

      const select = container.querySelector("select");
      if (!value && select) {
        value = cleanText(select.options[select.selectedIndex]?.textContent);
      }

      const selectedOption = container.querySelector(`
        .swatchSelect,
        .selected,
        li[aria-checked='true'],
        button[aria-pressed='true'],
        .a-button-selected
      `);

      if (!value && selectedOption) {
        value = cleanText(
          selectedOption.getAttribute("title") ||
          selectedOption.getAttribute("aria-label") ||
          selectedOption.textContent
        );
      }

      value = normalizeSizeValue(value);

      if (value) {
        return value;
      }
    }

    /**
     * Cách 2: lấy từ inline twister mới.
     * Ví dụ:
     * #inline-twister-expanded-dimension-text-size_name
     */
    const inlineSizeSelectors = [
      "#inline-twister-expanded-dimension-text-size_name",
      "#inline-twister-expanded-dimension-text-size",
      "#inline-twister-expanded-dimension-text-count",
      "#inline-twister-expanded-dimension-text-item_package_quantity",
      "#inline-twister-expanded-dimension-text-number_of_items"
    ];

    for (const selector of inlineSizeSelectors) {
      const el = document.querySelector(selector);
      const value = normalizeSizeValue(el?.textContent);

      if (value) {
        return value;
      }
    }

    /**
     * Cách 3: quét text trong vùng twister để tìm dòng:
     * Size: xxx
     */
    const twisterRoot = document.querySelector("#twister, #twister_feature_div, #centerCol");

    if (twisterRoot) {
      const text = cleanText(twisterRoot.textContent);

      const sizeMatch = text.match(/\bSize\s*:\s*([^|]+?)(?=\s*(Style|Color|Colour|Flavor|Flavour|Scent|Pattern|Pack|$))/i);

      if (sizeMatch && sizeMatch[1]) {
        return normalizeSizeValue(sizeMatch[1]);
      }

      const elements = twisterRoot.querySelectorAll("span, div, label");

      for (const el of elements) {
        const line = cleanText(el.textContent);
        const match = line.match(/^Size\s*:\s*(.+)$/i);

        if (match && match[1]) {
          return normalizeSizeValue(match[1]);
        }
      }
    }

    /**
     * Cách 4: fallback từ aria-label/title của option đang chọn.
     */
    const selectedOptions = document.querySelectorAll(`
      #twister .swatchSelect,
      #twister .a-button-selected,
      #twister li[aria-checked='true'],
      #twister_feature_div .swatchSelect,
      #twister_feature_div .a-button-selected,
      #twister_feature_div li[aria-checked='true']
    `);

    for (const el of selectedOptions) {
      const text = cleanText(
        el.getAttribute("title") ||
        el.getAttribute("aria-label") ||
        el.textContent
      );

      const match = text.match(/^Size\s*:\s*(.+)$/i);

      if (match && match[1]) {
        return normalizeSizeValue(match[1]);
      }
    }

    return "";
  }

  function scrapeAmazonProduct() {
    const data = {
      link: getProductLink(),
      asin: getASIN(),
      brand: getBrand(),
      title: getTitle(),
      price: getPrice(),
      variants: getVariants()
    };

    const warnings = [];

    if (!data.asin) warnings.push("ASIN");
    if (!data.brand) warnings.push("Brand");
    if (!data.title) warnings.push("Title");
    if (!data.price) warnings.push("Price");
    if (!data.variants) warnings.push("Size");

    if (!data.asin && !data.title) {
      return {
        ok: false,
        error: "Không nhận diện được trang chi tiết sản phẩm Amazon. Hãy mở trang sản phẩm dạng /dp/ASIN rồi thử lại."
      };
    }

    return {
      ok: true,
      data,
      warnings
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== "SCRAPE_AMAZON_PRODUCT") {
      return;
    }

    try {
      const result = scrapeAmazonProduct();
      sendResponse(result);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error.message || "Lỗi không xác định khi scrape dữ liệu Amazon."
      });
    }

    return true;
  });
})();
