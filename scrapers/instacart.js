(() => {
  const registry = window.ProductToSheetsScrapers;
  const {
    buildWarnings,
    cleanText,
    formatPriceForSheets,
    getTextFromSelectors,
    isValidImageUrl,
    parsePriceText
  } = registry.shared;

  const INSTACART_CONFIG = {
    name: "Instacart",
    hostPattern: /(^|\.)instacart\.com$/i,
    productPathPattern: /\/products\/(\d+)(?:-|\/|$)/i,
    priceSelectors: [
      "[data-testid='product-price']",
      "[aria-label*='current price' i]",
      "[class*='Price']"
    ],
    imageSelectors: [
      "main img[src*='product-image']",
      "img[src*='product-image']",
      "picture img"
    ],
    requiredFields: [
      ["sku", "SKU/Product ID"],
      ["brand", "Trademark"],
      ["price", "Cost"],
      ["variants", "Variants"],
      ["image", "Product Image"]
    ]
  };

  function getJsonLdProducts() {
    const products = [];
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));

    scripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent.trim());
        collectProducts(data, products);
      } catch (error) {
        // Ignore invalid structured data blocks.
      }
    });

    return products;
  }

  function collectProducts(value, products) {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(item => collectProducts(item, products));
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const type = value["@type"];
    const types = Array.isArray(type) ? type : [type];

    if (types.some(item => String(item).toLowerCase() === "product")) {
      products.push(value);
    }

    collectProducts(value["@graph"], products);
  }

  function extractProductIdFromUrl(url = window.location.href) {
    const match = url.match(INSTACART_CONFIG.productPathPattern);

    return match?.[1] || "";
  }

  function getProductLink() {
    const url = new URL(window.location.href);
    const productId = extractProductIdFromUrl(url.href);
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const link = canonical ? new URL(canonical) : new URL(url.origin + url.pathname);

    if (productId && !extractProductIdFromUrl(link.href)) {
      link.pathname = `/products/${productId}`;
    }

    const retailerSlug = url.searchParams.get("retailerSlug");
    link.search = "";

    if (retailerSlug) {
      link.searchParams.set("retailerSlug", retailerSlug);
    }

    return link.href;
  }

  function getFirstProductImage(product) {
    const image = product?.image;
    const imageUrl = Array.isArray(image) ? image[0] : image;

    if (isValidImageUrl(imageUrl)) {
      return imageUrl;
    }

    for (const selector of INSTACART_CONFIG.imageSelectors) {
      const element = document.querySelector(selector);
      const src = element?.currentSrc || element?.src || element?.getAttribute("data-src");

      if (isValidImageUrl(src)) {
        return src;
      }
    }

    return "";
  }

  function getBrand(product) {
    const brand = product?.brand;

    if (typeof brand === "string") {
      return cleanText(brand);
    }

    if (brand?.name) {
      return cleanText(brand.name);
    }

    const html = decodeHtml(document.documentElement.innerHTML);
    const match = html.match(/"brandName"\s*:\s*"([^"]+)"/i);

    return match?.[1] ? toDisplayName(match[1]) : "";
  }

  function getPrice(product, sku) {
    const purchaseCardPrice = getPriceFromPurchaseCard();

    if (purchaseCardPrice) {
      return purchaseCardPrice;
    }

    const html = decodeHtml(document.documentElement.innerHTML);
    const productPriceText = getProductScopedPriceText(html, sku);
    const originalPrice = getOriginalPrice(productPriceText);

    if (originalPrice) {
      return originalPrice;
    }

    const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;

    if (offer?.price) {
      const price = Number(String(offer.price).replace(/,/g, ""));

      if (Number.isFinite(price)) {
        return formatPriceForSheets(price);
      }
    }

    const appStatePrice = productPriceText.match(/"price"\s*:\s*"\$(\d[\d,]*(?:\.\d+)?)"/i) ||
      productPriceText.match(/"priceString"\s*:\s*"\$(\d[\d,]*(?:\.\d+)?)"/i);

    if (appStatePrice?.[1]) {
      return parsePriceText(appStatePrice[1]);
    }

    return parsePriceText(getTextFromSelectors(INSTACART_CONFIG.priceSelectors));
  }

  function getPriceFromPurchaseCard() {
    const addToCartElement = findAddToCartElement();

    if (!addToCartElement) {
      return "";
    }

    let node = addToCartElement.parentElement;

    for (let depth = 0; node && depth < 10; depth++) {
      const text = cleanText(node.textContent || "");
      const price = getPreferredPriceFromText(text);

      if (price) {
        return price;
      }

      node = node.parentElement;
    }

    return "";
  }

  function findAddToCartElement() {
    const candidates = Array.from(document.querySelectorAll("button, [role='button']"));

    return candidates.find(element => /add\s+to\s+cart/i.test(cleanText(element.textContent || ""))) || null;
  }

  function getPreferredPriceFromText(text) {
    if (!text || !/\$\d/.test(text)) {
      return "";
    }

    const originalPrice =
      text.match(/Original\s+price\s*:\s*\$(\d[\d,]*(?:\.\d+)?)/i) ||
      text.match(/\breg\.\s*\$(\d[\d,]*(?:\.\d+)?)/i);

    if (originalPrice?.[1]) {
      return parsePriceText(originalPrice[1]);
    }

    const currentPrice =
      text.match(/Current\s+price\s*:\s*\$(\d[\d,]*(?:\.\d+)?)/i) ||
      text.match(/\$(\d[\d,]*(?:\.\d+)?)/);

    return currentPrice?.[1] ? parsePriceText(currentPrice[1]) : "";
  }

  function getOriginalPrice(html) {
    const patterns = [
      /"plainFullPriceString"\s*:\s*"\$(\d[\d,]*(?:\.\d+)?)/i,
      /"fullPriceScreenReaderString"\s*:\s*"Original Price:\s*\$(\d[\d,]*(?:\.\d+)?)/i,
      /"priceAriaLabelString"\s*:\s*"[^"]*Original price:\s*\$(\d[\d,]*(?:\.\d+)?)/i,
      /Original price:\s*\$(\d[\d,]*(?:\.\d+)?)/i,
      /"fullPriceString"\s*:\s*"(?:reg\.\s*)?\$(\d[\d,]*(?:\.\d+)?)/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        return parsePriceText(match[1]);
      }
    }

    return "";
  }

  function getProductScopedPriceText(html, sku) {
    if (!sku) {
      return html;
    }

    const escapedSku = escapeRegExp(sku);
    const anchors = [
      new RegExp(`"itemId"\\s*:\\s*"items_\\d+-${escapedSku}"`, "i"),
      new RegExp(`"id"\\s*:\\s*"items_\\d+-${escapedSku}"`, "i"),
      new RegExp(`"product_id"\\s*:\\s*"${escapedSku}"`, "i"),
      new RegExp(`"productId"\\s*:\\s*"${escapedSku}"`, "i")
    ];
    const chunks = [];

    for (const anchor of anchors) {
      const match = anchor.exec(html);

      if (!match) {
        continue;
      }

      const start = Math.max(0, match.index - 8000);
      const end = Math.min(html.length, match.index + 24000);
      chunks.push(html.slice(start, end));
    }

    if (chunks.length === 0) {
      return html;
    }

    return chunks.join("\n");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getVariants(product) {
    const variants = [];
    const size = cleanText(product?.size || "");
    const html = decodeHtml(document.documentElement.innerHTML);
    const variantDimensions = html.match(/"variantDimensionsString"\s*:\s*"([^"]+)"/i);

    if (size) {
      variants.push(`Size: ${size}`);
    }

    if (variantDimensions?.[1]) {
      variants.push(`Variant: ${cleanText(variantDimensions[1])}`);
    }

    return Array.from(new Set(variants)).join("\n");
  }

  function decodeHtml(value) {
    const text = String(value || "");

    try {
      return decodeURIComponent(text.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
    } catch (error) {
      return text;
    }
  }

  function toDisplayName(value) {
    return cleanText(value)
      .split(/\s+/)
      .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : "")
      .join(" ");
  }

  function scrapeInstacartProduct(config) {
    const product = getJsonLdProducts()[0] || {};
    const sku = extractProductIdFromUrl();
    const data = {
      source: config.name,
      link: getProductLink(),
      sku,
      brand: getBrand(product),
      price: getPrice(product, sku),
      variants: getVariants(product),
      image: getFirstProductImage(product)
    };

    if (!data.sku) {
      return {
        ok: false,
        error: "Không nhận diện được trang chi tiết sản phẩm Instacart. Hãy mở trang sản phẩm dạng /products/PRODUCT_ID rồi thử lại."
      };
    }

    return {
      ok: true,
      data,
      warnings: buildWarnings(data, config.requiredFields)
    };
  }

  registry.registerScraper({
    id: "instacart",
    name: INSTACART_CONFIG.name,
    matches: location =>
      INSTACART_CONFIG.hostPattern.test(location.hostname) &&
      INSTACART_CONFIG.productPathPattern.test(location.pathname),
    scrape: () => scrapeInstacartProduct(INSTACART_CONFIG)
  });
})();
