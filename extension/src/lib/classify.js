export const CATEGORIES = ['tops', 'bottoms', 'outerwear', 'shoes', 'bags', 'accessories']

// Checked in this order; first category with a keyword hit wins.
// Order matters: shoes & bags before outerwear/tops so "rain boots", "tote bag" win.
const RULES = [
  ['shoes', ['sneaker', 'sneakers', 'boot', 'boots', 'bootie', 'booties', 'heel', 'heels', 'loafer', 'loafers', 'sandal', 'sandals', 'shoe', 'shoes', 'trainer', 'trainers', 'pump', 'pumps', 'mule', 'mules', 'clog', 'clogs', 'derby', 'oxford', 'oxfords', 'espadrille', 'espadrilles']],
  ['bags', ['bag', 'bags', 'tote', 'totes', 'backpack', 'backpacks', 'suitcase', 'luggage', 'clutch', 'purse', 'satchel', 'duffle', 'duffel', 'crossbody', 'check-in', 'carry-on']],
  ['outerwear', ['coat', 'coats', 'jacket', 'jackets', 'parka', 'parkas', 'blazer', 'blazers', 'puffer', 'overcoat', 'topcoat', 'trench', 'anorak', 'windbreaker', 'cardigan', 'cardigans', 'vest', 'vests']],
  ['bottoms', ['jean', 'jeans', 'trouser', 'trousers', 'pant', 'pants', 'shorts', 'skirt', 'skirts', 'legging', 'leggings', 'chino', 'chinos', 'jogger', 'joggers', 'slacks', 'culotte', 'culottes', 'sweatpants']],
  ['tops', ['shirt', 'shirts', 't-shirt', 't-shirts', 'tee', 'tees', 'top', 'tops', 'blouse', 'blouses', 'sweater', 'sweaters', 'sweatshirt', 'hoodie', 'hoodies', 'knit', 'polo', 'polos', 'tank', 'jersey', 'turtleneck', 'henley', 'henleys', 'camisole']],
  ['accessories', ['cap', 'caps', 'hat', 'hats', 'beanie', 'scarf', 'scarves', 'belt', 'belts', 'glove', 'gloves', 'sunglasses', 'watch', 'watches', 'jewelry', 'necklace', 'ring', 'rings', 'earring', 'earrings', 'sock', 'socks', 'wallet', 'wallets', 'tie', 'ties']],
]

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function classify(text) {
  const t = (text || '').toLowerCase()
  for (const [category, keywords] of RULES) {
    for (const k of keywords) {
      if (new RegExp(`\\b${escape(k)}\\b`).test(t)) return category
    }
  }
  return 'accessories'
}
