// online-sktorrent-stream-addon.js
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const builder = addonBuilder({
  id: "online.sktorrent",
  name: "Online SK Torrent",
  version: "1.0.0",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"]
});

const commonHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};

function removeDiacritics(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function decode(str) {
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  } catch {
    return str;
  }
}

function formatName(fullTitle, flagsArray) {
  // Implementation here
  return fullTitle;
}

async function getTitleFromIMDb(imdbId) {
  try {
    const url = `https://www.imdb.com/title/${imdbId}/`;
    console.log(`[DEBUG] 🌐 IMDb Request: ${url}`);
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const res = await axios.get(url, { 
      headers: commonHeaders,
      timeout: 10000
    });

    if (res.status === 404) {
      console.error("[ERROR] IMDb page not found (404)");
      return null;
    }

    const $ = cheerio.load(res.data);
    
    // Method 1: Try JSON-LD data first (most reliable)
    let originalTitle = null;
    let title = null;
    
    const ldJsonScript = $('script[type="application/ld+json"]').first().html();
    if (ldJsonScript) {
      try {
        const json = JSON.parse(ldJsonScript);
        if (json.name) {
          originalTitle = decode(json.name.trim());
          console.log(`[DEBUG] Found title from JSON-LD: ${originalTitle}`);
        }
      } catch (e) {
        console.log(`[DEBUG] JSON-LD parse error: ${e.message}`);
      }
    }
    
    // Method 2: Try meta tags
    if (!title) {
      const metaTitle = $('meta[property="og:title"]').attr('content');
      if (metaTitle) {
        title = decode(metaTitle.trim());
        console.log(`[DEBUG] Found title from OG meta: ${title}`);
      }
    }
    
    // Method 3: Try title tag as fallback
    if (!title) {
      const titleText = $('title').text();
      if (titleText) {
        // IMDb title format: "Movie Title (2024) - IMDb"
        title = decode(titleText.split(' - ')[0].trim());
        console.log(`[DEBUG] Found title from title tag: ${title}`);
      }
    }
    
    // Method 4: Try h1 element
    if (!title) {
      const h1Title = $('h1').first().text();
      if (h1Title) {
        title = decode(h1Title.trim());
        console.log(`[DEBUG] Found title from h1: ${title}`);
      }
    }
    
    console.log(`[DEBUG] 🎬 Final title: ${title}, original: ${originalTitle || title}`);
    
    if (!title && !originalTitle) {
      console.error("[ERROR] Could not extract title from IMDb page");
      console.log(`[DEBUG] Page snippet: ${res.data.slice(0, 500)}`);
      return null;
    }
    
    return { 
      title: title || originalTitle, 
      originalTitle: originalTitle || title 
    };
    
  } catch (err) {
    console.error("[ERROR] IMDb scraping failed:", err.message);
    if (err.response) {
      console.error(`[ERROR] Status: ${err.response.status}`);
      console.error(`[ERROR] Headers:`, err.response.headers);
    }
    return null;
  }
}

async function searchOnlineVideos(query) {
  const searchUrl = `https://online.sktorrent.eu/search/videos?search_query=${encodeURIComponent(query)}`;
  console.log(`[INFO] 🔍 Searching '${query}' on ${searchUrl}`);
  
  try {
    const res = await axios.get(searchUrl, { 
      headers: commonHeaders,
      timeout: 15000
    });
    
    console.log(`[DEBUG] Status: ${res.status}`);
    
    const $ = cheerio.load(res.data);
    const links = [];
    
    $("a[href^='/video/']").each((i, el) => {
      const href = $(el).attr('href');
      const match = href.match(/\/video\/(\d+)/);
      if (match) links.push(match[1]);
    });
    
    // Alternative selector if the above doesn't work
    if (links.length === 0) {
      $("a[href*='/video/']").each((i, el) => {
        const href = $(el).attr('href');
        const match = href.match(/\/video\/(\d+)/);
        if (match && !links.includes(match[1])) links.push(match[1]);
      });
    }
    
    console.log(`[INFO] 📺 Found videos: ${links.length}`);
    return links;
    
  } catch (err) {
    console.error("[ERROR] Search failed:", err.message);
    if (err.response) {
      console.error(`[ERROR] Status: ${err.response.status}`);
    }
    return [];
  }
}

async function extractStreamsFromVideoId(videoId) {
  const url = `https://online.sktorrent.eu/video/${videoId}`;
  console.log(`[DEBUG] 🔎 Loading video details: ${url}`);
  
  try {
    const res = await axios.get(url, { 
      headers: commonHeaders,
      timeout: 15000
    });
    
    console.log(`[DEBUG] Status: ${res.status}`);
    
    const $ = cheerio.load(res.data);
    const streams = [];
    
    // Look for video sources
    $('video source').each((i, el) => {
      const src = $(el).attr('src');
      const type = $(el).attr('type');
      if (src) {
        streams.push({
          url: src,
          quality: type === 'video/mp4' ? 'HD' : 'SD'
        });
      }
    });
    
    // Also check for direct video tags
    $('video').each((i, el) => {
      const src = $(el).attr('src');
      if (src && !streams.find(s => s.url === src)) {
        streams.push({
          url: src,
          quality: 'Auto'
        });
      }
    });
    
    // Extract title for debugging
    const titleText = $('title').text().trim();
    console.log(`[DEBUG] Video title: ${titleText}`);
    console.log(`[INFO] Found ${streams.length} streams for video ${videoId}`);
    
    return streams;
    
  } catch (err) {
    console.error(`[ERROR] Failed to extract streams for video ${videoId}:`, err.message);
    return [];
  }
}

builder.defineStreamHandler(async (args) => {
  const { id, type } = args;
  console.log(`[INFO] Stream request: ${type} ${id}`);
  
  const imdbInfo = await getTitleFromIMDb(id);
  
  if (!imdbInfo || !imdbInfo.title) {
    console.log(`[WARN] Could not get title for ${id}, using ID as fallback`);
  }
  
  const searchQuery = imdbInfo?.title || id;
  console.log(`[INFO] Searching for: ${searchQuery}`);
  
  const videoIds = await searchOnlineVideos(searchQuery);
  
  if (videoIds.length === 0) {
    // Try search with original title if available
    if (imdbInfo?.originalTitle && imdbInfo.originalTitle !== searchQuery) {
      console.log(`[INFO] Retrying with original title: ${imdbInfo.originalTitle}`);
      const retryVideoIds = await searchOnlineVideos(imdbInfo.originalTitle);
      videoIds.push(...retryVideoIds);
    }
  }
  
  const streams = [];
  
  for (const videoId of videoIds.slice(0, 5)) { // Limit to first 5 results
    const videoStreams = await extractStreamsFromVideoId(videoId);
    
    for (const stream of videoStreams) {
      streams.push({
        title: `Online SK Torrent - ${imdbInfo?.title || 'Video'}`,
        url: stream.url,
        quality: stream.quality
      });
    }
  }
  
  console.log(`[INFO] Returning ${streams.length} streams`);
  
  return { streams };
});

// Export the serveHTTP function
module.exports = serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });

console.log("Addon starting on port", process.env.PORT || 7000);
