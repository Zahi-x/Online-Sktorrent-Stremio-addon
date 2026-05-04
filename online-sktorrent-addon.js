// online-sktorrent-stream-addon.js
// online-sktorrent-addon.js
// Note: Use Node.js v20.09 LTS for testing (https://nodejs.org/en/blog/release/v20.9.0)
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
@@ -19,6 +19,11 @@ const builder = addonBuilder({
idPrefixes: ["tt"]
});

const commonHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36',
    'Accept-Encoding': 'identity'
};

function removeDiacritics(str) {
return str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
@@ -63,13 +68,14 @@ function formatName(fullTitle, flagsArray) {
async function getTitleFromIMDb(imdbId) {
try {
const url = `https://www.imdb.com/title/${imdbId}/`;
        console.log(`[DEBUG] 🌐 IMDb Request: ${url}`);
        
        // Add a delay to avoid being blocked
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const res = await axios.get(url, { 
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br"
            }
        });

if (res.status === 404) {
console.error("[ERROR] IMDb scraping zlyhal: stránka neexistuje (404)");
return null;
}

const $ = cheerio.load(res.data);

// Try multiple methods to get the title
let title = null;
let originalTitle = null;

// Method 1: Try JSON-LD first (most reliable)
const ldJson = $('script[type="application/ld+json"]').first().html();
if (ldJson) {
    try {
        const json = JSON.parse(ldJson);
        if (json.name) {
            originalTitle = decode(json.name.trim());
            console.log(`[DEBUG] Found from JSON-LD: ${originalTitle}`);
        }
    } catch(e) {}
}

// Method 2: Try meta tags
if (!title) {
    const metaTitle = $('meta[property="og:title"]').attr('content');
    if (metaTitle) {
        title = decode(metaTitle.split('(')[0].trim());
        console.log(`[DEBUG] Found from meta: ${title}`);
    }
}

// Method 3: Try title tag as fallback
if (!title) {
    const titleText = $('title').text();
    if (titleText) {
        title = decode(titleText.split(' - ')[0].trim());
        console.log(`[DEBUG] Found from title tag: ${title}`);
    }
}

console.log(`[DEBUG] 🎬 Lokalizovaný názov: ${title}`);
console.log(`[DEBUG] 🌐 Originálny názov: ${originalTitle}`);

return { title, originalTitle };
} catch (err) {
console.error("[ERROR] IMDb scraping zlyhal:", err.message);
return null;
}
}

const $ = cheerio.load(res.data);
const titleRaw = $('title').text().split(' - ')[0].trim();
const title = decode(titleRaw);
@@ -79,8 +85,8 @@ async function getTitleFromIMDb(imdbId) {
const json = JSON.parse(ldJson);
if (json && json.name) originalTitle = decode(json.name.trim());
}
        console.log(`[DEBUG] 🎬 Lokalizovaný názov: ${title}`);
        console.log(`[DEBUG] 🌐 Originálny názov: ${originalTitle}`);

        console.log(`[DEBUG] 🎬 IMDb title: ${title}, original: ${originalTitle}`);
return { title, originalTitle };
} catch (err) {
console.error("[ERROR] IMDb scraping zlyhal:", err.message);
@@ -92,7 +98,10 @@ async function searchOnlineVideos(query) {
const searchUrl = `https://online.sktorrent.eu/search/videos?search_query=${encodeURIComponent(query)}`;
console.log(`[INFO] 🔍 Hľadám '${query}' na ${searchUrl}`);
try {
        const res = await axios.get(searchUrl, { headers: { 'Accept-Encoding': 'identity' } });
        const res = await axios.get(searchUrl, { headers: commonHeaders });
        console.log(`[DEBUG] Status: ${res.status}`);
        console.log(`[DEBUG] HTML Snippet:`, res.data.slice(0, 300));

const $ = cheerio.load(res.data);
const links = [];
$("a[href^='/video/']").each((i, el) => {
@@ -102,6 +111,7 @@ async function searchOnlineVideos(query) {
if (match) links.push(match[1]);
}
});

console.log(`[INFO] 📺 Nájdených videí: ${links.length}`);
return links;
} catch (err) {
@@ -114,7 +124,10 @@ async function extractStreamsFromVideoId(videoId) {
const url = `https://online.sktorrent.eu/video/${videoId}`;
console.log(`[DEBUG] 🔎 Načítavam detaily videa: ${url}`);
try {
        const res = await axios.get(url, { headers: { 'Accept-Encoding': 'identity' } });
        const res = await axios.get(url, { headers: commonHeaders });
        console.log(`[DEBUG] Status: ${res.status}`);
        console.log(`[DEBUG] Detail HTML Snippet:`, res.data.slice(0, 300));

const $ = cheerio.load(res.data);
const sourceTags = $('video source');
const titleText = $('title').text().trim();
