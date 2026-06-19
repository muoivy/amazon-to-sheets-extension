const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const outputPath = path.join(rootDir, "config.json");

function parseEnv(content) {
  const result = {};

  content.split(/\r?\n/).forEach(line => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    // Remove optional surrounding quotes.
    value = value.replace(/^["']|["']$/g, "");

    result[key] = value;
  });

  return result;
}

if (!fs.existsSync(envPath)) {
  console.error("Không tìm thấy file .env.");
  console.error("Hãy copy .env.example thành .env rồi dán Web App URL thật.");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = parseEnv(envContent);

if (!env.GOOGLE_APPS_SCRIPT_WEB_APP_URL) {
  console.error("Thiếu GOOGLE_APPS_SCRIPT_WEB_APP_URL trong file .env.");
  process.exit(1);
}

const config = {
  GOOGLE_APPS_SCRIPT_WEB_APP_URL: env.GOOGLE_APPS_SCRIPT_WEB_APP_URL
};

fs.writeFileSync(outputPath, JSON.stringify(config, null, 2) + "\n", "utf8");

console.log("Đã tạo config.json thành công.");
console.log("Lưu ý: config.json đã nằm trong .gitignore, không commit file này lên Git.");
