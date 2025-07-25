// generate-daily-sitemap.js
// Steavy Carter MLS Sitemap Generator
// Version: v1.4 – 2025-07-25
// Updates:
// - Fixed 100 limit -> 200
// - Summary counts for added/skipped
// - Proper sitemap-new.xml generation

const fs = require('fs');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const { XMLParser } = require('fast-xml-parser');

const today = new Date().toISOString().split('T')[0];
const NEW_LISTING_MAX_AGE_HOURS = 72;

// Load previously discovered properties
const known = fs.existsSync('visited-properties.json')
  ? JSON.parse(fs.readFileSync('visited-properties.json', 'utf-8'))
  : {};

const newlyDiscovered = [];

(async () => {
  const parser = new XMLParser();
  const masterUrl = "https://www.steavycarter.com/sitemap.xml";
  const sitemapUrls = [];

  console.log(`🔍 Fetching main sitemap: ${masterUrl}`);
  const masterXml = (await axios.get(masterUrl)).data;
  const masterParsed = parser.parse(masterXml);

  const allSubUrls = masterParsed.sitemapindex?.sitemap?.map(s => s.loc) || [];
  console.log("📦 Sub-sitemaps found:", allSubUrls.length);

  const propertySitemaps = allSubUrls.filter(url => url.includes("property-sitemap")).slice(0, 3);
  sitemapUrls.push(...propertySitemaps);

  const listingUrls = [];

  for (const sm of sitemapUrls) {
    console.log(`📥 Reading: ${sm}`);
    const xml = (await axios.get(sm)).data;
    const parsed = parser.parse(xml);
    const urls = parsed.urlset?.url?.map(u => u.loc) || [];
    listingUrls.push(...urls);
  }

  const entries = [];
  let skipped = 0;
  let added = 0;

  console.log(`💥 Processing up to 200 properties`);
  for (const url of listingUrls.slice(0, 200)) {
    if (known[url]) {
      skipped++;
      continue;
    }

    try {
      console.log(`🔗 Visiting: ${url}`);
      const html = (await axios.get(url)).data;
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      if (doc.querySelector('.error404')) {
        console.warn(`⛔ Skipped (404): ${url}`);
        continue;
      }

      const inputEl = doc.querySelector('.copy-url-in input');
      const imageEl = doc.querySelector('meta[property="og:image"]');
      const addressEl = doc.querySelector('h2.heading');

      const mlsUrl = inputEl?.value?.trim();
      const img = imageEl?.getAttribute('content')?.split('&')[0];
      const address = addressEl?.textContent?.trim().replace(/&/g, 'and');

      if (mlsUrl && img && address) {
        console.log(`✅ Added new: ${mlsUrl}`);
        const discoveredAt = new Date().toISOString();

        newlyDiscovered.push({ mlsUrl, img, address, discoveredAt });
        known[url] = { discoveredAt };

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
        added++;
      } else {
        console.warn(`⚠️ Missing data for ${url}`);
      }
    } catch (err) {
      console.error(`❌ Error on ${url}`, err.message);
    }
  }

  // Write full sitemap
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset 
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" 
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>`;
  fs.writeFileSync("mls-sitemap.xml", sitemapXml);
  console.log(`🗺️ mls-sitemap.xml saved with ${entries.length} entries`);

  // Save known & new listings
  fs.writeFileSync("visited-properties.json", JSON.stringify(known, null, 2));
  fs.writeFileSync("new-properties.json", JSON.stringify(newlyDiscovered, null, 2));
  console.log(`📝 Saved visited-properties.json and new-properties.json`);

  // Generate sitemap-new.xml (only listings discovered in last 72 hrs)
  const cutoffTime = Date.now() - NEW_LISTING_MAX_AGE_HOURS * 60 * 60 * 1000;
  const fresh = newlyDiscovered.filter(entry => new Date(entry.discoveredAt).getTime() >= cutoffTime);

  const freshXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset 
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" 
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${fresh.map(entry => `
<url>
  <loc>${entry.mlsUrl}</loc>
  <image:image>
    <image:loc>${entry.img}</image:loc>
    <image:title>${entry.address} | New MLS Listing | Steavy Carter</image:title>
  </image:image>
  <priority>1.0</priority>
  <changefreq>hourly</changefreq>
  <lastmod>${today}</lastmod>
</url>`).join('\n')}
</urlset>`;

  fs.writeFileSync("sitemap-new.xml", freshXml);
  console.log(`🚀 sitemap-new.xml saved with ${fresh.length} new entries`);

  // Final summary
  console.log(`✅ DONE:`);
  console.log(`🆕 New listings added: ${added}`);
  console.log(`⏩ Skipped (already known): ${skipped}`);
  console.log(`📊 Total attempted: ${listingUrls.slice(0, 200).length}`);
})();
