(() => {
  const namespace = window.ProductToSheetsScrapers || {
    scrapers: []
  };

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\u200e/g, "")
      .trim();
  }

  function getNodeText(node) {
    return cleanText(node?.textContent || "");
  }

  function getNodeHtmlOrText(node) {
    return cleanText(node?.innerHTML || node?.textContent || "");
  }

  function queryOne(selectors, root = document) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];

    for (const selector of selectorList) {
      const element = root.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return null;
  }

  function queryAll(selectors, root = document) {
    return (Array.isArray(selectors) ? selectors : [selectors])
      .flatMap(selector => Array.from(root.querySelectorAll(selector)));
  }

  function getTextFromSelectors(selectors, root = document) {
    for (const selector of selectors) {
      const text = getNodeText(root.querySelector(selector));

      if (text) {
        return text;
      }
    }

    return "";
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function applyTextReplacements(value, replacements) {
    return replacements.reduce(
      (text, [pattern, replacement]) => text.replace(pattern, replacement),
      value
    ).trim();
  }

  function parsePriceAmount(text) {
    const clean = cleanText(text);
    const match =
      clean.match(/[$€£¥₹]\s*(\d[\d,]*(?:\.\d+)?)/) ||
      clean.match(/\b(\d[\d,]*(?:\.\d+)?)\s*(?:USD|EUR|GBP|JPY|CAD|AUD)\b/i) ||
      clean.match(/\b(\d[\d,]*(?:\.\d+)?)\b/);

    if (!match) {
      return null;
    }

    const amount = Number(match[1].replace(/,/g, ""));

    return Number.isFinite(amount) ? amount : null;
  }

  function formatPriceForSheets(price) {
    if (!Number.isFinite(price)) {
      return "";
    }

    return (Math.round(price * 100) / 100).toFixed(2);
  }

  function parsePriceText(text) {
    const amount = parsePriceAmount(text);

    return amount === null ? "" : formatPriceForSheets(amount);
  }

  function buildWarnings(data, requiredFields) {
    return requiredFields
      .filter(([field]) => !data[field])
      .map(([, label]) => label);
  }

  function isValidImageUrl(url) {
    return Boolean(url && /^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url));
  }

  function registerScraper(scraper) {
    const existingIndex = namespace.scrapers.findIndex(item => item.id === scraper.id);

    if (existingIndex >= 0) {
      namespace.scrapers[existingIndex] = scraper;
      return;
    }

    namespace.scrapers.push(scraper);
  }

  namespace.shared = {
    applyTextReplacements,
    buildWarnings,
    cleanText,
    escapeRegExp,
    formatPriceForSheets,
    getNodeHtmlOrText,
    getNodeText,
    getTextFromSelectors,
    isValidImageUrl,
    parsePriceAmount,
    parsePriceText,
    queryAll,
    queryOne
  };
  namespace.registerScraper = registerScraper;

  window.ProductToSheetsScrapers = namespace;
})();
