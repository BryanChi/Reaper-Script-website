/* FX Devices checkout: PayPal buttons for a $93 license. The order carries custom_id 'fx-devices';
   after the capture, /api/paypal/webhook checks the order with PayPal and returns the key. */
(function () {
  'use strict';
  const PAYPAL_SDK = 'https://www.paypal.com/sdk/js?client-id=AW1bo3Og1P_xaSVEzcv3R-umo6OPXCMmnaBgdl7Xk3GoTQacCwuKxJqOmz4Vnirl9VOhVIguwbLUfKoC&currency=USD&intent=capture';
  const PRICE = '93.00';
  const host = document.getElementById('fxd-paypal');
  if (!host) return;
  const msg = document.getElementById('fxd-buy-msg');
  const done = document.getElementById('fxd-buy-done');
  const keyEl = document.getElementById('fxd-key');
  const mailEl = document.getElementById('fxd-key-mail');
  const copyBtn = document.getElementById('fxd-copy');
  const say = (text, bad) => { msg.textContent = text || ''; msg.classList.toggle('bad', !!bad); };

  function showKey(json, fallbackEmail) {
    done.hidden = false;
    host.hidden = true;
    keyEl.textContent = json.licenseKey || '';
    const email = json.email || fallbackEmail;
    mailEl.textContent = email ? (json.emailSent ? `We also sent it to ${email}.` : `Keep it safe. It's linked to ${email}.`) : '';
    say('');
  }

  copyBtn.addEventListener('click', () => {
    const k = keyEl.textContent;
    if (!k || !navigator.clipboard) return;
    navigator.clipboard.writeText(k).then(() => { copyBtn.textContent = 'Copied'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500); }, () => {});
  });

  function render() {
    host.textContent = '';
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'white', shape: 'rect', label: 'pay', height: 48 },
      createOrder: (data, actions) => actions.order.create({
        purchase_units: [{
          amount: { value: PRICE, currency_code: 'USD' },
          description: 'FX Devices for REAPER - Lifetime License',
          custom_id: 'fx-devices'
        }]
      }),
      onApprove: (data, actions) => {
        say('Payment received. Getting your license key…');
        return actions.order.capture().then(async details => {
          const email = details && details.payer && details.payer.email_address;
          let json = {};
          try {
            const resp = await fetch('/api/paypal/webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: data.orderID })
            });
            json = await resp.json().catch(() => ({}));
            if (!resp.ok || !json.ok) throw new Error(json.error || 'License delivery failed');
          } catch (err) {
            say(`Your payment went through, but the key didn't arrive: ${err.message}. Email us with PayPal order ${data.orderID} and we'll send it.`, true);
            return;
          }
          showKey(json, email);
        }, () => say('The payment could not be completed. Nothing was charged. Please try again.', true));
      },
      onCancel: () => say('Payment cancelled. You can try again any time.'),
      onError: err => { console.error('PayPal error:', err); say('PayPal hit an error. Please try again.', true); }
    }).render(host).catch(() => say('PayPal could not load. Refresh the page to try again.', true));
  }

  // Load the PayPal SDK only when the license section is near, so the rest of the page stays fast
  let loading = false;
  function load() {
    if (loading) return; loading = true;
    if (window.paypal && window.paypal.Buttons) { render(); return; }
    const s = document.createElement('script');
    s.src = PAYPAL_SDK;
    s.onload = render;
    s.onerror = () => { host.textContent = ''; say('PayPal could not load. Check your connection or ad blocker, then refresh.', true); };
    document.head.appendChild(s);
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '800px 0px' });
    io.observe(host);
  } else load();
  if (location.hash === '#buy') load();
})();
