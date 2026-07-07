import { renderCollection, showToast, saveActiveTab, getItems } from './src/view.js'

const els = {
  count: document.getElementById('count'),
  total: document.getElementById('total'),
  tabs: document.getElementById('tabs'),
  grid: document.getElementById('grid'),
  toast: document.getElementById('toast'),
}
const saveBtn = document.getElementById('save')

saveBtn.onclick = async () => {
  saveBtn.disabled = true
  saveBtn.textContent = 'Saving…'
  try {
    const { added, items } = await saveActiveTab()
    renderCollection(els, items)
    showToast(els.toast, added ? 'Saved ✓' : 'Already saved')
  } catch (err) {
    console.error(err)
    showToast(els.toast, 'Could not read this page')
  } finally {
    saveBtn.disabled = false
    saveBtn.textContent = 'Save this page'
  }
}

document.getElementById('open-gallery').onclick = () =>
  chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') })

getItems().then((items) => renderCollection(els, items))
