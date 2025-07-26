// generate-sitemap.js
// Steavy Carter MLS Sitemap Generator
// Version: v1.3 – 2025-07-25 with Sold Log Cache

const fs = require('fs');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { XMLParser } = require('fast-xml-parser');

const today = new Date().toISOString().split('T')[0];
const SOLD_LOG_FILE = "sold-log.txt";

// ⏳ Load previously known sold URLs
const previouslySold = new Set(
  fs.existsSync(SOLD_LOG_FILE)
    ? fs.readFileSync(SOLD_LOG_FILE, "utf-8").split("\n").map(x => x.trim()).filter(Boolean)
    : []
);

(async () => {
  const parser = new XMLParser();
  const masterUrl = "https://www.steavycarter.com/sitemap.xml";
  const sitemapUrls = [];

  console.log(`🔍 Fetching main sitemap: ${masterUrl}`);
  const masterXml = (await axios.get(masterUrl)).data;
  const masterParsed = parser.parse(masterXml);

  const allSubUrls = masterParsed.sitemapindex?.sitemap?.map(s => s.loc) || [];
  console.log("📦 Sub-sitemaps found:", allSubUrls.length);

  // ✅ Use the first property sitemap we find (not just the first one in the list)
  const firstPropertySitemap = allSubUrls.find(url => url.includes("property-sitemap"));
  if (firstPropertySitemap) {
    console.log(`📄 Using property sitemap: ${firstPropertySitemap}`);
    sitemapUrls.push(firstPropertySitemap);
  } else {
    console.warn("🚫 No property sitemap found.");
  }

  const listingUrls = [];

  for (const sm of sitemapUrls) {
    console.log(`📥 Reading: ${sm}`);
    const xml = (await axios.get(sm)).data;
    const parsed = parser.parse(xml);
    const urls = parsed.urlset?.url?.map(u => u.loc) || [];
    listingUrls.push(...urls);
  }

  const entries = [];
  const maxListings = 100;
  const newSoldUrls = [];

  console.log(`💥 Total listing pages to process: ${Math.min(listingUrls.length, maxListings)}`);

  for (const url of listingUrls.slice(0, maxListings)) {
    if (previouslySold.has(url)) {
      console.log(`⏩ Skipped previously sold: ${url}`);
      continue;
    }

    try {
      console.log(`🔗 Visiting: ${url}`);
      const html = (await axios.get(url)).data;
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      // ⛔ Skip if it's a "sold" or 404-style page
      if (doc.querySelector('.error404')) {
        console.warn(`⛔ Skipped (404 sold page): ${url}`);
        newSoldUrls.push(url);
        continue;
      }

      const inputEl = doc.querySelector('.copy-url-in input');
      const imageEl = doc.querySelector('meta[property="og:image"]');
      const addressEl = doc.querySelector('h2.heading');

      const mlsUrl = inputEl?.value?.trim();
      let imgRaw = imageEl?.getAttribute('content')?.trim() || "";
      const img = imgRaw.split('?')[0]; // Remove size params like &fit=crop

      const address = addressEl?.textContent?.trim();

      if (mlsUrl && img && address) {
        console.log(`✅ Added: ${mlsUrl}`);
        entries.push(`
<url>
  <loc>${mlsUrl}</loc>
  <image:image>
    <image:loc>${img}</image:loc>
    <image:title>${address} | IDX Property | Steavy Carter Realtor</image:title>
  </image:image>
  <priority>0.9</priority>
  <changefreq>daily</changefreq>
  <lastmod>${today}</lastmod>
</url>`);
      } else {
        console.warn(`⚠️ Missing data for ${url}`);
      }
    } catch (err) {
      console.error(`❌ Failed on ${url}`, err.message);
    }
  }

  // 🧾 Build sitemap XML
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset 
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" 
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>`;

  fs.writeFileSync("mls-sitemap.xml", sitemapXml);
  console.log(`✅ Saved: mls-sitemap.xml with ${entries.length} entries`);

  // 📝 Append new sold URLs to log
  if (newSoldUrls.length > 0) {
    fs.appendFileSync(SOLD_LOG_FILE, newSoldUrls.join("\n") + "\n");
    console.log(`📁 Logged ${newSoldUrls.length} newly sold listings.`);
  }
})();
