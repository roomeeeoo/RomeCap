// Crea el pago con tarjeta en Stripe. La clave SECRETA vive solo en Netlify (STRIPE_SECRET_KEY).
const ship = require('../../shipping.json');
const PRICE = 3000; // 30 € en céntimos (rebajado; antes 35 €)
const SIZES = ['6', '6 1/8', '6 1/4', '6 3/8', '6 1/2', '6 5/8', '6 3/4', '6 7/8', '7', '7 1/8', '7 1/4', '7 3/8', '7 1/2', '7 5/8', '7 3/4', '7 7/8', '8', '8 1/8', '8 1/4'];
exports.handler = async (e) => {
  try {
    const { items, country, region } = JSON.parse(e.body || '{}');
    const cc = String(country || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return { statusCode: 400, body: 'País no válido' };
    const k = cc === 'ES' ? region : ship.europa.includes(cc) ? 'europa' : 'mundo';
    const z = ship.zonas[k];
    if (!z) return { statusCode: 400, body: 'Zona no válida' };
    const base = cc !== 'ES' && typeof ship.paises[cc] === 'number' ? ship.paises[cc] : z.base;
    if (base == null) return { statusCode: 400, body: 'Envío sin precio' };
    // misma fórmula que la web: base × (1 + recargo) × (1 − descuento)
    const shipCents = Math.round(base * (1 + (ship.recargo || 0)) * (1 - (ship.descuento || 0)) * 100);
    if (!Array.isArray(items) || !items.length) return { statusCode: 400, body: 'Carrito vacío' };
    if (items.some(it => !(+it.id >= 1 && +it.id <= 46) || !SIZES.includes(String(it.size)))) return { statusCode: 400, body: 'Producto o talla no válidos' };
    const p = new URLSearchParams();
    p.append('mode', 'payment');
    const site = process.env.URL || 'http://localhost:8888';
    p.append('success_url', site + '/?pagado=1');
    p.append('cancel_url', site + "/?cancelado=1");
    p.append('shipping_address_collection[allowed_countries][0]', cc);
    const line = (i, name, amount, qty) => {
      p.append(`line_items[${i}][quantity]`, qty);
      p.append(`line_items[${i}][price_data][currency]`, 'eur');
      p.append(`line_items[${i}][price_data][unit_amount]`, amount);
      p.append(`line_items[${i}][price_data][product_data][name]`, name);
    };
    items.forEach((it, i) => line(i, `RomeCap gorra ${String(it.id).padStart(2, '0')} - talla ${String(it.size).slice(0, 12)}`, PRICE, Math.min(20, Math.max(1, +it.qty | 0))));
    line(items.length, `Envío (${cc})`, shipCents, 1);
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p
    });
    const d = await r.json();
    if (!d.url) return { statusCode: 500, body: JSON.stringify(d) };
    return { statusCode: 200, body: JSON.stringify({ url: d.url }) };
  } catch (err) { return { statusCode: 500, body: String(err) }; }
};
