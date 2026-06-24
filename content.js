(() => {
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
    return cleanText(price).replace(/\s+/g, "").trim();
  }

  function getProductLink(asin) {
    if (asin) {
      return "https://www.amazon.com/dp/" + asin;
    }
    // Fallback: extract ASIN from canonical or current URL
    const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;
    const match = canonical.match(/\/dp\/([A-Z0-9]{10})/i);
    if (match) {
      return "https://www.amazon.com/dp/" + match[1].toUpperCase();
    }
    return canonical;
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

    const bodyText = document.body.innerText || "";
    const asinMatchFromText = bodyText.match(/\bASIN\s*[:‏‎]?\s*([A-Z0-9]{10})\b/i);

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

  function getPriceRoot() {
    return document.querySelector(
      "#apex_desktop #corePriceDisplay_desktop_feature_div, " +
      "#apex_desktop #corePrice_feature_div, " +
      "#corePriceDisplay_desktop_feature_div, " +
      "#corePrice_feature_div"
    );
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractPriceAfterLabel(text, label) {
    const clean = cleanText(text);

    if (!clean) {
      return "";
    }

    const match = clean.match(
      new RegExp(`${escapeRegExp(label)}\\s*:?\\s*([$€£¥₹]\\s*\\d[\\d,.]*)`, "i")
    );

    return match?.[1] ? match[1].replace(/\s+/g, "") : "";
  }

  function getLabeledPriceFromRoot(root, labels) {
    if (!root) {
      return "";
    }

    for (const label of labels) {
      const labelRegex = new RegExp(escapeRegExp(label), "i");
      const elements = root.querySelectorAll(".basisPrice, .a-row, .a-section, tr, span, div, td, th");

      for (const el of elements) {
        const text = cleanText(el.textContent);

        if (!labelRegex.test(text)) {
          continue;
        }

        const closestPriceRow = el.closest(".basisPrice, .a-row, tr") || el;
        const candidateRows = [el];

        if (closestPriceRow !== el && root.contains(closestPriceRow)) {
          candidateRows.push(closestPriceRow);
        }

        for (const row of candidateRows) {
          const labeledPrice = extractPriceAfterLabel(row.textContent, label);

          if (labeledPrice) {
            return labeledPrice;
          }

          const textPrice = row.querySelector(".a-price.a-text-price .a-offscreen, .a-text-price .a-offscreen");
          const hiddenPrice = extractPriceFromText(textPrice?.textContent);

          if (hiddenPrice) {
            return hiddenPrice;
          }
        }
      }
    }

    return "";
  }

  function getCurrentPriceFromRoot(root) {
    if (!root) {
      return "";
    }

    const priceSelectors = [
      ".priceToPay .a-offscreen",
      ".apexPriceToPay .a-offscreen",
      "[data-a-color='price'] .a-offscreen",
      ".a-price:not(.a-text-price) .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      "#priceblock_saleprice"
    ];

    for (const selector of priceSelectors) {
      const elements = root.querySelectorAll(selector);

      for (const el of elements) {
        if (el.closest(".basisPrice, .a-text-price")) {
          continue;
        }

        const price = normalizePrice(el.textContent);

        if (price && /[$€£¥₹]?\d/.test(price)) {
          return price;
        }
      }
    }

    return "";
  }

  function getPrice() {
    const root = getPriceRoot();

    return getLabeledPriceFromRoot(root, ["Typical price", "Bundle Was Price"]) ||
      getCurrentPriceFromRoot(root);
  }

  function normalizeSizeValue(value) {
    return cleanText(value)
      .replace(/^selected\s+/i, "")
      .replace(/^currently selected\s+/i, "")
      .replace(/^size\s*:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getVariants() {
    const sizeContainerSelectors = [
      "#variation_size_name",
      "#variation_size",
      "#variation_count",
      "#variation_item_package_quantity",
      "#variation_number_of_items"
    ];

    for (const selector of sizeContainerSelectors) {
      const container = document.querySelector(selector);

      if (!container) continue;

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

    return "";
  }

  function isValidImageUrl(url) {
    return Boolean(url && /^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url));
  }

  function getLargestImageFromDynamicImage(dynamicImageValue) {
    if (!dynamicImageValue) {
      return "";
    }

    try {
      const imageMap = JSON.parse(dynamicImageValue);
      let bestUrl = "";
      let bestArea = 0;

      Object.keys(imageMap).forEach(url => {
        const size = imageMap[url];

        if (!Array.isArray(size) || size.length < 2) {
          return;
        }

        const width = Number(size[0]) || 0;
        const height = Number(size[1]) || 0;
        const area = width * height;

        if (area > bestArea) {
          bestArea = area;
          bestUrl = url;
        }
      });

      return bestUrl;
    } catch (error) {
      return "";
    }
  }

  function getProductImage() {
    const imageSelectors = [
      "#landingImage",
      "#imgTagWrapperId img",
      "#main-image-container img",
      "#imageBlock img",
      "#altImages img"
    ];

    for (const selector of imageSelectors) {
      const img = document.querySelector(selector);

      if (!img) {
        continue;
      }

      const dynamicImage = getLargestImageFromDynamicImage(
        img.getAttribute("data-a-dynamic-image")
      );

      const imageUrl =
        img.getAttribute("data-old-hires") ||
        dynamicImage ||
        img.currentSrc ||
        img.src ||
        img.getAttribute("data-src");

      if (isValidImageUrl(imageUrl)) {
        return imageUrl;
      }
    }

    const html = document.documentElement.innerHTML;
    const match = html.match(/https?:\/\/[^"']*m\.media-amazon\.com\/images\/I\/[^"']+\.(?:jpg|jpeg|png|webp)/i);

    if (match && match[0]) {
      return match[0].replace(/\\u002F/g, "/");
    }

    return "";
  }

  function scrapeAmazonProduct() {
    const asin = getASIN();
    const data = {
      link: getProductLink(asin),
      asin: asin,
      brand: getBrand(),
      title: getTitle(),
      price: getPrice(),
      variants: getVariants(),
      image: getProductImage()
    };

    const warnings = [];

    if (!data.asin) warnings.push("ASIN");
    if (!data.brand) warnings.push("Brand");
    if (!data.title) warnings.push("Title");
    if (!data.price) warnings.push("Price");
    if (!data.variants) warnings.push("Size");
    if (!data.image) warnings.push("Product Image");

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