// getMoodGain(characterId) で、キャラごとに効果が変わるアイテムに対応
export const SHOP_ITEMS = [
  { id: 'flower',   name: 'お花',           emoji: '🌸', price:  30,
    getMoodGain: ()    => 8,                               hungerGain:  0 },
  { id: 'milk',     name: 'ミルク',         emoji: '🍼', price:  40,
    getMoodGain: ()    => 5,                               hungerGain:  5 },
  { id: 'cookie',   name: 'クッキー',       emoji: '🍪', price:  60,
    getMoodGain: ()    => 10,                              hungerGain: 12 },
  { id: 'toy',      name: 'おもちゃ',       emoji: '🧸', price:  80,
    getMoodGain: ()    => 15,                              hungerGain:  0 },
  { id: 'ribbon',   name: 'リボン',         emoji: '🎀', price: 100,
    getMoodGain: (id)  => 18,                              hungerGain:  0 },
  { id: 'cake',     name: 'ケーキ',         emoji: '🎂', price: 120,
    getMoodGain: ()    => 14,                              hungerGain: 20 },
  { id: 'pepper',   name: 'とうがらし',     emoji: '🌶️', price:  80,
    getMoodGain: (id)  => 20,                              hungerGain:  5 },
  { id: 'cinnamon', name: 'シナモンロール', emoji: '🍩', price: 200,
    getMoodGain: ()    => 25,                              hungerGain: 22 },
];

// getPlayerCharacter: () => runtime | null
// onPurchase: (item, ch, moodDelta) => void
// onClose: () => void
export function setupShop({ getPlayerCharacter, onPurchase, onClose, onInsufficientFunds }) {
  const panel    = document.getElementById('shop-panel');
  const openBtn  = document.getElementById('shop-btn');
  const closeBtn = document.getElementById('shop-close');
  const itemsEl  = document.getElementById('shop-items');
  const coinsEl  = document.getElementById('shop-coins-value');

  function render() {
    const ch = getPlayerCharacter();
    if (!ch) return;

    coinsEl.textContent = ch.coins;
    itemsEl.innerHTML = '';

    SHOP_ITEMS.forEach((item) => {
      const owned = Math.min(ch.items.filter(i => i === item.id).length, 99);
      const isFav = item.id === ch.def.favorite;

      const card = document.createElement('div');
      card.className = 'shop-item' + (isFav ? ' shop-item-special' : '');
      card.innerHTML = `
        <div class="item-emoji-wrap">
          <span class="item-emoji">${item.emoji}</span>
          ${owned > 0 ? `<span class="item-badge">${owned}</span>` : ''}
        </div>
        <div class="item-name">${item.name}${isFav ? ' <span class="star-badge">★</span>' : ''}</div>
        <div class="item-price">${item.price}円</div>
        <button class="buy-btn" type="button">購入</button>
      `;
      card.querySelector('.buy-btn').addEventListener('click', () => {
        const c = getPlayerCharacter();
        if (!c) return;
        if (c.coins < item.price) { onInsufficientFunds?.(); return; }
        if (c.items.filter(i => i === item.id).length >= 99) return;
        const favMult = item.id === c.def.favorite ? 2 : item.id === c.def.dislike ? -1 : 1;
        const delta  = item.getMoodGain(c.def.id) * favMult;
        c.coins  -= item.price;
        c.mood    = Math.max(0, Math.min(100, c.mood + delta));
        c.hunger  = Math.min(100, c.hunger + item.hungerGain);
        c.items.push(item.id);
        onPurchase(item, c, delta);
        render();
      });
      itemsEl.appendChild(card);
    });
  }

  openBtn.addEventListener('click', () => {
    render();
    panel.classList.add('open');
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
    if (onClose) onClose();
  });

  return { render };
}
