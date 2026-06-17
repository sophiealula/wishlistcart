import { renderCollection, showToast, saveActiveTab, getItems } from './src/view.js'

const els = {
  count: document.getElementById('count'),
  total: document.getElementById('total'),
  tabs: document.getElementById('tabs'),
  grid: document.getElementById('grid'),
}
const toast = document.getElementById('toast')

document.getElementById('fab').onclick = async () => {
  try {
    const { added, items } = await saveActiveTab()
    renderCollection(els, items)
    showToast(toast, added ? 'Saved ✓' : 'Already saved')
  } catch {
    showToast(toast, 'Open a product tab, then hit +')
  }
}

getItems().then((items) => renderCollection(els, items))

// Live-refresh if the popup saves something while this tab is open.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.wishlist_items) renderCollection(els, changes.wishlist_items.newValue || [])
})
