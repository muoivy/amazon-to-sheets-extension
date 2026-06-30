(() => {
  const registry = window.ProductToSheetsScrapers;
  const {
    applyTextReplacements,
    buildWarnings,
    cleanText,
    escapeRegExp,
    getNodeHtmlOrText,
    getNodeText,
    getTextFromSelectors,
    isValidImageUrl,
    parsePriceText,
    queryAll,
    queryOne
  } = registry.shared;

  const AMAZON_CONFIG = {
    name: "Amazon",
    hostPattern: /(^|\.)amazon\./i,
    productUrlBase: "https://www.amazon.com/dp/",
    urlPatterns: [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/product\/([A-Z0-9]{10})/i
    ],
    asin: {
      inputSelectors: [
        "#ASIN",
        "input[name='ASIN']",
        "input[name='asin']"
      ],
      bodyPattern: /\bASIN\s*[:\u200f\u200e]?\s*([A-Z0-9]{10})\b/i
    },
    brand: {
      selectors: [
        "#bylineInfo",
        "a#bylineInfo",
        "#brand",
        ".po-brand .po-break-word"
      ],
      tableRowSelectors: [
        "#productOverview_feature_div tr",
        "#prodDetails tr",
        "#detailBullets_feature_div li",
        "#productDetails_techSpec_section_1 tr",
        "#productDetails_detailBullets_sections1 tr",
        "table.a-normal tr"
      ],
      tableLabelSelectors: "th, .a-color-secondary, .a-span3",
      tableValueSelectors: "td, .a-span9",
      cleanupPatterns: [
        [/^Visit the\s+/i, ""],
        [/\s+Store$/i, ""],
        [/^Brand\s*:\s*/i, ""],
        [/^by\s+/i, ""]
      ]
    },
    price: {
      rootSelectors: [
        "#apex_desktop #corePriceDisplay_desktop_feature_div",
        "#corePriceDisplay_desktop_feature_div"
      ],
      referenceLabels: [
        "Typical Price",
        "List Price",
        "Was Price",
        "Bundle Was Price"
      ],
      referenceLabelSelectors: [
        ".a-size-small.aok-offscreen"
      ],
      currentPriceLabelSelector: "#apex-pricetopay-accessibility-label",
      currentPriceSelectors: [
        ".priceToPay",
        ".apexPriceToPay",
        ".a-price:not(.a-text-price)"
      ],
      pricePartSelectors: {
        hidden: ".a-offscreen, .aok-offscreen",
        symbol: ".a-price-symbol",
        whole: ".a-price-whole",
        fraction: ".a-price-fraction"
      }
    },
    variants: {
      rootSelector: "#twister-plus-inline-twister",
      fields: [
        {
          label: "Flavor Name",
          selector: "#inline-twister-expanded-dimension-text-flavor_name"
        },
        {
          label: "Size",
          selector: "#inline-twister-expanded-dimension-text-size_name"
        },
        {
          label: "Style",
          selector: "#inline-twister-expanded-dimension-text-style_name"
        }
      ]
    },
    image: {
      selectors: [
        "#landingImage",
        "#imgTagWrapperId img",
        "#main-image-container img",
        "#imageBlock img",
        "#altImages img"
      ],
      dynamicImageAttribute: "data-a-dynamic-image",
      fallbackPattern: /https?:\/\/[^"']*m\.media-amazon\.com\/images\/I\/[^"']+\.(?:jpg|jpeg|png|webp)/i
    },
    requiredFields: [
      ["sku", "SKU/ASIN"],
      ["brand", "Brand"],
      ["price", "Price"],
      ["variants", "Variants"],
      ["image", "Product Image"]
    ]
  };

  function extractAsin(config) {
    for (const selector of config.asin.inputSelectors) {
      const value = document.querySelector(selector)?.value?.trim();

      if (value && /^[A-Z0-9]{10}$/i.test(value)) {
        return value.toUpperCase();
      }
    }

    const bodyMatch = (document.body.innerText || "").match(config.asin.bodyPattern);

    if (bodyMatch?.[1]) {
      return bodyMatch[1].toUpperCase();
    }

    for (const pattern of config.urlPatterns) {
      const match = window.location.href.match(pattern);

      if (match?.[1]) {
        return match[1].toUpperCase();
      }
    }

    return "";
  }

  function getProductLink(config, asin) {
    if (asin) {
      return config.productUrlBase + asin;
    }

    const canonical = document.querySelector('link[rel="canonical"]')?.href || window.location.href;

    for (const pattern of config.urlPatterns) {
      const match = canonical.match(pattern);

      if (match?.[1]) {
        return config.productUrlBase + match[1].toUpperCase();
      }
    }

    return canonical;
  }

  function getBrand(config) {
    const directBrand = getTextFromSelectors(config.brand.selectors);

    if (directBrand) {
      return applyTextReplacements(directBrand, config.brand.cleanupPatterns);
    }

    return getBrandFromProductDetails(config);
  }

  function getBrandFromProductDetails(config) {
    const rows = queryAll(config.brand.tableRowSelectors);

    for (const row of rows) {
      const rowText = getNodeText(row);

      if (!/brand/i.test(rowText)) {
        continue;
      }

      const label = getNodeText(row.querySelector(config.brand.tableLabelSelectors))
        .replace(":", "")
        .toLowerCase();
      const value = getNodeText(row.querySelector(config.brand.tableValueSelectors));

      if (label === "brand" && value) {
        return value;
      }

      const match = rowText.match(/^Brand\s*[:\u200f\u200e]?\s*(.+)$/i);

      if (match?.[1]) {
        return cleanText(match[1]);
      }
    }

    return "";
  }

  function parseReferencePriceText(text, labels) {
    const clean = cleanText(text);

    for (const label of labels) {
      const labelPattern = escapeRegExp(label).replace(/\s+/g, "\\s+");
      const match = clean.match(
        new RegExp(`${labelPattern}\\s*:?\\s*[$€£¥₹]\\s*(\\d[\\d,]*(?:\\.\\d+)?)`, "i")
      );

      if (match?.[1]) {
        return parsePriceText(match[1]);
      }
    }

    return "";
  }

  function getPriceFromPriceElement(priceElement, selectors) {
    if (!priceElement) {
      return "";
    }

    const hiddenPrice = parsePriceText(
      priceElement.querySelector(selectors.hidden)?.textContent
    );

    if (hiddenPrice) {
      return hiddenPrice;
    }

    const symbol = getNodeText(priceElement.querySelector(selectors.symbol));
    const whole = getNodeText(priceElement.querySelector(selectors.whole))
      .replace(/[^\d,]/g, "");
    const fraction = getNodeText(priceElement.querySelector(selectors.fraction))
      .replace(/\D/g, "");

    if (!whole) {
      return "";
    }

    return parsePriceText(`${symbol || "$"}${whole}${fraction ? `.${fraction}` : ""}`);
  }

  function getPrice(config) {
    const priceRoot = queryOne(config.price.rootSelectors);

    if (!priceRoot) {
      return "";
    }

    return getReferencePrice(config, priceRoot) || getCurrentPrice(config, priceRoot);
  }

  function getReferencePrice(config, priceRoot) {
    const labels = config.price.referenceLabels;
    const offscreenLabels = queryAll(config.price.referenceLabelSelectors, priceRoot);

    for (const labelElement of offscreenLabels) {
      const price = parseReferencePriceText(getNodeHtmlOrText(labelElement), labels);

      if (price) {
        return price;
      }
    }

    return parseReferencePriceText(getNodeHtmlOrText(priceRoot), labels);
  }

  function getCurrentPrice(config, priceRoot) {
    const currentPriceLabel = priceRoot.querySelector(config.price.currentPriceLabelSelector);

    if (currentPriceLabel) {
      return parsePriceText(getNodeHtmlOrText(currentPriceLabel));
    }

    const priceElement = queryOne(config.price.currentPriceSelectors, priceRoot);

    return getPriceFromPriceElement(priceElement, config.price.pricePartSelectors);
  }

  function getVariants(config) {
    const root = document.querySelector(config.variants.rootSelector) || document;
    const variants = [];

    for (const field of config.variants.fields) {
      const value = getNodeText(root.querySelector(field.selector));

      if (value) {
        variants.push(`${field.label}: ${value}`);
      }
    }

    return variants.join("\n");
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

  function getProductImage(config) {
    for (const selector of config.image.selectors) {
      const image = document.querySelector(selector);

      if (!image) {
        continue;
      }

      const dynamicImage = getLargestImageFromDynamicImage(
        image.getAttribute(config.image.dynamicImageAttribute)
      );
      const imageUrl =
        image.getAttribute("data-old-hires") ||
        dynamicImage ||
        image.currentSrc ||
        image.src ||
        image.getAttribute("data-src");

      if (isValidImageUrl(imageUrl)) {
        return imageUrl;
      }
    }

    const match = document.documentElement.innerHTML.match(config.image.fallbackPattern);

    return match?.[0] ? match[0].replace(/\\u002F/g, "/") : "";
  }

  function scrapeAmazonProduct(config) {
    const asin = extractAsin(config);
    const data = {
      source: config.name,
      link: getProductLink(config, asin),
      sku: asin,
      asin,
      brand: getBrand(config),
      price: getPrice(config),
      variants: getVariants(config),
      image: getProductImage(config)
    };

    if (!data.sku) {
      return {
        ok: false,
        error: "Không nhận diện được trang chi tiết sản phẩm Amazon. Hãy mở trang sản phẩm dạng /dp/ASIN rồi thử lại."
      };
    }

    return {
      ok: true,
      data,
      warnings: buildWarnings(data, config.requiredFields)
    };
  }

  registry.registerScraper({
    id: "amazon",
    name: AMAZON_CONFIG.name,
    matches: location => AMAZON_CONFIG.hostPattern.test(location.hostname),
    scrape: () => scrapeAmazonProduct(AMAZON_CONFIG)
  });
})();
