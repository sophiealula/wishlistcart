// Minimal: the popup/gallery drive scraping directly via chrome.scripting from
// their own context, so background only needs to exist to register the MV3
// service worker. Kept as a no-op listener so Safari keeps it registered.
chrome.runtime.onInstalled.addListener(() => {})
