// dev-seed.js — paste into the gallery tab's devtools console to load sample
// items so you can eyeball the layout without scraping live sites.
chrome.storage.local.set({ wishlist_items: [
  { id:'1', brand:'FACE ROCK', title:'floral graphic T-shirt', price:285, currency:'USD',
    category:'tops', image:'https://picsum.photos/seed/tee/600', url:'https://example.com/1' },
  { id:'2', brand:'RIMOWA', title:'Original Check-In M', price:1120.54, currency:'USD',
    category:'bags', image:'https://picsum.photos/seed/case/600', url:'https://example.com/2' },
  { id:'3', brand:'FACE ROCK', title:'back graphic T-shirt', price:120, currency:'USD',
    category:'tops', image:'https://picsum.photos/seed/whitetee/600', url:'https://example.com/3' },
  { id:'4', brand:'47 BRAND', title:'wool baseball cap', price:40, currency:'USD',
    category:'accessories', image:'https://picsum.photos/seed/cap/600', url:'https://example.com/4' },
]}, () => location.reload())
