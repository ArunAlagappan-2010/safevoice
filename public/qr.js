// QR helpers on top of the bundled qrcode-generator (works with no internet).
(() => {
  function renderQR(el, text, { size = 140, dark = '#1f3340', light = '#ffffff' } = {}) {
    if (!el || !window.qrcode) return;
    const qr = window.qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    const svg = el.querySelector('svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.querySelectorAll('rect').forEach((r) => r.setAttribute('fill', light));
    svg.querySelectorAll('path').forEach((p) => p.setAttribute('fill', dark));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', text.startsWith('WIFI:') ? 'QR code to join the Wi-Fi' : `QR code for ${text}`);
  }

  // Standard Wi-Fi QR: phone cameras offer "Join network" when scanned.
  function wifiText(ssid, password) {
    const esc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
    return `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;`;
  }

  window.SVQR = { renderQR, wifiText };
})();
