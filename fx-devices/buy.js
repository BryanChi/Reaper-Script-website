/* FX Devices checkout: PayPal buttons for a $93 license, with an optional discount code.
   /api/paypal/webhook creates the order (so the price is set on the server), then captures it after
   the buyer approves, checks it with PayPal and returns the key. */
(function () {
  'use strict';
  const host = document.getElementById('fxd-paypal');
  if (!host) return;
  const msg = document.getElementById('fxd-buy-msg');
  const done = document.getElementById('fxd-buy-done');
  const keyEl = document.getElementById('fxd-key');
  const mailEl = document.getElementById('fxd-key-mail');
  const copyBtn = document.getElementById('fxd-copy');
  const say = (text, bad) => { msg.textContent = text || ''; msg.classList.toggle('bad', !!bad); };

  function showKey(json) {
    done.hidden = false;
    host.hidden = true;
    keyEl.textContent = json.licenseKey || '';
    const email = json.email;
    mailEl.textContent = email ? (json.emailSent ? `We also sent it to ${email}.` : `Keep it safe. It's linked to ${email}.`) : '';
    say('');
  }

  // Discount code: the server checks it and applies it when it creates the order
  let code = '';
  const codeForm = document.getElementById('fxd-code-form');
  const codeIn = document.getElementById('fxd-code');
  const codeMsg = document.getElementById('fxd-code-msg');
  const priceEl = document.getElementById('fxd-price');
  const wasEl = document.getElementById('fxd-was');
  const codeSay = (text, cls) => { codeMsg.textContent = text || ''; codeMsg.className = 'buy-code-msg' + (cls ? ' ' + cls : ''); };
  const setPrice = p => { priceEl.textContent = String(p).replace(/\.00$/, ''); wasEl.hidden = p === '93.00'; };
  async function api(body) {
    const resp = await fetch('/api/paypal/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.ok) throw new Error(json.error || 'The server did not answer');
    return json;
  }
  codeForm.addEventListener('submit', async e => {
    e.preventDefault();
    const c = codeIn.value.trim();
    code = '';
    setPrice('93.00');
    if (!c) { codeSay(''); return; }
    codeSay('Checking…');
    try {
      const q = await api({ action: 'quote', product: 'fx-devices', code: c });
      code = c;
      setPrice(q.price);
      codeSay(`${q.label}: ${q.percent}% off applied.`, 'ok');
    } catch (err) { codeSay(err.message, 'bad'); }
  });

  copyBtn.addEventListener('click', () => {
    const k = keyEl.textContent;
    if (!k || !navigator.clipboard) return;
    navigator.clipboard.writeText(k).then(() => { copyBtn.textContent = 'Copied'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500); }, () => {});
  });

  function render() {
    host.textContent = '';
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'white', shape: 'rect', label: 'pay', height: 48 },
      createOrder: () => api({ action: 'create', product: 'fx-devices', code }).then(j => j.id, err => {
        say(`Could not start the checkout: ${err.message}`, true);
        throw err;
      }),
      onApprove: async data => {
        say('Payment approved. Getting your license key…');
        let json;
        try {
          json = await api({ orderId: data.orderID });
        } catch (err) {
          say(`The key didn't arrive: ${err.message}. If PayPal charged you, email us with PayPal order ${data.orderID} and we'll send it.`, true);
          return;
        }
        codeForm.hidden = true;
        codeSay('');
        showKey(json);
      },
      onCancel: () => say('Payment cancelled. You can try again any time.'),
      // Keep the checkout's own message if creating the order already failed
      onError: err => { console.error('PayPal error:', err); if (!msg.classList.contains('bad')) say('PayPal hit an error. Please try again.', true); }
    }).render(host).catch(() => say('PayPal could not load. Refresh the page to try again.', true));
  }

  // Load the PayPal SDK only when the license section is near, so the rest of the page stays fast
  let loading = false;
  function load() {
    if (loading) return; loading = true;
    if (window.paypal && window.paypal.Buttons) { render(); return; }
    const fail = text => { host.textContent = ''; say(text, true); };
    // The client id comes from the server, so the button uses the same PayPal app as the checkout
    fetch('/api/paypal/webhook').then(r => r.json()).then(cfg => {
      if (!cfg.ok || !cfg.clientId) throw new Error(cfg.error || 'no client id');
      const s = document.createElement('script');
      s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(cfg.clientId) + '&currency=USD&intent=capture';
      s.onload = render;
      s.onerror = () => fail('PayPal could not load. Check your connection or ad blocker, then refresh.');
      document.head.appendChild(s);
    }).catch(() => fail('The checkout is not available right now. Please try again later.'));
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '800px 0px' });
    io.observe(host);
  } else load();
  if (location.hash === '#buy') load();
})();
