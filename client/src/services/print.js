// Client-side printing via the browser print dialog (works on any HTTPS host,
// including Vercel). The Epson thermal printer and Medialink label printer are
// selected by their installed Windows drivers in the print dialog.
// Receipt layout is sized for 80mm thermal paper; labels for 50x30mm stock.

const CURRENCY = window.localStorage.getItem('currency_symbol') || 'PKR';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const openPrintWindow = (html, title) => {
  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) {
    throw new Error('Print popup blocked. Allow popups for this site to print.');
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the browser a moment to render before invoking the dialog
  setTimeout(() => {
    w.focus();
    w.print();
  }, 250);
};

// data: { saleNumber, createdAt, cashierName, locationName, customerName,
//         items: [{ name, quantity, unitPrice, lineTotal }],
//         subtotal, discountAmount, totalAmount, payments, footer }
export const printReceipt = (data) => {
  const itemsHtml = (data.items || []).map(item => `
    <tr>
      <td class="qty">${item.quantity}</td>
      <td>${esc(item.name)}</td>
      <td class="num">${Number(item.unitPrice).toFixed(0)}</td>
      <td class="num">${Number(item.lineTotal).toFixed(0)}</td>
    </tr>`).join('');

  const paymentsHtml = (data.payments || []).map(p => `
    <div class="row"><span>${esc(p.methodName || p.method_name || 'Payment')}</span><span>${Number(p.amount).toFixed(0)}</span></div>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<title>Receipt ${esc(data.saleNumber || '')}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  body { font-family: 'Courier New', monospace; font-size: 9.5pt; width: 74mm; color: #000; margin: 0; }
  .center { text-align: center; }
  .company { font-size: 12pt; font-weight: bold; letter-spacing: 1px; }
  .muted { font-size: 8pt; }
  hr { border: none; border-top: 1px dashed #000; margin: 4pt 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1pt 0; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  td.qty { width: 18pt; }
  .row { display: flex; justify-content: space-between; margin: 2pt 0; }
  .total { font-size: 11pt; font-weight: bold; }
</style>
</head>
<body>
  <div class="center">
    <div class="company">${esc(data.companyName || 'HIT BY HUMA')}</div>
    <div class="muted">${esc(data.locationName || '')}</div>
    ${data.locationAddress ? `<div class="muted">${esc(data.locationAddress)}</div>` : ''}
    ${data.locationPhone ? `<div class="muted">${esc(data.locationPhone)}</div>` : ''}
  </div>
  <hr>
  <div class="muted">
    Receipt: ${esc(data.saleNumber || '')}<br>
    Date: ${esc(data.createdAt ? new Date(data.createdAt).toLocaleString() : new Date().toLocaleString())}
    ${data.cashierName ? `<br>Cashier: ${esc(data.cashierName)}` : ''}
    ${data.customerName ? `<br>Customer: ${esc(data.customerName)}` : ''}
  </div>
  <hr>
  <table>${itemsHtml}</table>
  <hr>
  <div class="row"><span>Subtotal</span><span>${Number(data.subtotal || 0).toFixed(0)}</span></div>
  ${Number(data.discountAmount) > 0 ? `<div class="row"><span>Discount</span><span>-${Number(data.discountAmount).toFixed(0)}</span></div>` : ''}
  ${Number(data.taxAmount) > 0 ? `<div class="row"><span>Tax</span><span>${Number(data.taxAmount).toFixed(0)}</span></div>` : ''}
  <div class="row total"><span>TOTAL (${CURRENCY})</span><span>${Number(data.totalAmount || 0).toFixed(0)}</span></div>
  ${paymentsHtml ? `<hr>${paymentsHtml}` : ''}
  <hr>
  <div class="center muted">${esc(data.footer || 'Thank you for shopping at HIT BY HUMA! Exchange within 7 days with receipt.')}</div>
</body>
</html>`;

  openPrintWindow(html, `Receipt ${data.saleNumber || ''}`);
};

// data: { name, sku, barcode, price } x quantity labels on 50x30mm stock
export const printLabel = (data, quantity = 1) => {
  const labelHtml = Array.from({ length: quantity }).map(() => `
    <div class="label">
      <div class="product-name">${esc(data.name)}</div>
      <div class="barcode">*${esc(data.barcode || data.sku)}*</div>
      <div class="barcode-text">${esc(data.barcode || data.sku)}</div>
      <div class="price">${CURRENCY} ${Number(data.price).toFixed(0)}</div>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<title>Labels</title>
<style>
  @page { size: 50mm 30mm; margin: 2mm; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
  .label {
    width: 46mm; height: 26mm; box-sizing: border-box; padding: 2mm;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    page-break-after: always; break-inside: avoid;
  }
  .product-name { font-size: 8pt; font-weight: bold; text-align: center; margin-bottom: 1mm; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .barcode { font-family: 'Libre Barcode 39', 'Free 3 of 9', monospace; font-size: 22pt; letter-spacing: 2px; }
  .barcode-text { font-size: 7pt; margin-top: 0.5mm; }
  .price { font-size: 10pt; font-weight: bold; margin-top: 1mm; }
</style>
</head>
<body>${labelHtml}</body>
</html>`;

  openPrintWindow(html, 'Labels');
};

export const printService = { printReceipt, printLabel };
export default printService;
