export const CATEGORIES = ['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories']

// Checked in this order; first category with a keyword hit wins.
// Order matters: shoes & bags before outerwear/tops so "rain boots", "tote bag" win.
const RULES = [
  ['shoes', ['sneaker', 'boot', 'heel', 'loafer', 'sandal', 'shoe', 'trainer', 'pump', 'mule', 'clog', 'derby', 'oxford', 'espadrille']],
  ['bags', ['bag', 'tote', 'backpack', 'suitcase', 'luggage', 'clutch', 'purse', 'satchel', 'duffle', 'duffel', 'crossbody', 'check-in', 'carry-on']],
  ['outerwear', ['coat', 'jacket', 'parka', 'blazer', 'puffer', 'overcoat', 'trench', 'anorak', 'windbreaker', 'cardigan', 'vest']],
  ['bottoms', ['jean', 'trouser', 'pant', 'short', 'skirt', 'legging', 'chino', 'jogger', 'slack', 'culotte']],
  ['tops', ['shirt', 't-shirt', 'tee', 'top', 'blouse', 'sweater', 'sweatshirt', 'hoodie', 'knit', 'polo', 'tank', 'jersey', 'turtleneck']],
  ['accessories', ['cap', 'hat', 'beanie', 'scarf', 'belt', 'glove', 'sunglass', 'watch', 'jewelry', 'necklace', 'ring', 'earring', 'sock', 'wallet', 'tie']],
]

export function classify(text) {
  const t = (text || '').toLowerCase()
  for (const [category, keywords] of RULES) {
    if (keywords.some((k) => t.includes(k))) return category
  }
  return 'accessories'
}
