let products = [];

/** Order API: POST + public GET contract — see reference/fasa-orders-api/README.txt */
const SPRING_BOOT_ORDER_API_URL = 'https://helpful-liberation-production-ed7d.up.railway.app/api/orders';
/** Product catalog (fasa-orders-api GET /api/products). */
const SPRING_BOOT_PRODUCTS_API_URL = 'https://helpful-liberation-production-ed7d.up.railway.app/api/products';
/** Public read-only status by token (fasa-orders-api GET …/public/{token}). */
const ORDER_PUBLIC_STATUS_PATH = '/public';
/** Business WhatsApp (digits only, country code). Keep in sync with footer wa.me links. */
const FASA_ORDERS_WHATSAPP_PHONE = '94767486675';
/** Digits only, after stripping non-digits (e.g. 0771234567). */
const ORDER_PHONE_DIGIT_LENGTH = 10;
const CART_LOADING_ICON_SRC = '/public/images/cart.png';
const PRODUCTS_LOADING_TITLE = 'Preparing your catalog';
const PRODUCTS_LOADING_MESSAGE = 'Fetching products from our store…';
const ORDER_FAIL_WHATSAPP_USER_MESSAGE = 'We could not submit your order online. WhatsApp should open with your order details — please send that message to Fasa Products to confirm your order. If WhatsApp did not open, check your popup blocker or contact us from the site footer.';
/** Spring order API: same customer already has a pending order; show replace confirmation. */
const ORDER_STATUS_CONFIRM_PENDING = 'CONFIRM_PENDING_ORDER';
const ORDER_STATUS_UPDATE_PENDING_FAILED = 'UPDATE_PENDING_FAILED';

let pendingOrderReplaceAcceptHandler = null;
let trackOrderPageInitialized = false;

/** GA4 (gtag.js on index/product pages): count product CTA clicks; safe if gtag blocked or missing. */
function trackProductCtaGa4(buttonId, productId) {
    if (typeof gtag !== 'function') return;
    const params = { button_id: String(buttonId || '') };
    if (productId != null && productId !== '') {
        params.product_id = String(productId);
    }
    gtag('event', 'product_cta_click', params);
}

let wasCartOrderSummaryUnlocked = false;
let wasBuyNowPricePreviewComplete = false;
let cartCheckoutStage = 'items';
let buyNowCheckoutStage = 'items';
let cartPaymentSummaryCache = null;
let buyNowPaymentSummaryCache = null;
let paymentSummaryLoading = false;

const CHECKOUT_STAGES = {
    ITEMS: 'items',
    DELIVERY: 'delivery',
    PAYMENT: 'payment'
};

const PAYMENT_SUMMARY_STORAGE_KEYS = {
    cart: 'fasa_cart_payment_summary',
    buyNow: 'fasa_buy_now_payment_summary'
};

const SRI_LANKA_DISTRICTS = [
    'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle',
    'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle',
    'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala',
    'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura',
    'Trincomalee', 'Vavuniya'
];

function ensureProductsLoadingOverlay() {
    if (document.getElementById('productsLoadingOverlay')) {
        return;
    }

    document.body.insertAdjacentHTML('beforeend', `
        <div id="productsLoadingOverlay" class="catalog-loading-curtain hidden" role="status" aria-live="polite" aria-busy="false" aria-hidden="true">
            <div class="catalog-loading-curtain__veil" aria-hidden="true"></div>
            <div class="catalog-loading-curtain__panel">
                <div class="catalog-loading-curtain__brand">
                    <img src="/public/images/fasa-logo.jpeg" alt="" class="catalog-loading-curtain__logo" width="120" height="48">
                    <span class="catalog-loading-curtain__brand-name">Fasa Products</span>
                </div>
                <div class="catalog-loading-curtain__spinner" aria-hidden="true">
                    <span class="catalog-loading-curtain__ring"></span>
                    <img src="${CART_LOADING_ICON_SRC}" alt="" class="catalog-loading-curtain__cart-icon" width="40" height="40">
                </div>
                <p class="catalog-loading-curtain__title">${PRODUCTS_LOADING_TITLE}</p>
                <p class="catalog-loading-curtain__hint">${PRODUCTS_LOADING_MESSAGE}</p>
                <div class="catalog-loading-curtain__dots" aria-hidden="true">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
    `);
}

/** Full-page curtain while GET /api/products is in flight. */
function setProductsLoading(loading, message) {
    ensureProductsLoadingOverlay();
    const overlay = document.getElementById('productsLoadingOverlay');
    if (!overlay) {
        return;
    }

    const hintEl = overlay.querySelector('.catalog-loading-curtain__hint');
    if (hintEl && message) {
        hintEl.textContent = message;
    } else if (hintEl && loading) {
        hintEl.textContent = PRODUCTS_LOADING_MESSAGE;
    }

    if (loading) {
        overlay.classList.remove('hidden', 'catalog-loading-curtain--closing');
        overlay.setAttribute('aria-busy', 'true');
        overlay.setAttribute('aria-hidden', 'false');
    } else {
        overlay.classList.add('catalog-loading-curtain--closing');
        window.setTimeout(() => {
            if (!overlay.classList.contains('catalog-loading-curtain--closing')) {
                return;
            }
            overlay.classList.add('hidden');
            overlay.classList.remove('catalog-loading-curtain--closing');
            overlay.setAttribute('aria-busy', 'false');
            overlay.setAttribute('aria-hidden', 'true');
        }, 220);
    }

    document.body.classList.toggle('products-catalog-loading-open', Boolean(loading));
}

function showProductsCatalogLoadError() {
    const message = '<p class="products-load-error">We could not load products right now. Please check your connection, ensure the store API is running, and <a href="javascript:location.reload()">try again</a>.</p>';

    if (isProductDetailsPage()) {
        const content = document.getElementById('productDetailsContent');
        if (content) {
            content.innerHTML = message;
        }
        return;
    }

    ['bestSellersGrid', 'offersGrid', 'productsGrid', 'outOfStockGrid'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = message;
        }
    });
}

async function loadProducts() {
    try {
        const response = await fetch(SPRING_BOOT_PRODUCTS_API_URL);
        if (!response.ok) {
            throw new Error(`Products API responded with ${response.status}`);
        }

        const data = await response.json();
        const list = Array.isArray(data?.products) ? data.products : [];
        products = list
            .map(normalizeApiProduct)
            .filter((p) => p && p.id != null && !Number.isNaN(Number(p.id)));
    } catch (error) {
        console.error('Error loading products from API:', error);
        products = [];
    }
}

/** Map GET /api/products item to storefront shape (images, stock, numeric fields). */
function normalizeApiProduct(raw) {
    if (!raw || typeof raw !== 'object') {
        return raw;
    }

    const p = { ...raw };
    p.id = Number(p.id);
    p.price = Number(p.price);
    p.originalPrice = Number(p.originalPrice != null ? p.originalPrice : p.price);

    if (p.currentStock != null && p.currentStock !== '') {
        p.stock = Number(p.currentStock);
    } else if (p.stock != null && p.stock !== '') {
        p.stock = Number(p.stock);
    }

    if (!Array.isArray(p.ingredients)) {
        p.ingredients = [];
    }
    if (!Array.isArray(p.useFor)) {
        p.useFor = [];
    }
    if (!Array.isArray(p.images)) {
        p.images = [];
    }

    if (p.image && !p.images.length) {
        p.images = [p.image];
    } else if (!p.image && p.images.length) {
        p.image = p.images[0];
    }

    p.isDeliveryFree = normalizeIsDeliveryFree(p.isDeliveryFree ?? p.is_delivery_free);

    return p;
}

/** Coerce product/cart item delivery-free flag to a strict boolean. */
function normalizeIsDeliveryFree(value) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === 'yes') return true;
        if (normalized === 'false' || normalized === 'no' || normalized === '') return false;
    }
    return Boolean(value);
}

function resolveIsDeliveryFreeForItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (item.isDeliveryFree != null || item.is_delivery_free != null) {
        return normalizeIsDeliveryFree(item.isDeliveryFree ?? item.is_delivery_free);
    }
    const product = products.find((p) => Number(p.id) === Number(item.id));
    if (product) {
        return normalizeIsDeliveryFree(product.isDeliveryFree ?? product.is_delivery_free);
    }
    return false;
}

function buildOrderItemPayload(item) {
    return {
        id: Number(item.id),
        name: item.name,
        price: Number(item.price),
        quantity: Math.max(1, Number(item.quantity) || 1),
        weight: item.weight || '',
        isDeliveryFree: resolveIsDeliveryFreeForItem(item)
    };
}

// ============================================
// Utility Functions
// ============================================
function formatPrice(price) {
    return `Rs. ${price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

function formatShippingDisplay(amount) {
    return Number(amount) === 0 ? 'Free' : formatPrice(amount);
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function computeOrderSubtotal(items) {
    const safeItems = Array.isArray(items) ? items : [];
    const orderPrice = safeItems.reduce((sum, item) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        return sum + ((Number(item.price) || 0) * qty);
    }, 0);
    return Number(orderPrice.toFixed(2));
}

function buildPricePreviewPayload(items, deliveryDetails, priceSummary, meta = {}) {
    const safeItems = Array.isArray(items) ? items : [];
    const summary = normalizeStoredPaymentSummary(priceSummary);
    if (!summary) {
        throw new Error('Payment summary from /cart/summary is required for price preview');
    }
    const lineItems = safeItems.map((item) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const unit = Number(item.price) || 0;
        return {
            name: item.name || 'Item',
            quantity: qty,
            unitPrice: unit,
            lineTotal: Number((unit * qty).toFixed(2)),
            weight: item.weight || ''
        };
    });

    return {
        title: meta.title || 'Price Preview',
        lineItems,
        subtotal: summary.subtotal,
        shipping: summary.shipping,
        total: summary.total,
        delivery: {
            type: deliveryDetails.deliveryType || '',
            customerName: deliveryDetails.customerName || '',
            district: deliveryDetails.district || '',
            addressLine1: deliveryDetails.addressLine1 || '',
            addressLine2: deliveryDetails.addressLine2 || ''
        }
    };
}

function buildPricePreviewWindowHtml(payload) {
    const lineRows = (payload.lineItems || []).map((item) => `
        <tr>
            <td class="item-name">
                <strong>${escapeHtml(item.name)}</strong>
                ${item.weight ? `<span class="item-meta">${escapeHtml(item.weight)}</span>` : ''}
            </td>
            <td class="item-qty">${item.quantity}</td>
            <td class="item-price">${formatPrice(item.unitPrice)}</td>
            <td class="item-total">${formatPrice(item.lineTotal)}</td>
        </tr>
    `).join('');

    const addressParts = [
        payload.delivery.addressLine1,
        payload.delivery.addressLine2,
        payload.delivery.district
    ].filter(Boolean).map(escapeHtml);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(payload.title)} — Fasa Products</title>
    <style>
        :root {
            --primary: #1e4a24;
            --secondary: #4a7c2a;
            --accent: #7ec850;
            --text: #1f2937;
            --muted: #6b7280;
            --border: #e5e7eb;
            --surface: #f8faf6;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
            color: var(--text);
            background: linear-gradient(180deg, #f3f8ef 0%, #fff 220px);
            line-height: 1.5;
        }
        .wrap {
            max-width: 640px;
            margin: 0 auto;
            padding: 1.25rem 1rem 2rem;
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1rem;
        }
        .brand-mark {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: #fff;
            display: grid;
            place-items: center;
            font-weight: 800;
            font-size: 1.1rem;
        }
        h1 {
            margin: 0;
            font-size: clamp(1.15rem, 3vw, 1.45rem);
            color: var(--primary);
        }
        .subtitle {
            margin: 0.2rem 0 0;
            color: var(--muted);
            font-size: 0.9rem;
        }
        .card {
            background: #fff;
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 1rem;
            margin-top: 1rem;
            box-shadow: 0 10px 30px rgba(30, 74, 36, 0.06);
        }
        .card h2 {
            margin: 0 0 0.75rem;
            font-size: 0.95rem;
            color: var(--primary);
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }
        th, td {
            padding: 0.55rem 0.35rem;
            text-align: left;
            vertical-align: top;
        }
        th {
            color: var(--muted);
            font-size: 0.78rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            border-bottom: 1px solid var(--border);
        }
        td { border-bottom: 1px solid #f1f5f9; }
        tr:last-child td { border-bottom: none; }
        .item-name strong { display: block; }
        .item-meta {
            display: block;
            margin-top: 0.15rem;
            color: var(--muted);
            font-size: 0.8rem;
        }
        .item-qty, .item-price, .item-total { white-space: nowrap; }
        .item-total { font-weight: 600; color: var(--primary); }
        .totals {
            margin-top: 0.85rem;
            border-top: 1px solid var(--border);
            padding-top: 0.65rem;
        }
        .totals-row {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.35rem 0;
            color: var(--muted);
            font-size: 0.92rem;
        }
        .totals-row--grand {
            margin-top: 0.35rem;
            padding-top: 0.65rem;
            border-top: 2px solid var(--border);
            color: var(--text);
            font-size: 1.05rem;
            font-weight: 700;
        }
        .totals-row--grand span:last-child { color: var(--primary); }
        .delivery-list {
            margin: 0;
            padding: 0;
            list-style: none;
            font-size: 0.9rem;
        }
        .delivery-list li {
            padding: 0.3rem 0;
            color: var(--muted);
        }
        .delivery-list strong { color: var(--text); }
        .note {
            margin-top: 1rem;
            font-size: 0.82rem;
            color: var(--muted);
            text-align: center;
        }
        @media (max-width: 520px) {
            th:nth-child(3), td:nth-child(3) { display: none; }
            .wrap { padding-inline: 0.75rem; }
        }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="brand">
            <div class="brand-mark" aria-hidden="true">F</div>
            <div>
                <h1>${escapeHtml(payload.title)}</h1>
                <p class="subtitle">Estimated order total — review before checkout</p>
            </div>
        </div>
        <section class="card">
            <h2>Items</h2>
            <table>
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Line total</th>
                    </tr>
                </thead>
                <tbody>${lineRows}</tbody>
            </table>
            <div class="totals">
                <div class="totals-row"><span>Subtotal</span><span>${formatPrice(payload.subtotal)}</span></div>
                <div class="totals-row"><span>Shipping</span><span>${formatShippingDisplay(payload.shipping)}</span></div>
                <div class="totals-row totals-row--grand"><span>Total</span><span>${formatPrice(payload.total)}</span></div>
            </div>
        </section>
        <section class="card">
            <h2>Delivery</h2>
            <ul class="delivery-list">
                <li><strong>Type:</strong> ${escapeHtml(payload.delivery.type)}</li>
                <li><strong>Name:</strong> ${escapeHtml(payload.delivery.customerName)}</li>
                ${addressParts.length ? `<li><strong>Address:</strong> ${addressParts.join(', ')}</li>` : ''}
            </ul>
        </section>
        <p class="note">You can close this window and return to checkout when ready.</p>
    </div>
</body>
</html>`;
}

function openPricePreviewWindow(payload) {
    const previewWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!previewWindow) {
        showApiResponsePopup('Please allow pop-ups in your browser to view the price preview.');
        return;
    }
    previewWindow.document.open();
    previewWindow.document.write(buildPricePreviewWindowHtml(payload));
    previewWindow.document.close();
    previewWindow.opener = null;
}

async function openCartPricePreview() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    if (!cart.length) {
        showApiResponsePopup('Your cart is empty!');
        return;
    }
    const deliveryDetails = getDeliveryDetails();
    if (!isCartOrderSummaryUnlocked(deliveryDetails)) {
        showApiResponsePopup('Please complete delivery details and valid phone numbers to preview prices.');
        return;
    }
    try {
        const summary = await fetchCartSummaryFromBackend(cart, deliveryDetails);
        openPricePreviewWindow(buildPricePreviewPayload(cart, deliveryDetails, summary, { title: 'Cart — Price Preview' }));
    } catch (err) {
        console.error('Cart price preview failed:', err);
        showApiResponsePopup('Could not load prices from the server. Please try again.');
    }
}

async function openBuyNowPricePreview() {
    const item = getBuyNowItemFromPopup();
    const deliveryDetails = getBuyNowDeliveryDetails();
    if (!item || !isCartOrderSummaryUnlocked(deliveryDetails)) {
        showApiResponsePopup('Please complete delivery details and valid phone numbers to preview prices.');
        return;
    }
    try {
        const summary = await fetchCartSummaryFromBackend([item], deliveryDetails);
        openPricePreviewWindow(buildPricePreviewPayload([item], deliveryDetails, summary, { title: 'Buy Now — Price Preview' }));
    } catch (err) {
        console.error('Buy now price preview failed:', err);
        showApiResponsePopup('Could not load prices from the server. Please try again.');
    }
}

function buildInlinePaymentSummaryHtml(items, deliveryDetails, priceSummary = null, context = 'cart') {
    const summary = normalizeStoredPaymentSummary(priceSummary);
    if (!summary) {
        return getPaymentSummaryLoadingHtml();
    }

    savePaymentSummaryToStorage(context, summary);

    return `
        <h3 class="checkout-payment-summary__title">Payment summary</h3>
        <div class="checkout-payment-summary__rows">
            <div class="checkout-payment-summary__row">
                <span>Subtotal</span>
                <span>${formatPrice(summary.subtotal)}</span>
            </div>
            <div class="checkout-payment-summary__row">
                <span>Shipping</span>
                <span>${formatShippingDisplay(summary.shipping)}</span>
            </div>
            <div class="checkout-payment-summary__row checkout-payment-summary__row--total">
                <span>Total</span>
                <span>${formatPrice(summary.total)}</span>
            </div>
        </div>
    `;
}

function getCartSummaryApiUrl() {
    if (typeof window !== 'undefined' && window.FASA_CART_SUMMARY_API_URL) {
        return String(window.FASA_CART_SUMMARY_API_URL).trim();
    }
    const base = String(SPRING_BOOT_ORDER_API_URL || '').replace(/\/+$/, '');
    return `${base}/cart/summary`;
}

function buildCartSummaryRequestPayload(items, deliveryDetails) {
    const safeItems = Array.isArray(items) ? items : [];
    return {
        items: safeItems.map((item) => buildOrderItemPayload(item)),
        deliveryDetails: deliveryDetails || null
    };
}

function parseCartSummaryResponse(response) {
    const subtotal = Number(response?.subtotal);
    const shipping = Number(response?.shipping);
    const total = Number(response?.total);
    if (!Number.isFinite(subtotal) || !Number.isFinite(shipping) || !Number.isFinite(total)) {
        throw new Error('Invalid cart summary response');
    }
    return {
        subtotal: Number(subtotal.toFixed(2)),
        shipping: Number(shipping.toFixed(2)),
        total: Number(total.toFixed(2))
    };
}

function fetchCartSummaryFromBackend(items, deliveryDetails) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: getCartSummaryApiUrl(),
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify(buildCartSummaryRequestPayload(items, deliveryDetails)),
            success: (response) => {
                try {
                    resolve(parseCartSummaryResponse(response));
                } catch (err) {
                    reject(err);
                }
            },
            error: (xhr) => reject(xhr)
        });
    });
}

function getPaymentSummaryLoadingHtml() {
    return `
        <div class="checkout-payment-summary checkout-payment-summary--loading" role="status" aria-live="polite" aria-busy="true">
            <div class="checkout-payment-summary__loader" aria-hidden="true">
                <span class="checkout-payment-summary__loader-ring"></span>
                <img src="${CART_LOADING_ICON_SRC}" alt="" class="checkout-payment-summary__loader-icon" width="44" height="44">
            </div>
            <p class="checkout-payment-summary__loader-text">Loading payment summary…</p>
        </div>
    `;
}

function normalizeStoredPaymentSummary(summary) {
    const subtotal = Number(summary?.subtotal);
    const shipping = Number(summary?.shipping);
    const total = Number(summary?.total);
    if (!Number.isFinite(subtotal) || !Number.isFinite(shipping) || !Number.isFinite(total)) {
        return null;
    }
    return {
        subtotal: Number(subtotal.toFixed(2)),
        shipping: Number(shipping.toFixed(2)),
        total: Number(total.toFixed(2)),
        savedAt: summary?.savedAt || new Date().toISOString()
    };
}

function getPaymentSummaryStorageKey(context) {
    return context === 'buyNow'
        ? PAYMENT_SUMMARY_STORAGE_KEYS.buyNow
        : PAYMENT_SUMMARY_STORAGE_KEYS.cart;
}

function savePaymentSummaryToStorage(context, summary) {
    const normalized = normalizeStoredPaymentSummary(summary);
    if (!normalized) return null;
    try {
        localStorage.setItem(getPaymentSummaryStorageKey(context), JSON.stringify(normalized));
    } catch (err) {
        console.warn('Could not save payment summary to localStorage:', err);
    }
    if (context === 'buyNow') {
        buyNowPaymentSummaryCache = normalized;
    } else {
        cartPaymentSummaryCache = normalized;
    }
    return normalized;
}

function loadPaymentSummaryFromStorage(context) {
    try {
        const raw = localStorage.getItem(getPaymentSummaryStorageKey(context));
        if (!raw) return null;
        return normalizeStoredPaymentSummary(JSON.parse(raw));
    } catch {
        return null;
    }
}

function getPriceOverridesFromStorage(context) {
    const summary = loadPaymentSummaryFromStorage(context);
    if (!summary) return null;
    return {
        orderPrice: summary.subtotal,
        deliveryPrice: summary.shipping
    };
}

function applyBackendSummaryToHiddenFields(summary, context = 'cart') {
    if (!summary) return;
    if (context === 'buyNow') {
        $('#buyNowSubtotal').text(formatPrice(summary.subtotal));
        $('#buyNowShipping').text(formatShippingDisplay(summary.shipping));
        $('#buyNowTotal').text(formatPrice(summary.total));
        return;
    }
    $('#subtotal').text(formatPrice(summary.subtotal));
    $('#shipping').text(formatShippingDisplay(summary.shipping));
    $('#total').text(formatPrice(summary.total));
}

function setPaymentSummaryPanelLoading(panelId, loading) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    if (loading) {
        panel.innerHTML = getPaymentSummaryLoadingHtml();
    }
}

function setPaymentSummaryButtonsDisabled(disabled) {
    $('#cartViewPaymentSummaryBtn, #buyNowViewPaymentSummaryBtn, #checkoutBtn, #buyNowCheckoutBtn')
        .prop('disabled', Boolean(disabled));
}

async function loadPaymentSummaryAndShow(config) {
    const {
        items,
        deliveryDetails,
        panelId,
        setStageFn,
        context,
        scrollTargetId
    } = config;

    if (paymentSummaryLoading) return;
    paymentSummaryLoading = true;

    setStageFn(CHECKOUT_STAGES.PAYMENT);
    setPaymentSummaryPanelLoading(panelId, true);
    setPaymentSummaryButtonsDisabled(true);

    const scrollEl = scrollTargetId ? document.getElementById(scrollTargetId) : null;
    const scrollPaymentOnMobile = context === 'cart'
        && window.matchMedia('(max-width: 480px)').matches;
    scrollElementToTopAfterLayout(scrollEl, { extraDelays: scrollPaymentOnMobile });

    try {
        const summary = await fetchCartSummaryFromBackend(items, deliveryDetails);
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.innerHTML = buildInlinePaymentSummaryHtml(items, deliveryDetails, summary, context);
        }
        if (context === 'cart') {
            scrollCartStageToTop(CHECKOUT_STAGES.PAYMENT);
        } else if (scrollEl) {
            scrollElementToTopAfterLayout(scrollEl, { extraDelays: scrollPaymentOnMobile });
        }
    } catch (err) {
        console.error('Cart summary request failed:', err);
        clearPaymentSummaryCache(context);
        setStageFn(CHECKOUT_STAGES.DELIVERY);
        showApiResponsePopup('Could not load payment summary from the server. Please check your connection and try again.');
        return false;
    } finally {
        paymentSummaryLoading = false;
        if (context === 'buyNow') {
            refreshBuyNowSummaryState();
        } else {
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            refreshCartSummaryState(cart);
        }
    }
    return true;
}

function clearPaymentSummaryCache(context = 'all') {
    if (context === 'cart' || context === 'all') {
        try {
            localStorage.removeItem(PAYMENT_SUMMARY_STORAGE_KEYS.cart);
        } catch {
            /* ignore */
        }
        cartPaymentSummaryCache = null;
    }
    if (context === 'buyNow' || context === 'all') {
        try {
            localStorage.removeItem(PAYMENT_SUMMARY_STORAGE_KEYS.buyNow);
        } catch {
            /* ignore */
        }
        buyNowPaymentSummaryCache = null;
    }
}

function updateCheckoutStepsIndicator(containerId, stage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.checkout-steps__item').forEach((el) => {
        const step = el.getAttribute('data-step');
        el.classList.toggle('checkout-steps__item--active', step === stage);
        el.classList.toggle('checkout-steps__item--done', getCheckoutStageIndex(step) < getCheckoutStageIndex(stage));
    });
}

function getCheckoutStageIndex(stage) {
    const order = [CHECKOUT_STAGES.ITEMS, CHECKOUT_STAGES.DELIVERY, CHECKOUT_STAGES.PAYMENT];
    const idx = order.indexOf(stage);
    return idx === -1 ? 0 : idx;
}

function resetElementScrollTop(el) {
    if (!el) return;
    el.scrollTop = 0;
}

function scrollElementToTopAfterLayout(el, { extraDelays = false } = {}) {
    if (!el) return;
    const reset = () => resetElementScrollTop(el);
    reset();
    requestAnimationFrame(() => {
        reset();
        requestAnimationFrame(reset);
    });
    if (extraDelays) {
        [50, 150, 300].forEach((ms) => setTimeout(reset, ms));
    }
}

function scrollCartStageToTop(stage) {
    const scrollMap = {
        [CHECKOUT_STAGES.ITEMS]: 'cartItemsScroll',
        [CHECKOUT_STAGES.DELIVERY]: 'cartDeliveryScroll',
        [CHECKOUT_STAGES.PAYMENT]: 'cartPaymentScroll'
    };
    const scrollEl = document.getElementById(scrollMap[stage]);
    if (!scrollEl) return;
    const extraDelays = stage === CHECKOUT_STAGES.PAYMENT
        && window.matchMedia('(max-width: 480px)').matches;
    scrollElementToTopAfterLayout(scrollEl, { extraDelays });
}

function closeCartPanel() {
    const panel = document.getElementById('cartSidepanel');
    const overlay = document.getElementById('cartOverlay');
    panel?.classList.remove('active');
    overlay?.classList.remove('active');
    resetCartCheckoutFlow();
}

function setCartCheckoutStage(stage) {
    cartCheckoutStage = stage;
    const stageMap = {
        [CHECKOUT_STAGES.ITEMS]: 'cartStageItems',
        [CHECKOUT_STAGES.DELIVERY]: 'cartStageDelivery',
        [CHECKOUT_STAGES.PAYMENT]: 'cartStagePayment'
    };
    Object.entries(stageMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('hidden', key !== stage);
        }
    });
    updateCheckoutStepsIndicator('cartCheckoutSteps', stage);

    const titleEl = document.querySelector('.cart-header h2');
    if (titleEl) {
        const titles = {
            [CHECKOUT_STAGES.ITEMS]: 'Shopping Cart',
            [CHECKOUT_STAGES.DELIVERY]: 'Delivery Details',
            [CHECKOUT_STAGES.PAYMENT]: 'Payment Summary'
        };
        titleEl.textContent = titles[stage] || 'Shopping Cart';
    }

    const stepsEl = document.getElementById('cartCheckoutSteps');
    if (stepsEl) {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const isEmpty = !Array.isArray(cart) || cart.length === 0;
        stepsEl.classList.toggle('hidden', isEmpty);
    }

    scrollCartStageToTop(stage);
}

function resetCartCheckoutFlow() {
    clearPaymentSummaryCache('cart');
    setCartCheckoutStage(CHECKOUT_STAGES.ITEMS);
}

function setBuyNowCheckoutStage(stage) {
    buyNowCheckoutStage = stage;
    const stageMap = {
        [CHECKOUT_STAGES.ITEMS]: 'buyNowStageItems',
        [CHECKOUT_STAGES.DELIVERY]: 'buyNowStageDelivery',
        [CHECKOUT_STAGES.PAYMENT]: 'buyNowStagePayment'
    };
    Object.entries(stageMap).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('hidden', key !== stage);
        }
    });
    updateCheckoutStepsIndicator('buyNowCheckoutSteps', stage);

    const titleEl = document.getElementById('buyNowPopupTitle');
    if (titleEl) {
        const titles = {
            [CHECKOUT_STAGES.ITEMS]: 'Buy Now',
            [CHECKOUT_STAGES.DELIVERY]: 'Delivery Details',
            [CHECKOUT_STAGES.PAYMENT]: 'Payment Summary'
        };
        titleEl.textContent = titles[stage] || 'Buy Now';
    }

    const stepsEl = document.getElementById('buyNowCheckoutSteps');
    if (stepsEl) {
        stepsEl.classList.toggle('hidden', stage === CHECKOUT_STAGES.ITEMS);
    }

    const scrollMap = {
        [CHECKOUT_STAGES.ITEMS]: 'buyNowItemsScroll',
        [CHECKOUT_STAGES.DELIVERY]: 'buyNowDeliveryScroll',
        [CHECKOUT_STAGES.PAYMENT]: 'buyNowPaymentScroll'
    };
    const scrollEl = document.getElementById(scrollMap[stage]);
    if (scrollEl) scrollEl.scrollTop = 0;
}

function resetBuyNowCheckoutFlow() {
    clearPaymentSummaryCache('buyNow');
    setBuyNowCheckoutStage(CHECKOUT_STAGES.ITEMS);
}

function renderBuyNowProductStage() {
    const product = getBuyNowProductFromPopup();
    const container = document.getElementById('buyNowStageProductContent');
    if (!product || !container) return;

    const weightBadge = product.weight
        ? `<span class="detail-badge">${escapeHtml(product.weight)}</span>`
        : '';

    container.innerHTML = `
        <div class="cart-item">
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            <div class="cart-info">
                <p class="product-name">${escapeHtml(product.name)}</p>
                <p class="product-price">${formatPrice(Number(product.price) || 0)}</p>
                <div class="product-details">
                    <span class="detail-badge">Qty: 1</span>
                    ${weightBadge}
                </div>
            </div>
        </div>
    `;
}

function getBuyNowProductFromPopup() {
    const popup = document.getElementById('buyNowDeliveryPopup');
    if (!popup) return null;
    const productId = Number(popup.dataset.productId);
    if (!Number.isFinite(productId)) return null;
    return products.find((p) => Number(p.id) === productId) || null;
}

function validateCartDeliveryForSummary() {
    const deliveryDetails = getDeliveryDetails();
    const phoneValidation = setPhoneValidationUI(
        {
            whatsAppSelector: '#deliveryWhatsAppNumber',
            otherSelector: '#deliveryOtherPhoneNumber',
            errorSelector: '#deliveryPhoneError'
        },
        deliveryDetails,
        true
    );
    if (!isCartOrderSummaryUnlocked(deliveryDetails)) {
        if (!hasDeliveryDetails(deliveryDetails)) {
            showApiResponsePopup('Please enter your full name, delivery address, phone numbers, and district.');
        } else {
            showApiResponsePopup(phoneValidation.message || `Please enter valid, different WhatsApp and other phone numbers (exactly ${ORDER_PHONE_DIGIT_LENGTH} digits each).`);
        }
        if (!hasValidCustomerName(deliveryDetails)) {
            scrollCartPanelToward('#cartDeliveryForm .cart-form-group--customer-name');
        } else {
            scheduleScrollCartToPhoneFieldsIfNeeded();
        }
        return false;
    }
    return true;
}

function validateBuyNowDeliveryForSummary() {
    const deliveryDetails = getBuyNowDeliveryDetails();
    const phoneValidation = setPhoneValidationUI(
        {
            whatsAppSelector: '#buyNowWhatsAppNumber',
            otherSelector: '#buyNowOtherPhoneNumber',
            errorSelector: '#buyNowPhoneError'
        },
        deliveryDetails,
        true
    );
    if (!isCartOrderSummaryUnlocked(deliveryDetails)) {
        if (!hasDeliveryDetails(deliveryDetails)) {
            showApiResponsePopup('Please enter your full name, delivery address, phone numbers, and district.');
        } else {
            showApiResponsePopup(phoneValidation.message || `Please enter valid, different WhatsApp and other phone numbers (exactly ${ORDER_PHONE_DIGIT_LENGTH} digits each).`);
        }
        if (!hasValidCustomerName(deliveryDetails)) {
            scrollBuyNowPanelToward('#buyNowDeliveryForm .cart-form-group--customer-name');
        } else {
            scheduleScrollBuyNowToPhoneFieldsIfNeeded();
        }
        return false;
    }
    return true;
}

/** Parse text like "Rs. 1,234.56" or "Free" from cart / buy-now summary labels. */
function parseDisplayedRsAmount(text) {
    if (text == null) return null;
    const t = String(text).trim();
    if (!t) return null;
    if (/^free$/i.test(t)) return 0;
    const cleaned = t.replace(/Rs\.?\s*/i, '').replace(/,/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function renderStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let starsHTML = '';
    
    for (let i = 0; i < fullStars; i++) {
        starsHTML += '★';
    }
    if (hasHalfStar) {
        starsHTML += '½';
    }
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
        starsHTML += '☆';
    }
    
    return starsHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Stock from API (currentStock) or legacy stock field; missing = treated as available. */
function getProductStock(product) {
    if (!product) {
        return null;
    }
    const raw = product.currentStock != null && product.currentStock !== ''
        ? product.currentStock
        : product.stock;
    if (raw == null || raw === '') {
        return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

/** Out of stock when stock is set and is zero or negative. */
function isOutOfStock(product) {
    const stock = getProductStock(product);
    return stock != null && stock <= 0;
}

function getInStockProducts(list) {
    const source = Array.isArray(list) ? list : products;
    return source.filter((p) => !isOutOfStock(p));
}

function getOutOfStockProducts(list) {
    const source = Array.isArray(list) ? list : products;
    return source.filter((p) => isOutOfStock(p));
}

const OUT_OF_STOCK_MESSAGE =
    'This product is currently out of stock. Add to Cart and Order Now are unavailable — please check back soon or message us on WhatsApp.';

// ============================================
// Product Card Component
// ============================================
function createProductCard(product) {
    const originalPrice = Number(product.originalPrice);
    const currentPrice = Number(product.price);

    const discount = (originalPrice > currentPrice)
        ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
        : 0;
    const outOfStock = isOutOfStock(product);
    
    return `
        <div class="product-card${outOfStock ? ' product-card--out-of-stock' : ''}" data-product-id="${product.id}">
            <div class="product-image-container">
                <img src="${product.image}" alt="${product.name}" class="product-image" loading="lazy">
                ${outOfStock ? '<div class="product-badge out-of-stock">Out of stock</div>' : (discount > 0 ? `<div class="product-badge sale">${discount}% OFF</div>` : '')}
            </div>
            <div class="product-info">
                <div class="product-category">${product.category}</div>
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.description}</p>
                <div class="product-footer">
                    <div class="product-price">
                        <span class="price-current">${formatPrice(product.price)}</span>
                        ${discount > 0 ? `<span class="price-original">${formatPrice(product.originalPrice)}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// Render Products
// ============================================
function renderProducts(productsArray, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = productsArray.map(product => createProductCard(product)).join('');
    
    // Add click event listeners to product cards
    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', function() {
            const productId = parseInt(this.dataset.productId);
            navigateToProduct(productId);
        });
    });
}

// ============================================
// Navigation
// ============================================
function navigateToProduct(productId) {
   console.log('navigateToProduct ' + productId);
   window.location.href = `/product?id=${productId}`;
}

// ============================================
// Filter Products
// ============================================
function filterProducts(category) {
    let filteredProducts = getInStockProducts();
    
    if (category !== 'all') {
        filteredProducts = filteredProducts.filter(product => product.category === category);
    }
    
    renderProducts(filteredProducts, 'productsGrid');
}

function renderOutOfStockSection() {
    const section = document.getElementById('out-of-stock');
    const grid = document.getElementById('outOfStockGrid');
    if (!section || !grid) return;

    const outOfStock = getOutOfStockProducts();
    if (!outOfStock.length) {
        section.classList.add('hidden');
        section.setAttribute('aria-hidden', 'true');
        grid.innerHTML = '';
        return;
    }

    section.classList.remove('hidden');
    section.removeAttribute('aria-hidden');
    renderProducts(outOfStock, 'outOfStockGrid');
}

// ============================================
// Product Details Page
// ============================================
function loadProductDetails() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));
        console.log('Loading product details ' + productId);
    
    if (!productId) {
        document.getElementById('productDetailsContent').innerHTML = 
            '<p>Product not found. <a href="/">Return to home</a></p>';
        return;
    }
    
    const product = products.find((p) => Number(p.id) === productId);
    
    if (!product) {
        document.getElementById('productDetailsContent').innerHTML = 
            '<p>Product not found. <a href="/">Return to home</a></p>';
        return;
    }
    
    // Update breadcrumb
    const breadcrumbProductName = document.getElementById('breadcrumbProductName');
    if (breadcrumbProductName) {
        breadcrumbProductName.textContent = product.name;
    }
    
    // Render product details
    renderProductDetails(product); 

    
    const relatedGrid = document.getElementById('relatedProductsGrid');
    const relatedProducts = products
        .filter(p => p.id !== productId && p.category === product.category)
        .slice(0, 4);

    if (relatedGrid) {
        if (relatedProducts.length === 0) {
            relatedGrid.setAttribute('data-empty', 'true');
            relatedGrid.innerHTML =
                '<p class="related-products__empty">No other products in this category yet. <a href="/#products">Browse the full catalog</a>.</p>';
        } else {
            relatedGrid.removeAttribute('data-empty');
            renderProducts(relatedProducts, 'relatedProductsGrid');
        }
    }
}

function renderProductDetails(product) {
    renderReviews(product.id);
    const originalPrice = Number(product.originalPrice);
    const currentPrice = Number(product.price);

    const discount = (originalPrice > currentPrice)
        ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
        : 0; 
    console.log('Discount: ' + discount);
    
    const thumbnailsHTML = product.images.map((img, index) => 
        `<div class="thumbnail ${index === 0 ? 'active' : ''}" data-image="${img}">
            <img src="${img}" alt="${product.name} view ${index + 1}">
        </div>`
    ).join('');
    
    const featuresHTML = product.ingredients.map(ingredient => 
        `<li>${ingredient}</li>`
    ).join('');
    
    const content = document.getElementById('productDetailsContent');
    content.innerHTML = `
        <div class="product-gallery">
            <div class="main-image">
                <img src="${product.images[0]}" alt="${product.name}" id="mainProductImage">
            </div>
            <div class="thumbnail-images">
                ${thumbnailsHTML}
            </div>
        </div>
        <div class="product-info-detail">
            <div class="product-category-detail">${product.category}</div>
            <h1 class="product-title-detail">${product.name}</h1>
            <div class="product-rating">
                <span class="stars" id="productStars">☆☆☆☆☆</span>
                <span class="rating-text" id="productRatingText">
                (Loading reviews…)
            </span>
            </div>
            <div class="product-price-detail">
                <span class="price-current-detail">${formatPrice(product.price)}</span>
                ${discount > 0 ? `<span class="price-original-detail">${formatPrice(product.originalPrice)}</span>` : ''}
                ${discount > 0 ? `<span class="product-badge sale" style="display: inline-block; margin-left: 1rem;">${discount}% OFF</span>` : ''}
                ${isOutOfStock(product) ? '<span class="product-badge out-of-stock product-badge--inline">Out of stock</span>' : ''}
            </div>
            <p class="product-description-detail">${product.description}</p>
            <div class="product-features">
                ${featuresHTML?.trim() ? '<h3>Ingredients</h3>' : ''}
                <ul>
                    ${featuresHTML}
                </ul>
            </div>
            <div class="product-out-of-stock-notice hidden" id="productOutOfStockNotice" role="status" aria-live="polite">
                <span class="product-out-of-stock-notice__icon" aria-hidden="true">!</span>
                <p class="product-out-of-stock-notice__text">${OUT_OF_STOCK_MESSAGE}</p>
            </div>
            <div class="product-actions">
                <button type="button" id="addToCart" class="btn btn-primary" data-id="${product.id}">Add to Cart</button>
                <button type="button" id="orderNowBtn" class="btn btn-secondary" data-id="${product.id}" aria-label="Order Now">Order Now</button>
            </div>
        </div>
    `;

    applyOutOfStockProductActions(product);
    
    // Add thumbnail click handlers
    content.querySelectorAll('.thumbnail').forEach(thumbnail => {
        thumbnail.addEventListener('click', function() {
            const imageUrl = this.dataset.image;
            document.getElementById('mainProductImage').src = imageUrl;
            
            // Update active thumbnail
            content.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

async function renderReviews(productId) {
    try {
        const { getReviews } = await import('./review.js');
        const reviews = await getReviews(productId);
        const reviewCount = reviews.length;
        const totalRating = reviewCount
            ? reviews.reduce((sum, r) => sum + Number(r.rating), 0)
            : 0;

        const finalRating = reviewCount
            ? Number((totalRating / reviewCount).toFixed(1))
            : 0;

        console.log("Reviews array:", reviews);

        const container = document.getElementById("reviewsContainer");
        if (!container) return;

        if (reviews.length === 0) {
            container.innerHTML =
                '<div class="reviews-empty" role="status"><p>No reviews yet. Be the first to review this product—scroll down to share your experience.</p></div>';
            
        } else {
            // Create carousel structure
            container.innerHTML = `
                <div class="reviews-carousel">
                    <button class="carousel-arrow carousel-arrow-left" aria-label="Previous reviews">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                    </button>
                    <div class="reviews-track">
                        ${reviews.map(review => `
                            <div class="review-card">
                                <div class="review-header">
                                    <div class="reviewer-info">
                                        <div class="reviewer-avatar">${review.name.charAt(0)}</div>
                                        <div class="reviewer-details">
                                            <h4>${review.name}</h4>
                                            <div class="review-date">${formatDate(review.date)}</div>
                                        </div>
                                    </div>
                                    <div class="review-rating">${renderStars(review.rating)}</div>
                                </div>
                                <p class="review-text">${review.text}</p>
                            </div>
                        `).join('')}
                    </div>
                    <button class="carousel-arrow carousel-arrow-right" aria-label="Next reviews">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </button>
                </div>
            `;

            // Add carousel navigation functionality
            const track = container.querySelector('.reviews-track');
            const leftArrow = container.querySelector('.carousel-arrow-left');
            const rightArrow = container.querySelector('.carousel-arrow-right');
            
            const scrollAmount = 380;

            leftArrow.addEventListener('click', () => {
                track.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
            });

            rightArrow.addEventListener('click', () => {
                track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            });

            // Update arrow visibility based on scroll position
            const updateArrows = () => {
                leftArrow.style.opacity = track.scrollLeft <= 0 ? '0.3' : '1';
                leftArrow.style.pointerEvents = track.scrollLeft <= 0 ? 'none' : 'auto';
                
                const maxScroll = track.scrollWidth - track.clientWidth;
                rightArrow.style.opacity = track.scrollLeft >= maxScroll - 1 ? '0.3' : '1';
                rightArrow.style.pointerEvents = track.scrollLeft >= maxScroll - 1 ? 'none' : 'auto';
            };

            track.addEventListener('scroll', updateArrows);
            updateArrows();
        }
        document.getElementById("productStars").innerHTML = renderStars(finalRating);
        document.getElementById("productRatingText").textContent = `(${finalRating} based on ${reviewCount} reviews)`;
    } catch (error) {
        console.error("Error rendering reviews:", error);
        document.getElementById("productStars").innerHTML = renderStars(0);
        document.getElementById("productRatingText").textContent = `(0 based on 0 reviews)`;
    }
}


// ============================================
// Mobile Menu Toggle
// ============================================
function initMobileMenu() {
    const toggle = document.getElementById('mobileMenuToggle');
    const nav = document.getElementById('nav');

    if (!toggle || !nav) return;

    const setMenuOpen = (open) => {
        nav.classList.toggle('active', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.classList.toggle('nav-open', open);
    };

    toggle.addEventListener('click', function () {
        setMenuOpen(!nav.classList.contains('active'));
    });

    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setMenuOpen(false));
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && nav.classList.contains('active')) {
            setMenuOpen(false);
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && nav.classList.contains('active')) {
            setMenuOpen(false);
        }
    });
}

// ============================================
// Smooth Scrolling
// ============================================
function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

function initScrollToTopButton() {
    const scrollButton = document.getElementById('scrollToTopBtn');
    if (!scrollButton) return;

    const threshold = 300;
    const toggleScrollButton = () => {
        if (window.scrollY > threshold) {
            scrollButton.classList.add('is-visible');
        } else {
            scrollButton.classList.remove('is-visible');
        }
    };

    window.addEventListener('scroll', toggleScrollButton, { passive: true });
    scrollButton.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    toggleScrollButton();
}

function isProductDetailsPage() {
    if (document.body && document.body.classList.contains('product-page')) {
        return true;
    }
    const path = (window.location.pathname || '').toLowerCase();
    return path === '/product' || path.endsWith('/product') || path.endsWith('/product.html');
}

// ============================================
// Initialize Page
// ============================================
async function init() {
    if (document.body.classList.contains('track-order-page')) {
        initMobileMenu();
        initSmoothScrolling();
        initScrollToTopButton();
        if (!trackOrderPageInitialized) {
            initTrackOrderPage();
        }
        return;
    }

    setProductsLoading(true);

    try {
        await loadProducts();

        if (!products.length) {
            showProductsCatalogLoadError();
            return;
        }

        updateCartBadge();
        initMobileMenu();
        initSmoothScrolling();
        initScrollToTopButton();

        if (isProductDetailsPage()) {
            loadProductDetails();
            return;
        }

        const inStock = getInStockProducts();
        const bestSellers = inStock.filter(p => p.isBestSeller);
        const offers = inStock.filter(p => p.originalPrice > p.price);

        if (bestSellers.length) {
            renderProducts(bestSellers, 'bestSellersGrid');
        }
        if (offers.length) {
            renderProducts(offers, 'offersGrid');
        } else {
            const offersEl = document.getElementById('offers');
            if (offersEl) {
                offersEl.style.display = 'none';
            }
            document.querySelector('a[href="#offers"]')?.closest('li')?.remove();
        }
        renderProducts(inStock, 'productsGrid');
        renderOutOfStockSection();

        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                filterButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                filterProducts(this.dataset.filter);
            });
        });
    } finally {
        setProductsLoading(false);
    }
}

function applyOutOfStockProductActions(product) {
    const outOfStock = isOutOfStock(product);
    const notice = document.getElementById('productOutOfStockNotice');
    const addBtn = document.getElementById('addToCart');
    const orderBtn = document.getElementById('orderNowBtn');

    if (notice) {
        notice.classList.toggle('hidden', !outOfStock);
    }

    [addBtn, orderBtn].forEach((btn) => {
        if (!btn) return;
        btn.disabled = outOfStock;
        btn.setAttribute('aria-disabled', outOfStock ? 'true' : 'false');
        btn.classList.toggle('btn--unavailable', outOfStock);
    });
}

function addToCart(product) {
    if (!product) return;
    if (isOutOfStock(product)) {
        applyOutOfStockProductActions(product);
        return;
    }

    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    const existing = cart.find(item => item.id === product.id);

    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.images[0],
            weight: product.weight || '',
            quantity: 1,
            isDeliveryFree: normalizeIsDeliveryFree(product.isDeliveryFree)
        });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartBadge();
}

function updateCartBadge() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    $('.cart-count').text(totalQty);
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

function scheduleAppInit() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}

window.headerReady
    .then(() => {
        console.log('Header loaded - updating cart badge');
    })
    .catch((err) => {
        console.warn('Header load failed; continuing without header:', err);
    })
    .finally(scheduleAppInit);

// Render cart items dynamically
function renderCart() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const $cartItems = $('#cartItems');
    const $cartSummary = $('#cartSummary');
    
    if (cart.length === 0) {
        $cartItems.html(`
            <div class="empty-cart">
                <div class="empty-cart-icon" aria-hidden="true">
                    <img src="/public/images/cart.png" alt="" class="empty-cart-icon-image">
                </div>
                <p>Your cart is empty</p>
                <button onclick="window.location.href='/'">Continue Shopping</button>
            </div>
        `);
        clearDeliveryDetails();
        resetCartCheckoutFlow();
        $('#cartStageItemsFooter').hide();
        $('#cartCheckoutSteps').addClass('hidden');
        $cartSummary.show();
        return;
    }

    const html = cart.map(item => `
        <div class="cart-item" data-id="${item.id}">
            <img src="${item.image}" alt="${item.name}">
            <div class="cart-info">
                <p class="product-name">${item.name}</p>
                <div class="product-details">
                    <div class="quantity-controls">
                        <button class="quantity-btn" data-id="${item.id}" data-change="-1">−</button>
                        <span class="quantity-display">${item.quantity}</span>
                        <button class="quantity-btn" data-id="${item.id}" data-change="1">+</button>
                    </div>
                    <span class="detail-badge price">Rs. ${(item.price * item.quantity).toLocaleString()}</span>
                    <span class="detail-badge">Rs. ${item.price.toLocaleString()} each</span>
                </div>
            </div>
            <div class="cart-actions">
                <button type="button" class="remove-btn" data-id="${item.id}" aria-label="Remove ${item.name} from cart">
                    <svg class="remove-btn__icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M3 6h18"/>
                        <path d="M8 6V4h8v2"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                        <path d="M10 11v6"/>
                        <path d="M14 11v6"/>
                    </svg>
                    <span class="remove-btn__label">Remove</span>
                </button>
            </div>
        </div>
    `).join('');
    
    $cartItems.html(html);
    $('#cartStageItemsFooter').show();
    $('#cartCheckoutSteps').removeClass('hidden');
    $cartSummary.show();
    setCartCheckoutStage(cartCheckoutStage);
    refreshCartSummaryState(cart);
}

function updateSummary(cart) {
    const stored = loadPaymentSummaryFromStorage('cart');
    if (stored) {
        applyBackendSummaryToHiddenFields(stored, 'cart');
        return;
    }
    const subtotal = computeOrderSubtotal(cart);
    $('#subtotal').text(formatPrice(subtotal));
    $('#shipping').text('—');
    $('#total').text(formatPrice(subtotal));
}

function getDeliveryTypeFieldMarkup(hiddenInputId, labelId) {
    return `
        <div class="cart-form-group cart-form-group--delivery-type">
            <span id="${labelId}">Delivery Type</span>
            <input type="hidden" id="${hiddenInputId}" value="">
            <div class="delivery-type-options" role="group" aria-labelledby="${labelId}">
                <label class="delivery-type-option">
                    <input type="checkbox" class="delivery-type-checkbox" value="Courier" data-delivery-type-target="#${hiddenInputId}">
                    <span class="delivery-type-option__text">Courier</span>
                </label>
                <label class="delivery-type-option">
                    <input type="checkbox" class="delivery-type-checkbox" value="Cash on delivery" data-delivery-type-target="#${hiddenInputId}">
                    <span class="delivery-type-option__text">Cash on delivery</span>
                </label>
            </div>
        </div>
    `;
}

function resetDeliveryTypeCheckboxes(hiddenInputId) {
    const hiddenInput = document.getElementById(hiddenInputId);
    if (hiddenInput) {
        hiddenInput.value = '';
    }
    document.querySelectorAll(`.delivery-type-checkbox[data-delivery-type-target="#${hiddenInputId}"]`)
        .forEach((checkbox) => {
            checkbox.checked = false;
        });
}

function getDeliveryDetails() {
    return {
        deliveryType: String($('#deliveryType').val() || '').trim(),
        customerName: String($('#deliveryCustomerName').val() || '').trim(),
        addressLine1: String($('#deliveryAddress1').val() || '').trim(),
        addressLine2: String($('#deliveryAddress2').val() || '').trim(),
        district: String($('#deliveryDistrict').val() || '').trim(),
        whatsappNumber: String($('#deliveryWhatsAppNumber').val() || '').trim(),
        otherPhoneNumber: String($('#deliveryOtherPhoneNumber').val() || '').trim()
    };
}

function getBuyNowDeliveryDetails() {
    return {
        deliveryType: String($('#buyNowDeliveryType').val() || '').trim(),
        customerName: String($('#buyNowCustomerName').val() || '').trim(),
        addressLine1: String($('#buyNowAddress1').val() || '').trim(),
        addressLine2: String($('#buyNowAddress2').val() || '').trim(),
        district: String($('#buyNowDistrict').val() || '').trim(),
        whatsappNumber: String($('#buyNowWhatsAppNumber').val() || '').trim(),
        otherPhoneNumber: String($('#buyNowOtherPhoneNumber').val() || '').trim()
    };
}

function normalizePhoneNumber(value) {
    return String(value || '').replace(/\D/g, '');
}

function validatePhoneNumbers(whatsAppNumber, otherPhoneNumber) {
    const whatsApp = normalizePhoneNumber(whatsAppNumber);
    const otherPhone = normalizePhoneNumber(otherPhoneNumber);

    if (!whatsApp || !otherPhone) {
        return { valid: false, message: 'Please enter both WhatsApp and other phone numbers.' };
    }
    if (whatsApp.length !== ORDER_PHONE_DIGIT_LENGTH || otherPhone.length !== ORDER_PHONE_DIGIT_LENGTH) {
        return { valid: false, message: `Phone numbers must be exactly ${ORDER_PHONE_DIGIT_LENGTH} digits (e.g. 0771234567).` };
    }
    if (whatsApp === otherPhone) {
        return { valid: false, message: 'WhatsApp number and other phone number cannot be the same.' };
    }
    return { valid: true, message: '' };
}

function setPhoneValidationUI(config, details, force = false) {
    const $whatsAppInput = $(config.whatsAppSelector);
    const $otherInput = $(config.otherSelector);
    const $error = $(config.errorSelector);
    const whatsAppDigits = normalizePhoneNumber(details.whatsappNumber);
    const otherDigits = normalizePhoneNumber(details.otherPhoneNumber);
    const touched = Boolean(whatsAppDigits || otherDigits);

    if (!force && !touched) {
        $error.text('').addClass('hidden');
        $whatsAppInput.removeClass('is-invalid');
        $otherInput.removeClass('is-invalid');
        return { valid: false, message: '' };
    }

    const result = validatePhoneNumbers(whatsAppDigits, otherDigits);
    if (result.valid) {
        $error.text('').addClass('hidden');
        $whatsAppInput.removeClass('is-invalid');
        $otherInput.removeClass('is-invalid');
    } else {
        $error.text(result.message).removeClass('hidden');
        $whatsAppInput.addClass('is-invalid');
        $otherInput.addClass('is-invalid');
    }
    return result;
}

function hasValidCustomerName(details) {
    const name = String(details?.customerName || '').trim();
    return name.length >= 2;
}

function hasDeliveryDetails(details = getDeliveryDetails()) {
    return Boolean(
        details.deliveryType &&
        hasValidCustomerName(details) &&
        details.addressLine1 &&
        details.district &&
        details.whatsappNumber &&
        details.otherPhoneNumber
    );
}

function hasValidOrderPhones(details) {
    if (!details) return false;
    const w = normalizePhoneNumber(details.whatsappNumber);
    const o = normalizePhoneNumber(details.otherPhoneNumber);
    if (!w || !o) return false;
    return validatePhoneNumbers(w, o).valid;
}

/** Delivery fields filled and WhatsApp / other phone pass format rules (shown totals + checkout). */
function isCartOrderSummaryUnlocked(details = getDeliveryDetails()) {
    return hasDeliveryDetails(details) && hasValidOrderPhones(details);
}

function ensureBuyNowPopup() {
    const existing = document.getElementById('buyNowDeliveryPopup');
    if (existing && !document.getElementById('buyNowPopupPanel')) {
        existing.remove();
        document.getElementById('buyNowOverlay')?.remove();
    }
    if (document.getElementById('buyNowDeliveryPopup')) return;
    const districtOptions = SRI_LANKA_DISTRICTS
        .map((district) => `<option value="${district}">${district}</option>`)
        .join('');

    const modalMarkup = `
        <div class="buy-now-popup hidden" id="buyNowDeliveryPopup" role="dialog" aria-modal="true" aria-labelledby="buyNowPopupTitle">
            <div class="buy-now-popup__backdrop" id="buyNowPopupBackdrop"></div>
            <div class="buy-now-popup__panel" id="buyNowPopupPanel" role="document">
                <div class="buy-now-popup__header">
                    <h2 id="buyNowPopupTitle">Buy Now</h2>
                    <button type="button" class="close-btn buy-now-popup__close" id="buyNowPopupClose" aria-label="Close buy now checkout">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div class="cart-checkout-body buy-now-popup__body" id="buyNowCheckoutBody">
                    <div class="checkout-steps hidden" id="buyNowCheckoutSteps" aria-label="Checkout progress">
                        <span class="checkout-steps__item checkout-steps__item--active" data-step="items">Product</span>
                        <span class="checkout-steps__item" data-step="delivery">Delivery</span>
                        <span class="checkout-steps__item" data-step="payment">Payment</span>
                    </div>

                    <div class="cart-stage-view" id="buyNowStageItems">
                        <div class="cart-stage-view__scroll" id="buyNowItemsScroll">
                            <div id="buyNowStageProductContent"></div>
                        </div>
                        <div class="cart-stage-view__footer" id="buyNowStageItemsFooter">
                            <button type="button" class="checkout-btn checkout-btn--primary" id="buyNowEnterDeliveryBtn">Enter delivery details</button>
                        </div>
                    </div>

                    <div class="cart-stage-view hidden" id="buyNowStageDelivery">
                        <div class="cart-stage-view__scroll" id="buyNowDeliveryScroll">
                            <button type="button" class="checkout-stage-back" id="buyNowBackToProduct" aria-label="Back to product">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                                Back to product
                            </button>
                            <form id="buyNowDeliveryForm" class="cart-delivery-form">
                            <label class="cart-form-group cart-form-group--customer-name">
                                <span>Full name</span>
                                <input type="text" id="buyNowCustomerName" name="customerName" autocomplete="name" inputmode="text" placeholder="Your full name" required maxlength="120">
                            </label>
                            <label class="cart-form-group cart-form-group--address1">
                                <span>Address Line 1</span>
                                <input type="text" id="buyNowAddress1" placeholder="House no, street" required>
                            </label>
                            <label class="cart-form-group cart-form-group--address2">
                                <span>Address Line 2 <span class="field-optional">(optional)</span></span>
                                <input type="text" id="buyNowAddress2" placeholder="Area / city">
                            </label>
                            <div class="checkout-form-row checkout-form-row--phones">
                            <label class="cart-form-group cart-form-group--whatsapp">
                                <span>WhatsApp Number</span>
                                <input type="tel" id="buyNowWhatsAppNumber" inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="0771234567" required>
                            </label>
                            <label class="cart-form-group cart-form-group--other-phone">
                                <span>Other Phone Number</span>
                                <input type="tel" id="buyNowOtherPhoneNumber" inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="0712345678" required>
                            </label>
                            </div>
                            <p class="cart-phone-error hidden" id="buyNowPhoneError" role="alert" aria-live="polite"></p>
                            <div class="checkout-form-row checkout-form-row--type-district">
                            ${getDeliveryTypeFieldMarkup('buyNowDeliveryType', 'buyNowDeliveryTypeLabel')}
                            <label class="cart-form-group cart-form-group--district">
                                <span>District</span>
                                <select id="buyNowDistrict" required>
                                    ${districtOptions}
                                </select>
                            </label>
                            </div>
                            </form>
                        </div>
                        <div class="cart-stage-view__footer">
                            <button type="button" class="checkout-btn checkout-btn--secondary" id="buyNowViewPaymentSummaryBtn" disabled aria-label="View payment summary">
                                View payment summary
                            </button>
                        </div>
                    </div>

                    <div class="cart-stage-view hidden" id="buyNowStagePayment">
                        <div class="cart-stage-view__scroll" id="buyNowPaymentScroll">
                            <button type="button" class="checkout-stage-back" id="buyNowBackToDelivery" aria-label="Back to delivery details">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
                                Back to delivery
                            </button>
                            <div class="checkout-payment-summary" id="buyNowPaymentSummary" aria-live="polite"></div>
                            <div class="price-preview-data visually-hidden" aria-hidden="true">
                                <span id="buyNowSubtotal">Rs. 0</span>
                                <span id="buyNowShipping">Rs. 0</span>
                                <span id="buyNowTotal">Rs. 0</span>
                            </div>
                        </div>
                        <div class="cart-stage-view__footer checkout-stage-actions">
                            <button type="button" class="checkout-stage-btn checkout-stage-btn--cancel" id="buyNowPaymentCancel">Cancel</button>
                            <button type="button" class="checkout-btn checkout-btn--primary" id="buyNowCheckoutBtn">Buy now</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalMarkup);
}

function openBuyNowPopup(product) {
    if (!product) return;
    if (isOutOfStock(product)) {
        applyOutOfStockProductActions(product);
        return;
    }
    ensureBuyNowPopup();

    const popup = document.getElementById('buyNowDeliveryPopup');
    if (!popup) return;

    popup.classList.remove('hidden');
    document.body.classList.add('buy-now-popup-open');
    popup.dataset.productId = String(product.id);

    resetBuyNowCheckoutFlow();
    renderBuyNowProductStage();
    renderBuyNowPricePreview();
}

function closeBuyNowPopup() {
    const popup = document.getElementById('buyNowDeliveryPopup');
    if (!popup) return;

    popup.classList.add('hidden');
    document.body.classList.remove('buy-now-popup-open');
    popup.dataset.productId = '';

    const form = document.getElementById('buyNowDeliveryForm');
    form?.reset();
    resetDeliveryTypeCheckboxes('buyNowDeliveryType');
    $('#buyNowPhoneError').text('').addClass('hidden');
    wasBuyNowPricePreviewComplete = false;
    resetBuyNowCheckoutFlow();
}

function ensureOrderFeedbackPopup() {
    if (document.getElementById('orderFeedbackPopup')) return;

    const popupMarkup = `
        <div class="order-feedback-popup hidden" id="orderFeedbackPopup" role="dialog" aria-modal="true" aria-labelledby="orderFeedbackTitle">
            <div class="order-feedback-popup__backdrop" id="orderFeedbackBackdrop"></div>
            <div class="order-feedback-popup__panel" role="document">
                <div class="order-feedback-popup__header">
                    <h3 id="orderFeedbackTitle">Order Update</h3>
                    <button type="button" class="order-feedback-popup__close" id="orderFeedbackClose" aria-label="Close order update popup">&times;</button>
                </div>
                <div class="order-feedback-popup__message" id="orderFeedbackMessage"></div>
                <div class="order-feedback-popup__actions" id="orderFeedbackActions">
                    <button type="button" class="order-feedback-popup__btn" id="orderFeedbackOk">OK</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupMarkup);
}

function restoreOrderFeedbackPopupChrome() {
    const ok = document.getElementById('orderFeedbackOk');
    const closeBtn = document.getElementById('orderFeedbackClose');
    const actionsEl = document.getElementById('orderFeedbackActions');
    const popup = document.getElementById('orderFeedbackPopup');
    ok?.classList.remove('hidden');
    closeBtn?.classList.remove('hidden');
    actionsEl?.classList.remove('hidden');
    if (popup) {
        delete popup.dataset.receiptDownloadUrl;
    }
}

function configureOrderSuccessPopupActions(downloadUrl) {
    const ok = document.getElementById('orderFeedbackOk');
    const closeBtn = document.getElementById('orderFeedbackClose');
    const actionsEl = document.getElementById('orderFeedbackActions');
    const popup = document.getElementById('orderFeedbackPopup');
    const url = String(downloadUrl || '').trim();
    if (!popup) return;

    closeBtn?.classList.add('hidden');

    if (url) {
        popup.dataset.receiptDownloadUrl = url;
        ok?.classList.add('hidden');
        actionsEl?.classList.add('hidden');
    } else {
        delete popup.dataset.receiptDownloadUrl;
        ok?.classList.remove('hidden');
        actionsEl?.classList.remove('hidden');
    }
}

function triggerOrderReceiptDownload(downloadUrl) {
    const url = String(downloadUrl || '').trim();
    if (!url) {
        return Promise.resolve(false);
    }

    const saveBlob = (blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = 'fasa-order-receipt.pdf';
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    };

    return fetch(url)
        .then((res) => {
            if (!res.ok) {
                throw new Error('download failed');
            }
            return res.blob();
        })
        .then((blob) => {
            saveBlob(blob);
            return true;
        })
        .catch(() => {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'fasa-order-receipt.pdf';
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            return true;
        });
}

function closeOrderFeedbackPopup() {
    const popup = document.getElementById('orderFeedbackPopup');
    if (!popup) return;
    popup.classList.add('hidden');
    popup.querySelector('.order-feedback-popup__panel')?.classList.remove('order-feedback-popup__panel--success');
    const titleEl = document.getElementById('orderFeedbackTitle');
    if (titleEl) {
        titleEl.textContent = 'Order Update';
        titleEl.classList.remove('visually-hidden');
    }
    restoreOrderFeedbackPopupChrome();
}

function ensurePendingOrderConfirmPopup() {
    if (document.getElementById('pendingOrderConfirmPopup')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div class="order-feedback-popup hidden" id="pendingOrderConfirmPopup" role="dialog" aria-modal="true" aria-labelledby="pendingOrderConfirmTitle">
            <div class="order-feedback-popup__backdrop" id="pendingOrderConfirmBackdrop"></div>
            <div class="order-feedback-popup__panel order-feedback-popup__panel--confirm" role="document">
                <div class="order-feedback-popup__message order-feedback-popup__message--flush" id="pendingOrderConfirmMessage"></div>
                <div class="order-feedback-popup__actions order-feedback-popup__actions--split">
                    <button type="button" class="order-feedback-popup__btn order-feedback-popup__btn--secondary" id="pendingOrderConfirmCancel">Keep existing order</button>
                    <button type="button" class="order-feedback-popup__btn" id="pendingOrderConfirmReplace">Replace with new order</button>
                </div>
            </div>
        </div>
    `);
}

function closePendingOrderConfirmPopup() {
    const popup = document.getElementById('pendingOrderConfirmPopup');
    if (!popup) return;
    popup.classList.add('hidden');
    $(document).off('keydown.pendingOrderConfirm');
}

/**
 * Shows a confirmation when the API reports an existing pending order for the same customer.
 * @param {string} message Server message (shown as plain text in a paragraph).
 * @param {number|null|undefined} existingOrderId Optional order id for display.
 * @param {function(): void} onAccept User chose to replace the pending order with the new cart.
 */
function showPendingOrderReplaceConfirm(message, existingOrderId, onAccept) {
    ensurePendingOrderConfirmPopup();
    const popup = document.getElementById('pendingOrderConfirmPopup');
    const messageEl = document.getElementById('pendingOrderConfirmMessage');
    if (!popup || !messageEl) return;

    pendingOrderReplaceAcceptHandler = typeof onAccept === 'function' ? onAccept : null;

    messageEl.innerHTML = buildPendingOrderConfirmModalHtml(message, existingOrderId);

    popup.classList.remove('hidden');

    $(document).off('keydown.pendingOrderConfirm').on('keydown.pendingOrderConfirm', (e) => {
        if (e.key === 'Escape') {
            pendingOrderReplaceAcceptHandler = null;
            closePendingOrderConfirmPopup();
        }
    });

    const replaceBtn = document.getElementById('pendingOrderConfirmReplace');
    replaceBtn?.focus();
}

function handleSuccessfulOrderSubmit(response, context) {
    if (response && response.status === ORDER_STATUS_UPDATE_PENDING_FAILED) {
        showApiResponsePopup(response.message || 'We could not update your previous order. Please try again.');
        return;
    }
    const serverMessage = response?.message || 'Order submitted successfully.';
    showOrderSuccessPopup(serverMessage, response);
    if (context.mode === 'cart') {
        clearPaymentSummaryCache('cart');
        localStorage.removeItem('cart');
        renderCart();
        updateCartBadge();
        closeCartPanel();
    } else if (context.mode === 'buyNow') {
        clearPaymentSummaryCache('buyNow');
        closeBuyNowPopup();
    }
}

function handleOrderSubmitFailure(xhr, items, deliveryDetails, context = 'cart') {
    const waText = buildOrderWhatsAppText(items, deliveryDetails, context, xhr);
    openWhatsAppOrderFallback(waText);
    showApiResponsePopup(ORDER_FAIL_WHATSAPP_USER_MESSAGE);
}

function getBuyNowItemFromPopup() {
    const popup = document.getElementById('buyNowDeliveryPopup');
    if (!popup) return null;

    const productId = Number(popup.dataset.productId);
    if (!productId) return null;

    const product = products.find((p) => Number(p.id) === productId);
    if (!product) return null;

    return {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        weight: product.weight || '',
        quantity: 1,
        isDeliveryFree: normalizeIsDeliveryFree(product.isDeliveryFree)
    };
}

function refreshBuyNowSummaryState() {
    const deliveryDetails = getBuyNowDeliveryDetails();
    const unlocked = Boolean(getBuyNowItemFromPopup()) && isCartOrderSummaryUnlocked(deliveryDetails);
    const wasUnlocked = wasBuyNowPricePreviewComplete;
    const storedSummary = loadPaymentSummaryFromStorage('buyNow');

    $('#buyNowViewPaymentSummaryBtn').prop('disabled', !unlocked);
    $('#buyNowCheckoutBtn').prop('disabled', !storedSummary);

    if (unlocked) {
        const item = getBuyNowItemFromPopup();
        if (buyNowCheckoutStage === CHECKOUT_STAGES.PAYMENT && storedSummary && item) {
            const panel = document.getElementById('buyNowPaymentSummary');
            if (panel) {
                panel.innerHTML = buildInlinePaymentSummaryHtml([item], deliveryDetails, storedSummary, 'buyNow');
            }
        }
        if (!wasUnlocked && buyNowCheckoutStage === CHECKOUT_STAGES.DELIVERY) {
            scrollBuyNowPreviewActionsIntoView();
        }
    }

    wasBuyNowPricePreviewComplete = unlocked;
}

function renderBuyNowPricePreview() {
    refreshBuyNowSummaryState();
}

function updateBuyNowSubmitButtonState() {
    renderBuyNowPricePreview();
}

function clearDeliveryDetails() {
    resetDeliveryTypeCheckboxes('deliveryType');
    $('#deliveryCustomerName').val('');
    $('#deliveryAddress1').val('');
    $('#deliveryAddress2').val('');
    $('#deliveryWhatsAppNumber').val('');
    $('#deliveryOtherPhoneNumber').val('');
    $('#deliveryDistrict').val('');
    $('#deliveryPhoneError').text('').addClass('hidden');
    wasCartOrderSummaryUnlocked = false;
    resetCartCheckoutFlow();
}

function scrollCartSummaryToBottom() {
    const scrollEl = document.getElementById('cartDeliveryScroll') || document.getElementById('cartItemsScroll');
    if (!scrollEl) return;
    requestAnimationFrame(() => {
        scrollEl.scrollTo({
            top: scrollEl.scrollHeight,
            behavior: 'smooth'
        });
    });
}

function scrollBuyNowPreviewActionsIntoView() {
    const scrollEl = document.getElementById('buyNowDeliveryScroll');
    if (!scrollEl) return;
    requestAnimationFrame(() => {
        scrollEl.scrollTo({
            top: scrollEl.scrollHeight,
            behavior: 'smooth'
        });
    });
}

let cartPhoneScrollDebounceTimer = null;

function scrollCartPanelToward(selector) {
    const panel = document.getElementById('cartDeliveryScroll') || document.getElementById('cartItemsScroll');
    const target = document.querySelector(selector);
    if (!panel || !target) return;
    requestAnimationFrame(() => {
        panel.scrollTo({
            top: Math.max(0, target.offsetTop - 8),
            behavior: 'smooth'
        });
    });
}

function scheduleScrollCartToPhoneFieldsIfNeeded() {
    if (cartPhoneScrollDebounceTimer) clearTimeout(cartPhoneScrollDebounceTimer);
    cartPhoneScrollDebounceTimer = setTimeout(() => {
        cartPhoneScrollDebounceTimer = null;
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        if (!cart.length) return;
        const d = getDeliveryDetails();
        const startedElsewhereWithoutName = !hasValidCustomerName(d) && (
            String(d.addressLine1 || '').trim()
            || String(d.whatsappNumber || '').trim()
            || String(d.otherPhoneNumber || '').trim()
        );
        if (startedElsewhereWithoutName) {
            scrollCartPanelToward('#cartDeliveryForm .cart-form-group--customer-name');
        } else if (hasDeliveryDetails(d) && !hasValidOrderPhones(d)) {
            scrollCartPanelToward('#cartDeliveryForm .cart-form-group--whatsapp');
        }
    }, 450);
}

let buyNowPhoneScrollDebounceTimer = null;

function scrollBuyNowPanelToward(selector) {
    const panel = document.getElementById('buyNowDeliveryScroll')
        || document.getElementById('buyNowItemsScroll')
        || document.getElementById('buyNowPaymentScroll');
    const target = document.querySelector(selector);
    if (!panel || !target) return;
    requestAnimationFrame(() => {
        panel.scrollTo({
            top: Math.max(0, target.offsetTop - 8),
            behavior: 'smooth'
        });
    });
}

function scheduleScrollBuyNowToPhoneFieldsIfNeeded() {
    if (buyNowPhoneScrollDebounceTimer) clearTimeout(buyNowPhoneScrollDebounceTimer);
    buyNowPhoneScrollDebounceTimer = setTimeout(() => {
        buyNowPhoneScrollDebounceTimer = null;
        const d = getBuyNowDeliveryDetails();
        const startedElsewhereWithoutName = !hasValidCustomerName(d) && (
            String(d.addressLine1 || '').trim()
            || String(d.whatsappNumber || '').trim()
            || String(d.otherPhoneNumber || '').trim()
        );
        if (startedElsewhereWithoutName) {
            scrollBuyNowPanelToward('#buyNowDeliveryForm .cart-form-group--customer-name');
        } else if (hasDeliveryDetails(d) && !hasValidOrderPhones(d)) {
            scrollBuyNowPanelToward('#buyNowDeliveryForm .cart-form-group--whatsapp');
        }
    }, 450);
}

function refreshCartSummaryState(cart) {
    const details = getDeliveryDetails();
    const unlocked = isCartOrderSummaryUnlocked(details);
    const wasUnlocked = wasCartOrderSummaryUnlocked;
    const storedSummary = loadPaymentSummaryFromStorage('cart');

    $('#cartViewPaymentSummaryBtn').prop('disabled', !unlocked);
    $('#checkoutBtn').prop('disabled', !storedSummary);

    if (unlocked) {
        if (cartCheckoutStage === CHECKOUT_STAGES.PAYMENT && storedSummary) {
            const panel = document.getElementById('cartPaymentSummary');
            if (panel) {
                panel.innerHTML = buildInlinePaymentSummaryHtml(cart, details, storedSummary, 'cart');
                scrollCartStageToTop(CHECKOUT_STAGES.PAYMENT);
            }
        } else {
            updateSummary(cart);
        }
        if (!wasUnlocked && cartCheckoutStage === CHECKOUT_STAGES.DELIVERY) {
            scrollCartSummaryToBottom();
        }
    }

    wasCartOrderSummaryUnlocked = unlocked;
}

function updateQuantity(id, change) {
    console.log('Updating quantity for item id ' + id + ' by ' + change);
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const item = cart.find(i => i.id === id);
    
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            cart = cart.filter(i => i.id !== id);
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        clearPaymentSummaryCache('cart');
        renderCart();
        updateCartBadge();
    }
}

function removeItem(id) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart = cart.filter(i => i.id !== id);
    localStorage.setItem('cart', JSON.stringify(cart));
    clearPaymentSummaryCache('cart');
    renderCart();
     updateCartBadge();
}

/** Extract numeric order ID from API success message, e.g. "… Order ID: 123456". */
function parseOrderIdFromSuccessMessage(message) {
    const m = String(message || '').match(/Order ID:\s*(\d+)/i);
    return m ? m[1] : '';
}

/** Numeric order id from POST /api/orders response (for receipt download). */
function extractOrderIdFromResponse(response, fallbackMessage) {
    if (response && typeof response === 'object') {
        const keys = ['orderId', 'order_id', 'id'];
        for (const k of keys) {
            const v = response[k];
            if (v != null && String(v).trim()) {
                return String(v).trim();
            }
        }
    }
    return parseOrderIdFromSuccessMessage(fallbackMessage) || '';
}

/** Receipt PDF URL from POST /api/orders response (downloadUrl field). */
function extractDownloadUrlFromResponse(response) {
    if (response && typeof response === 'object') {
        const keys = ['downloadUrl', 'download_url'];
        for (const k of keys) {
            const v = response[k];
            if (v != null && String(v).trim()) {
                const raw = String(v).trim();
                if (/^https?:\/\//i.test(raw)) {
                    return raw;
                }
                try {
                    return new URL(raw, SPRING_BOOT_ORDER_API_URL).href;
                } catch {
                    return raw;
                }
            }
        }
    }
    return '';
}

/**
 * Public lookup value returned by POST /api/orders (order id or dedicated token).
 * Adjust keys if your API uses different field names.
 */
function extractOrderTokenFromResponse(response, fallbackMessage) {
    if (response && typeof response === 'object') {
        const keys = ['orderToken', 'order_token', 'token', 'trackingToken', 'tracking_token', 'publicToken', 'public_token'];
        for (const k of keys) {
            const v = response[k];
            if (v != null && String(v).trim()) {
                return String(v).trim();
            }
        }
        if (response.orderId != null && String(response.orderId).trim()) {
            return String(response.orderId).trim();
        }
        if (response.id != null && String(response.id).trim()) {
            return String(response.id).trim();
        }
    }
    return parseOrderIdFromSuccessMessage(fallbackMessage) || '';
}

function buildOrderPublicStatusUrl(orderToken) {
    const base = SPRING_BOOT_ORDER_API_URL.replace(/\/+$/, '');
    const path = ORDER_PUBLIC_STATUS_PATH.startsWith('/') ? ORDER_PUBLIC_STATUS_PATH : `/${ORDER_PUBLIC_STATUS_PATH}`;
    return `${base}${path}/${encodeURIComponent(String(orderToken || '').trim())}`;
}

function readTrackOrderTokenFromPage() {
    if (typeof window.__FASA_ORDER_TOKEN__ === 'string' && window.__FASA_ORDER_TOKEN__.trim()) {
        return window.__FASA_ORDER_TOKEN__.trim();
    }
    try {
        const raw = new URLSearchParams(window.location.search).get('token');
        if (raw != null && String(raw).trim()) return String(raw).trim();
    } catch {
        /* ignore */
    }
    try {
        const stored = sessionStorage.getItem('fasa_track_token');
        if (stored != null && String(stored).trim()) return String(stored).trim();
    } catch {
        /* ignore */
    }
    return '';
}

function stripTrackOrderTokenFromAddressBar() {
    if (!window.location.search) return;
    const path = window.location.pathname || '/track-order.html';
    const cleanPath = /\/track-order\/?$/i.test(path) ? '/track-order' : path;
    window.history.replaceState(null, document.title, cleanPath + (window.location.hash || ''));
}

async function fetchOrderStatusByToken(orderToken) {
    const url = buildOrderPublicStatusUrl(orderToken);
    console.log('Fetching order status from URL:', url);
    const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
    });
    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            const err = new Error('Invalid JSON from orders API');
            err.status = res.status;
            err.parsererror = true;
            throw err;
        }
    }
    if (!res.ok) {
        const err = new Error(
            data && data.message != null ? String(data.message) : `HTTP ${res.status}`
        );
        err.status = res.status;
        err.responseJSON = data;
        throw err;
    }
    return data;
}

/** User-facing message when GET /public/{token} fails (see initTrackOrderPage). */
function resolveOrderTrackFetchErrorMessage(err) {
    const fromJson = err && err.responseJSON && err.responseJSON.message != null
        ? String(err.responseJSON.message).trim()
        : '';
    if (fromJson) return fromJson;
    if (err && err.message && !err.parsererror) {
        const msg = String(err.message).trim();
        if (msg && !/^HTTP \d+$/i.test(msg)) return msg;
    }
    const status = err && err.status;
    if (status === 404) {
        return 'No order found for that token.';
    }
    if (err && err.parsererror) {
        return 'The server response was not valid JSON. Check that the track-order URL matches your fasa-orders-api public status endpoint.';
    }
    if (!status) {
        return 'Could not reach the orders API (network error or browser blocked the request). If the API is on another host, configure CORS on fasa-orders-api and set SPRING_BOOT_ORDER_API_URL in script.js to the correct base URL.';
    }
    return `Could not load order status (HTTP ${status}). Please try again later.`;
}

/** Pipeline stages shown on the track-order page (matches backend OrderStatus, excluding REJECT). */
const ORDER_PROGRESS_STAGES = [
    { key: 'PENDING', title: 'Order received', hint: 'We have your order.' },
    { key: 'PROCESSING', title: 'Processing', hint: 'Preparing your items.' },
    { key: 'DELIVERED', title: 'Out for delivery', hint: 'On the way to you.' },
    { key: 'DONE', title: 'Completed', hint: 'Delivered and closed.' }
];

function normalizeOrderStatusKey(statusRaw) {
    const s = String(statusRaw || '').trim().toUpperCase();
    if (!s) return 'PENDING';
    if (s === 'REJECT' || s.includes('REJECT')) return 'REJECT';
    if (s === 'PENDING') return 'PENDING';
    if (s === 'PROCESSING') return 'PROCESSING';
    if (s === 'DELIVERED') return 'DELIVERED';
    if (s === 'DONE' || s === 'COMPLETED') return 'DONE';
    const lower = String(statusRaw || '').trim().toLowerCase();
    if (lower === 'pending') return 'PENDING';
    if (lower === 'processing') return 'PROCESSING';
    if (lower === 'delivered') return 'DELIVERED';
    if (lower === 'done') return 'DONE';
    if (lower === 'reject') return 'REJECT';
    return 'PENDING';
}

function orderProgressStageIndex(statusKey) {
    const k = normalizeOrderStatusKey(statusKey);
    if (k === 'REJECT') return -1;
    const idx = ORDER_PROGRESS_STAGES.findIndex((st) => st.key === k);
    return idx >= 0 ? idx : 0;
}

function buildOrderProgressStagesHtml(statusRaw) {
    const norm = normalizeOrderStatusKey(statusRaw);
    if (norm === 'REJECT') {
        return ''
            + '<div class="order-track-reject" role="alert">'
            + '<p class="order-track-reject__title">Order not fulfilled</p>'
            + '<p class="order-track-reject__text">This order was cancelled or could not be completed. Please contact us if you need help.</p>'
            + '</div>';
    }
    const activeIdx = orderProgressStageIndex(norm);
    const allComplete = norm === 'DONE';
    const items = ORDER_PROGRESS_STAGES.map((st, i) => {
        let stateClass = 'order-track-stages__item--upcoming';
        if (allComplete) {
            stateClass = 'order-track-stages__item--done';
        } else if (i < activeIdx) {
            stateClass = 'order-track-stages__item--done';
        } else if (i === activeIdx) {
            stateClass = 'order-track-stages__item--current';
        }
        const isLast = i === ORDER_PROGRESS_STAGES.length - 1;
        const bulletLabel = allComplete || i < activeIdx ? 'Completed' : i === activeIdx ? 'Current step' : 'Upcoming';
        const showCheck = allComplete || i < activeIdx;
        const mark = showCheck
            ? '<span class="order-track-stages__check" aria-hidden="true">✓</span>'
            : `<span class="order-track-stages__num" aria-hidden="true">${i + 1}</span>`;
        const segBefore = i === 0
            ? '<span class="order-track-stages__seg order-track-stages__seg--gap" aria-hidden="true"></span>'
            : '<span class="order-track-stages__seg order-track-stages__seg--before" aria-hidden="true"></span>';
        const segAfter = isLast
            ? '<span class="order-track-stages__seg order-track-stages__seg--gap" aria-hidden="true"></span>'
            : '<span class="order-track-stages__seg order-track-stages__seg--after" aria-hidden="true"></span>';
        return ''
            + `<li class="order-track-stages__item ${stateClass}" style="--st:${i}" role="listitem">`
            + '<div class="order-track-stages__rail" aria-hidden="true">'
            + segBefore
            + `<span class="order-track-stages__bullet" title="${escapeHtml(bulletLabel)}">${mark}</span>`
            + segAfter
            + '</div>'
            + '<div class="order-track-stages__body">'
            + `<strong class="order-track-stages__title">${escapeHtml(st.title)}</strong>`
            + `<span class="order-track-stages__hint">${escapeHtml(st.hint)}</span>`
            + '</div>'
            + '</li>';
    }).join('');
    return `<ol class="order-track-stages" role="list" aria-label="Order progress">${items}</ol>`;
}

function queueOrderStageAnimations(resultContainer) {
    const root = resultContainer && resultContainer.querySelector('.order-track-stages');
    if (!root) return;
    root.classList.remove('order-track-stages--active');
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            root.classList.add('order-track-stages--active');
        });
    });
}

function orderTrackLineItemMarkerKeys() {
    return [
        'quantity', 'qty', 'count', 'itemQuantity', 'item_quantity',
        'productName', 'product_name', 'name', 'title', 'itemName', 'item_name',
        'label', 'productLabel', 'product_label',
        'unitPrice', 'unit_price', 'price', 'itemPrice', 'item_price', 'lineTotal', 'line_total',
        'productId', 'product_id', 'weight'
    ];
}

function objectLooksLikeOrderLineItem(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    const markers = orderTrackLineItemMarkerKeys();
    for (let i = 0; i < markers.length; i++) {
        if (Object.prototype.hasOwnProperty.call(o, markers[i])) return true;
    }
    const prod = o.product ?? o.productEntity ?? o.product_entity;
    if (prod && typeof prod === 'object' && !Array.isArray(prod)) {
        for (let i = 0; i < markers.length; i++) {
            if (Object.prototype.hasOwnProperty.call(prod, markers[i])) return true;
        }
    }
    return false;
}

function discoverOrderLineItemsArray(root) {
    if (!root || typeof root !== 'object') return [];
    let best = [];
    const keys = Object.keys(root);
    for (let i = 0; i < keys.length; i++) {
        const v = root[keys[i]];
        if (!Array.isArray(v) || v.length === 0) continue;
        const first = v.find((x) => x && typeof x === 'object' && !Array.isArray(x));
        if (!first || !objectLooksLikeOrderLineItem(first)) continue;
        if (v.length > best.length) best = v;
    }
    return best;
}

function normalizeOrderTrackItemsArray(d) {
    if (!d || typeof d !== 'object') return [];
    const tryArrays = [
        d.items,
        d.orderItemEntities,
        d.order_item_entities,
        d.orderItemEntityList,
        d.order_item_entity_list,
        d.orderItems,
        d.order_items,
        d.lineItems,
        d.line_items,
        d.orderLines,
        d.order_lines,
        d.cartItems,
        d.cart_items,
        d.productOrderItems,
        d.product_order_items,
        d.items
    ];
    for (let i = 0; i < tryArrays.length; i++) {
        const raw = tryArrays[i];
        if (Array.isArray(raw) && raw.length) return raw;
    }
    const nested = d.order && typeof d.order === 'object' && !Array.isArray(d.order) ? d.order : null;
    if (nested) {
        const inner = normalizeOrderTrackItemsArray(nested);
        if (inner.length) return inner;
    }
    const found = discoverOrderLineItemsArray(d);
    if (found.length) return found;
    if (nested) {
        const found2 = discoverOrderLineItemsArray(nested);
        if (found2.length) return found2;
    }
    return [];
}

function parseFiniteNumber(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function pickOrderLineField(o, keys) {
    if (!o || typeof o !== 'object') return null;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
        const val = o[k];
        if (val == null) continue;
        const s = String(val).trim();
        if (s !== '') return val;
    }
    return null;
}

function resolveOrderLineProductName(it) {
    const direct = pickOrderLineField(it, [
        'productName', 'product_name', 'productTitle', 'product_title',
        'name', 'title', 'itemName', 'item_name', 'label', 'productLabel', 'product_label',
        'description'
    ]);
    if (direct != null) return String(direct).trim();
    const prod = it.product ?? it.productEntity ?? it.product_entity;
    if (prod && typeof prod === 'object' && !Array.isArray(prod)) {
        const pn = pickOrderLineField(prod, ['name', 'title', 'productName', 'product_name']);
        if (pn != null) return String(pn).trim();
    }
    const pid = pickOrderLineField(it, ['productId', 'product_id']);
    if (pid != null) return `Product #${String(pid).trim()}`;
    return '';
}

function formatOrderTrackMoney(amount) {
    const n = parseFiniteNumber(amount);
    if (n == null) return '';
    return `Rs. ${n.toLocaleString()}`;
}

function buildOrderTrackItemsSectionHtml(d) {
    const arr = normalizeOrderTrackItemsArray(d);
    const lis = [];
    for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        if (!it || typeof it !== 'object') continue;
        let title = resolveOrderLineProductName(it);
        const qty = parseFiniteNumber(pickOrderLineField(it, [
            'quantity', 'qty', 'count', 'itemQuantity', 'item_quantity'
        ]));
        const unitNum = parseFiniteNumber(pickOrderLineField(it, [
            'unitPrice', 'unit_price', 'priceEach', 'price_each', 'itemPrice', 'item_price', 'price'
        ]));
        let lineTotal = parseFiniteNumber(pickOrderLineField(it, [
            'lineTotal', 'line_total', 'total', 'subtotal', 'amount', 'lineAmount', 'line_amount'
        ]));
        if (lineTotal == null && qty != null && unitNum != null) {
            lineTotal = qty * unitNum;
        }
        const hasMoney = unitNum != null || lineTotal != null;
        if (!title && (qty != null || hasMoney)) {
            title = 'Item';
        }
        if (!title) continue;
        const detailBits = [];
        if (qty != null && qty > 0) {
            detailBits.push(`Qty ${escapeHtml(String(qty))}`);
        }
        if (unitNum != null) {
            detailBits.push(`${escapeHtml(formatOrderTrackMoney(unitNum))} each`);
        }
        if (lineTotal != null) {
            detailBits.push(`<span class="order-track-items__line-total">${escapeHtml(formatOrderTrackMoney(lineTotal))}</span>`);
        }
        const detailHtml = detailBits.length
            ? `<div class="order-track-items__detail">${detailBits.join(' · ')}</div>`
            : '';
        lis.push(
            `<li class="order-track-items__item" role="listitem">`
            + `<strong class="order-track-items__name">${escapeHtml(title)}</strong>`
            + detailHtml
            + '</li>'
        );
    }
    if (!lis.length) return '';
    return ''
        + '<div class="order-track-items">'
        + '<h3 class="order-track-items__heading">Order items</h3>'
        + '<ul class="order-track-items__list" role="list">'
        + lis.join('')
        + '</ul>'
        + '</div>';
}

function formatOrderStatusResultHtml(data) {
    let d = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const inner = d.data ?? d.result ?? d.body ?? d.payload;
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        d = { ...d, ...inner };
    }
    const status = d.orderStatus ?? d.order_status ?? d.status ?? d.state ?? '';
    const message = d.message != null ? String(d.message) : '';
    const oid = d.orderId ?? d.order_id ?? d.id ?? '';
    const statusStr = String(status).trim();
    const messageStr = message.trim();
    const showMsg = messageStr && messageStr !== statusStr;

    let html = '';
    html += buildOrderProgressStagesHtml(statusStr);

    if (oid !== '' && oid != null) {
        html += `<p class="order-track-result__meta">Order reference: <strong>${escapeHtml(String(oid))}</strong></p>`;
    }
    html += buildOrderTrackItemsSectionHtml(d);
    if (showMsg) {
        html += `<p class="order-track-result__msg">${escapeHtml(messageStr)}</p>`;
    }
    if (!html.trim()) {
        html = '<p>Your order was found, but no status details were returned.</p>';
    }
    return html;
}

function initTrackOrderPage() {
    if (trackOrderPageInitialized) {
        return;
    }

    const bc = document.getElementById('breadcrumbProductName');
    if (bc) {
        bc.textContent = 'Track order';
    }

    const form = document.getElementById('orderTrackForm');
    const input = document.getElementById('orderTrackTokenInput');
    const resultEl = document.getElementById('orderTrackResult');
    if (!form || !input || !resultEl) {
        return;
    }
    trackOrderPageInitialized = true;

    function setResult(html, modClass) {
        resultEl.className = 'order-track-result' + (modClass ? ` order-track-result--${modClass}` : '');
        resultEl.innerHTML = html;
    }

    async function lookup(token) {
        const t = String(token || '').trim();
        if (!t) {
            setResult('<p>Please enter the order token from your confirmation email or screen.</p>', 'error');
            return;
        }
        setResult('<p class="order-track-result__loading">Loading order status…</p>', 'loading');
        try {
            const data = await fetchOrderStatusByToken(t);
            console.log('Order status data received:', data);
            setResult(formatOrderStatusResultHtml(data), 'ok');
            queueOrderStageAnimations(resultEl);
            requestAnimationFrame(() => {
                resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        } catch (err) {
            console.error('Order status fetch failed', err);
            const msg = resolveOrderTrackFetchErrorMessage(err);
            setResult(`<p>${escapeHtml(String(msg))}</p>`, 'error');
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        lookup(input.value);
    });

    const urlToken = readTrackOrderTokenFromPage();
    try {
        sessionStorage.removeItem('fasa_track_token');
    } catch {
        /* ignore */
    }
    if (urlToken) {
        input.value = urlToken;
        window.__FASA_ORDER_TOKEN__ = urlToken;
        if (window.location.search) {
            stripTrackOrderTokenFromAddressBar();
        }
        lookup(urlToken);
    }

    window.FasaTrackOrderLookup = lookup;
}

function bootstrapTrackOrderPage() {
    if (!document.body || !document.body.classList.contains('track-order-page')) {
        return;
    }
    const run = () => initTrackOrderPage();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
}

bootstrapTrackOrderPage();

function formatBusinessWhatsAppDisplay() {
    const d = normalizePhoneNumber(FASA_ORDERS_WHATSAPP_PHONE);
    if (d.startsWith('94') && d.length === 11) {
        return `0${d.slice(2)}`;
    }
    return d || FASA_ORDERS_WHATSAPP_PHONE;
}

function buildWhatsAppInquiryUrl(orderId) {
    const line1 = 'Hello, I have a question about my order.';
    const line2 = orderId ? `Order ID: ${orderId}` : 'Please find my order details from my last message.';
    const text = `${line1}\n${line2}`;
    return `https://wa.me/${FASA_ORDERS_WHATSAPP_PHONE}?text=${encodeURIComponent(text)}`;
}

async function copyTextToClipboard(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
        /* fall through */
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        textarea.remove();
    }
}

function buildOrderSuccessModalHtml(config) {
    const {
        serverMessage,
        orderId,
        orderToken,
        downloadUrl,
        waUrl,
        displayPhone
    } = config;
    const primary = String(serverMessage || 'Order submitted successfully.');
    const reference = orderId || orderToken;
    const refLabel = orderId ? 'Order ID' : 'Order reference';

    const refBlock = reference
        ? `<div class="order-confirm-modal__ref-card">
            <div class="order-confirm-modal__ref-main">
                <span class="order-confirm-modal__ref-label">${escapeHtml(refLabel)}</span>
                <strong class="order-confirm-modal__ref-value">${escapeHtml(reference)}</strong>
            </div>
            <button type="button" class="order-confirm-modal__copy-btn" data-copy-text="${escapeHtml(reference)}" aria-label="Copy order reference">Copy</button>
        </div>`
        : '';

    const serverNote = primary && !/order submitted successfully/i.test(primary)
        ? `<p class="order-confirm-modal__server-note">${escapeHtml(primary)}</p>`
        : '';

    const receiptBlock = downloadUrl
        ? `<div class="order-confirm-modal__card order-confirm-modal__card--receipt">
            <div class="order-confirm-modal__card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
            </div>
            <div class="order-confirm-modal__card-body">
                <h4 class="order-confirm-modal__card-title">Your receipt</h4>
                <p class="order-confirm-modal__card-text">Download your PDF receipt for your records.</p>
                <button type="button" class="order-confirm-modal__download-btn" id="orderFeedbackDownloadReceipt">
                    <svg class="order-confirm-modal__download-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
                    Download receipt (PDF)
                </button>
            </div>
        </div>`
        : `<div class="order-confirm-modal__card order-confirm-modal__card--notice">
            <p class="order-confirm-modal__card-text">Your receipt is being prepared. Save your order reference above and contact us on WhatsApp if you need a copy.</p>
        </div>`;

    return ''
        + '<div class="order-confirm-modal order-confirm-modal--success" role="status">'
        + '<div class="order-confirm-modal__hero">'
        + '<div class="order-confirm-modal__check" aria-hidden="true">'
        + '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
        + '</div>'
        + '<h4 class="order-confirm-modal__headline" id="orderFeedbackTitleVisible">Order confirmed!</h4>'
        + '<p class="order-confirm-modal__tagline">Thank you — we have received your order.</p>'
        + '</div>'
        + refBlock
        + serverNote
        + receiptBlock
        + '<div class="order-confirm-modal__support">'
        + '<p class="order-confirm-modal__support-label">Questions about your order?</p>'
        + `<a class="order-confirm-modal__wa-link" href="${escapeHtml(waUrl)}" target="_blank" rel="noopener noreferrer">`
        + '<span class="order-confirm-modal__wa-icon" aria-hidden="true">'
        + '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>'
        + '</span>'
        + `Message us on WhatsApp (${escapeHtml(displayPhone)})`
        + '</a>'
        + '</div>'
        + '</div>';
}

function buildPendingOrderConfirmModalHtml(message, existingOrderId) {
    const idBlock = existingOrderId != null && String(existingOrderId).length
        ? `<div class="order-confirm-modal__ref-card order-confirm-modal__ref-card--warning">
            <span class="order-confirm-modal__ref-label">Existing order ID</span>
            <strong class="order-confirm-modal__ref-value">${escapeHtml(String(existingOrderId))}</strong>
        </div>`
        : '';

    return ''
        + '<div class="order-confirm-modal order-confirm-modal--pending">'
        + '<div class="order-confirm-modal__hero order-confirm-modal__hero--warning">'
        + '<div class="order-confirm-modal__warn-icon" aria-hidden="true">!</div>'
        + '<h4 class="order-confirm-modal__headline" id="pendingOrderConfirmTitle">Pending order found</h4>'
        + '<p class="order-confirm-modal__tagline">You already have an order waiting to be processed.</p>'
        + '</div>'
        + `<p class="order-confirm-modal__message">${escapeHtml(String(message || ''))}</p>`
        + idBlock
        + '<div class="order-confirm-modal__notice">'
        + '<strong>Replace previous order?</strong>'
        + '<p>Choosing <em>Replace previous order</em> will cancel your existing pending order and submit this new cart instead.</p>'
        + '</div>'
        + '</div>';
}

function stripOrderConfirmLegacyTrackUi(container) {
    if (!container) return;
    container.querySelectorAll(
        '.order-confirm-modal__track, .order-feedback-popup__track-row'
    ).forEach((el) => el.remove());
    container.querySelectorAll('a, button').forEach((el) => {
        const label = (el.textContent || '').trim();
        const copyTarget = el.getAttribute('data-copy-text') || '';
        if (label === 'Track order status' || label === 'Copy link' || copyTarget.includes('/track-order')) {
            el.remove();
        }
    });
}

/** After successful checkout: receipt download (tracking link is on the receipt). */
function showOrderSuccessPopup(serverMessage, apiResponse = null) {
    ensureOrderFeedbackPopup();
    const popup = document.getElementById('orderFeedbackPopup');
    const messageEl = document.getElementById('orderFeedbackMessage');
    const titleEl = document.getElementById('orderFeedbackTitle');
    const panelEl = popup?.querySelector('.order-feedback-popup__panel');
    if (!popup || !messageEl) return;

    const primary = String(serverMessage || 'Order submitted successfully.');
    const orderId = extractOrderIdFromResponse(apiResponse, primary);
    const orderToken = extractOrderTokenFromResponse(apiResponse, primary);
    const downloadUrl = extractDownloadUrlFromResponse(apiResponse);
    const waUrl = buildWhatsAppInquiryUrl(orderId || orderToken);
    const displayPhone = formatBusinessWhatsAppDisplay();

    if (titleEl) {
        titleEl.textContent = 'Order confirmed';
        titleEl.classList.add('visually-hidden');
    }
    panelEl?.classList.add('order-feedback-popup__panel--success');

    messageEl.innerHTML = buildOrderSuccessModalHtml({
        serverMessage: primary,
        orderId,
        orderToken,
        downloadUrl,
        waUrl,
        displayPhone
    });
    stripOrderConfirmLegacyTrackUi(messageEl);

    configureOrderSuccessPopupActions(downloadUrl);
    popup.classList.remove('hidden');
}

function showApiResponsePopup(message) {
    ensureOrderFeedbackPopup();
    const popup = document.getElementById('orderFeedbackPopup');
    const messageEl = document.getElementById('orderFeedbackMessage');
    const titleEl = document.getElementById('orderFeedbackTitle');
    if (!popup || !messageEl) return;

    if (titleEl) {
        titleEl.textContent = 'Order Update';
        titleEl.classList.remove('visually-hidden');
    }
    popup.querySelector('.order-feedback-popup__panel')?.classList.remove('order-feedback-popup__panel--success');
    restoreOrderFeedbackPopupChrome();
    messageEl.textContent = String(message || 'Request completed.');
    popup.classList.remove('hidden');
}

function buildOrderWhatsAppText(items, deliveryDetails, context = 'cart', xhr) {
    const safeItems = Array.isArray(items) ? items : [];
    const prices = getPriceOverridesFromStorage(context);
    const orderPrice = prices?.orderPrice ?? computeOrderSubtotal(safeItems);
    const deliveryPrice = prices?.deliveryPrice;
    let apiNote = '';
    if (xhr) {
        const msg = xhr.responseJSON?.message || xhr.statusText || '';
        const short = String(msg).replace(/\s+/g, ' ').trim().slice(0, 120);
        apiNote = short || (xhr.status ? `HTTP ${xhr.status}` : 'Network or server error');
    }
    const lines = [];
    lines.push('*New order — Fasa Products website*');
    if (apiNote) lines.push(`_Online checkout failed: ${apiNote}_`);
    lines.push('');
    lines.push('*Items*');
    safeItems.forEach((item) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const lineTotal = Number(item.price) * qty;
        lines.push(`• ${item.name}`);
        lines.push(`  Qty: ${qty} × Rs. ${Number(item.price).toLocaleString()} = Rs. ${lineTotal.toLocaleString()}`);
    });
    lines.push('');
    lines.push('*Delivery*');
    const d = deliveryDetails || {};
    lines.push(`Customer: ${String(d.customerName || '').trim() || '-'}`);
    lines.push(`Type: ${d.deliveryType || '-'}`);
    lines.push(`Address line 1: ${d.addressLine1 || '-'}`);
    if (String(d.addressLine2 || '').trim()) {
        lines.push(`Address line 2: ${d.addressLine2}`);
    }
    lines.push(`District: ${d.district || '-'}`);
    lines.push(`WhatsApp: ${d.whatsappNumber || '-'}`);
    lines.push(`Other phone: ${d.otherPhoneNumber || '-'}`);
    lines.push('');
    lines.push('*Totals*');
    lines.push(`Subtotal: Rs. ${Number(orderPrice).toLocaleString()}`);
    if (Number.isFinite(Number(deliveryPrice))) {
        lines.push(`Shipping: Rs. ${Number(deliveryPrice).toLocaleString()}`);
        const grand = Number((Number(orderPrice) + Number(deliveryPrice)).toFixed(2));
        lines.push(`*Total: Rs. ${grand.toLocaleString()}*`);
    } else {
        lines.push('Shipping: (from server payment summary)');
        lines.push(`*Subtotal: Rs. ${Number(orderPrice).toLocaleString()}*`);
    }
    lines.push('');
    lines.push('Please confirm this order. Thank you.');
    let text = lines.join('\n');
    const maxLen = 3500;
    if (text.length > maxLen) {
        text = `${text.slice(0, maxLen - 80)}\n\n…(message trimmed — please confirm items by phone if needed)`;
    }
    return text;
}

function openWhatsAppOrderFallback(text) {
    const digits = normalizePhoneNumber(FASA_ORDERS_WHATSAPP_PHONE);
    if (!digits || digits.length < 9) {
        showApiResponsePopup('Could not open WhatsApp. Please message us on WhatsApp manually to place your order.');
        return;
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win || win.closed) {
        window.location.href = url;
    }
}

function ensureOrderLoadingOverlay() {
    if (document.getElementById('orderLoadingOverlay')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div id="orderLoadingOverlay" class="order-loading-overlay hidden" role="status" aria-live="polite" aria-busy="false" aria-hidden="true">
            <div class="order-loading-overlay__card">
                <div class="order-loading-overlay__spinner" aria-hidden="true">
                    <span class="order-loading-overlay__ring"></span>
                    <img src="${CART_LOADING_ICON_SRC}" alt="" class="order-loading-overlay__cart-icon" width="44" height="44">
                </div>
                <p class="order-loading-overlay__text">Submitting your order…</p>
            </div>
        </div>
    `);
}

/** Full-viewport curtain + cart spinner; optionally disables primary submit button(s). */
function setOrderSubmitLoading(loading, $buttons = null) {
    ensureOrderLoadingOverlay();
    const overlay = document.getElementById('orderLoadingOverlay');
    if (overlay) {
        if (loading) {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-busy', 'true');
            overlay.setAttribute('aria-hidden', 'false');
        } else {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-busy', 'false');
            overlay.setAttribute('aria-hidden', 'true');
        }
    }
    document.body.classList.toggle('order-submit-loading-open', Boolean(loading));
    if ($buttons && $buttons.length) {
        $buttons.prop('disabled', Boolean(loading));
    }
}

function submitOrderToSpringBoot(items, deliveryDetails = null, context = 'cart', submitOptions = null) {
    const safeItems = Array.isArray(items) ? items : [];
    const prices = getPriceOverridesFromStorage(context);
    if (!prices) {
        return $.Deferred().reject({
            status: 0,
            statusText: 'Payment summary not loaded',
            responseJSON: { message: 'Please view payment summary to load prices before placing your order.' }
        }).promise();
    }
    const opts = submitOptions && typeof submitOptions === 'object' ? submitOptions : {};
    const payload = {
        orderSource: 'website',
        placedAt: new Date().toISOString(),
        orderPrice: prices.orderPrice,
        deliveryPrice: prices.deliveryPrice,
        items: safeItems.map((item) => buildOrderItemPayload(item)),
        deliveryDetails: deliveryDetails || null,
        replacePendingOrder: Boolean(opts.replacePendingOrder)
    };

    return $.ajax({
        url: SPRING_BOOT_ORDER_API_URL,
        method: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify(payload)
    });
}

function checkout() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];

    if (cart.length === 0) {
        showApiResponsePopup('Your cart is empty!');
        return;
    }

    const deliveryDetails = getDeliveryDetails();
    const phoneValidation = setPhoneValidationUI(
        {
            whatsAppSelector: '#deliveryWhatsAppNumber',
            otherSelector: '#deliveryOtherPhoneNumber',
            errorSelector: '#deliveryPhoneError'
        },
        deliveryDetails,
        true
    );
    if (!isCartOrderSummaryUnlocked(deliveryDetails)) {
        if (!hasDeliveryDetails(deliveryDetails)) {
            showApiResponsePopup('Please enter your full name (at least 2 characters), delivery details, WhatsApp number, other phone number, and district before checkout.');
        } else {
            showApiResponsePopup(phoneValidation.message || `Please enter valid, different WhatsApp and other phone numbers (exactly ${ORDER_PHONE_DIGIT_LENGTH} digits each).`);
        }
        if (!hasValidCustomerName(deliveryDetails)) {
            scrollCartPanelToward('#cartDeliveryForm .cart-form-group--customer-name');
        } else {
            scheduleScrollCartToPhoneFieldsIfNeeded();
        }
        return;
    }

    if (!getPriceOverridesFromStorage('cart')) {
        showApiResponsePopup('Please view payment summary to load prices before placing your order.');
        setCartCheckoutStage(CHECKOUT_STAGES.DELIVERY);
        return;
    }

    const $checkoutBtn = $('#checkoutBtn');
    setOrderSubmitLoading(true, $checkoutBtn);
    submitOrderToSpringBoot(cart, deliveryDetails, 'cart')
        .done((response) => {
            if (response && response.status === ORDER_STATUS_CONFIRM_PENDING) {
                showPendingOrderReplaceConfirm(
                    response.message,
                    response.existingOrderId,
                    () => {
                        setOrderSubmitLoading(true, $checkoutBtn);
                        submitOrderToSpringBoot(cart, deliveryDetails, 'cart', { replacePendingOrder: true })
                            .done((r2) => {
                                handleSuccessfulOrderSubmit(r2, { mode: 'cart' });
                            })
                            .fail((xhr) => {
                                handleOrderSubmitFailure(xhr, cart, deliveryDetails, 'cart');
                            })
                            .always(() => {
                                setOrderSubmitLoading(false, $checkoutBtn);
                                const cartAfter = JSON.parse(localStorage.getItem('cart')) || [];
                                if (cartAfter.length) {
                                    refreshCartSummaryState(cartAfter);
                                } else {
                                    $('#checkoutBtn').prop('disabled', true);
                                }
                            });
                    }
                );
                return;
            }
            handleSuccessfulOrderSubmit(response, { mode: 'cart' });
        })
        .fail((xhr) => {
            handleOrderSubmitFailure(xhr, cart, deliveryDetails, 'cart');
        })
        .always(() => {
            setOrderSubmitLoading(false, $checkoutBtn);
            const cartAfter = JSON.parse(localStorage.getItem('cart')) || [];
            if (cartAfter.length) {
                refreshCartSummaryState(cartAfter);
            } else {
                $('#checkoutBtn').prop('disabled', true);
            }
        });
}

function submitBuyNowOrder() {
    const popup = document.getElementById('buyNowDeliveryPopup');
    if (!popup) return;

    const productId = Number(popup.dataset.productId);
    const product = products.find((p) => Number(p.id) === productId);
    if (!product) {
        closeBuyNowPopup();
        return;
    }

    const deliveryDetails = getBuyNowDeliveryDetails();
    const phoneValidation = setPhoneValidationUI(
        {
            whatsAppSelector: '#buyNowWhatsAppNumber',
            otherSelector: '#buyNowOtherPhoneNumber',
            errorSelector: '#buyNowPhoneError'
        },
        deliveryDetails,
        true
    );
    if (!isCartOrderSummaryUnlocked(deliveryDetails)) {
        if (!hasDeliveryDetails(deliveryDetails)) {
            showApiResponsePopup('Please enter your full name (at least 2 characters), delivery details, WhatsApp number, other phone number, and district.');
        } else {
            showApiResponsePopup(phoneValidation.message || `Please enter valid, different WhatsApp and other phone numbers (exactly ${ORDER_PHONE_DIGIT_LENGTH} digits each).`);
        }
        if (!hasValidCustomerName(deliveryDetails)) {
            scrollBuyNowPanelToward('#buyNowDeliveryForm .cart-form-group--customer-name');
        } else {
            scheduleScrollBuyNowToPhoneFieldsIfNeeded();
        }
        setBuyNowCheckoutStage(CHECKOUT_STAGES.DELIVERY);
        return;
    }

    const buyNowItem = getBuyNowItemFromPopup();
    if (!buyNowItem) {
        closeBuyNowPopup();
        return;
    }

    if (!getPriceOverridesFromStorage('buyNow')) {
        showApiResponsePopup('Please view payment summary to load prices before placing your order.');
        setBuyNowCheckoutStage(CHECKOUT_STAGES.DELIVERY);
        return;
    }

    const $submitButton = $('#buyNowCheckoutBtn');
    setOrderSubmitLoading(true, $submitButton);
    submitOrderToSpringBoot([buyNowItem], deliveryDetails, 'buyNow')
        .done((response) => {
            if (response && response.status === ORDER_STATUS_CONFIRM_PENDING) {
                showPendingOrderReplaceConfirm(
                    response.message,
                    response.existingOrderId,
                    () => {
                        setOrderSubmitLoading(true, $submitButton);
                        submitOrderToSpringBoot([buyNowItem], deliveryDetails, 'buyNow', { replacePendingOrder: true })
                            .done((r2) => {
                                handleSuccessfulOrderSubmit(r2, { mode: 'buyNow' });
                            })
                            .fail((xhr) => {
                                handleOrderSubmitFailure(xhr, [buyNowItem], deliveryDetails, 'buyNow');
                            })
                            .always(() => {
                                setOrderSubmitLoading(false, $submitButton);
                                updateBuyNowSubmitButtonState();
                            });
                    }
                );
                return;
            }
            handleSuccessfulOrderSubmit(response, { mode: 'buyNow' });
        })
        .fail((xhr) => {
            handleOrderSubmitFailure(xhr, [buyNowItem], deliveryDetails, 'buyNow');
        })
        .always(() => {
            setOrderSubmitLoading(false, $submitButton);
            updateBuyNowSubmitButtonState();
        });
}

$(document).ready(function() {

    $(document).off('click', '#pendingOrderConfirmReplace').on('click', '#pendingOrderConfirmReplace', function () {
        const popup = document.getElementById('pendingOrderConfirmPopup');
        if (!popup || popup.classList.contains('hidden')) return;
        const fn = pendingOrderReplaceAcceptHandler;
        pendingOrderReplaceAcceptHandler = null;
        closePendingOrderConfirmPopup();
        if (typeof fn === 'function') {
            fn();
        }
    });

    $(document).off('click', '#pendingOrderConfirmCancel, #pendingOrderConfirmBackdrop').on('click', '#pendingOrderConfirmCancel, #pendingOrderConfirmBackdrop', function () {
        const popup = document.getElementById('pendingOrderConfirmPopup');
        if (!popup || popup.classList.contains('hidden')) return;
        pendingOrderReplaceAcceptHandler = null;
        closePendingOrderConfirmPopup();
    });

    $(document).off('click', '#addToCart').on('click', '#addToCart', function() {
        if (this.disabled) return;
        const id = $(this).data('id');
        trackProductCtaGa4('addToCart', id);
        const product = products.find(p => p.id === id);
        addToCart(product);
    });

    $(document).off('click', '#cartToggle').on('click', '#cartToggle', function() {
        console.log('Cart icon clicked');
        resetCartCheckoutFlow();
        renderCart();
        $('#cartSidepanel').addClass('active');
        $('#cartOverlay').addClass('active');
    });

    $(document).off('click', '#cartClose').on('click', '#cartClose', function(event) {
        event.preventDefault();
        closeCartPanel();
    });

    $(document).off('click', '#cartOverlay').on('click', '#cartOverlay', function() {
        closeCartPanel();
    });

    $(document).off('click', '.quantity-btn').on('click', '.quantity-btn', function() {
        const id = Number($(this).data('id'));
        const change = Number($(this).data('change'));
        updateQuantity(id, change);
    });

    $(document).off('click', '.remove-btn').on('click', '.remove-btn', function() {
        const id = Number($(this).data('id'));
        removeItem(id);
    });

    $(document).off('click', '#checkoutBtn').on('click', '#checkoutBtn', function() {
        checkout();
    });

    $(document).off('click', '#cartEnterDeliveryBtn').on('click', '#cartEnterDeliveryBtn', function() {
        setCartCheckoutStage(CHECKOUT_STAGES.DELIVERY);
        document.getElementById('deliveryCustomerName')?.focus();
    });

    $(document).off('click', '#cartBackToItems').on('click', '#cartBackToItems', function() {
        setCartCheckoutStage(CHECKOUT_STAGES.ITEMS);
    });

    $(document).off('click', '#cartBackToDelivery').on('click', '#cartBackToDelivery', function() {
        clearPaymentSummaryCache('cart');
        setCartCheckoutStage(CHECKOUT_STAGES.DELIVERY);
    });

    $(document).off('click', '#cartViewPaymentSummaryBtn').on('click', '#cartViewPaymentSummaryBtn', async function() {
        if (this.disabled || paymentSummaryLoading) return;
        if (!validateCartDeliveryForSummary()) return;
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const deliveryDetails = getDeliveryDetails();
        await loadPaymentSummaryAndShow({
            items: cart,
            deliveryDetails,
            panelId: 'cartPaymentSummary',
            setStageFn: setCartCheckoutStage,
            context: 'cart',
            scrollTargetId: 'cartPaymentScroll'
        });
    });

    $(document).off('click', '#cartPaymentCancel').on('click', '#cartPaymentCancel', function() {
        closeCartPanel();
    });

    $(document).off('change', '.delivery-type-checkbox').on('change', '.delivery-type-checkbox', function() {
        const targetSelector = this.dataset.deliveryTypeTarget;
        if (!targetSelector) return;
        const $target = $(targetSelector);
        const $group = $(`.delivery-type-checkbox[data-delivery-type-target="${targetSelector}"]`);
        if (this.checked) {
            $group.not(this).prop('checked', false);
            $target.val(this.value).trigger('change');
        } else {
            $target.val('').trigger('change');
        }
    });

    // Keep phone fields numeric-only for clean validation and payload.
    $(document).off('input', '#deliveryWhatsAppNumber, #deliveryOtherPhoneNumber, #buyNowWhatsAppNumber, #buyNowOtherPhoneNumber')
        .on('input', '#deliveryWhatsAppNumber, #deliveryOtherPhoneNumber, #buyNowWhatsAppNumber, #buyNowOtherPhoneNumber', function() {
            this.value = normalizePhoneNumber(this.value).slice(0, ORDER_PHONE_DIGIT_LENGTH);
        });

    //remove previous listeners to prevent duplicates, then add new listeners for delivery details changes
    $(document).off('input change', '#deliveryType, #deliveryCustomerName, #deliveryAddress1, #deliveryAddress2, #deliveryWhatsAppNumber, #deliveryOtherPhoneNumber, #deliveryDistrict')
        .on('input change', '#deliveryType, #deliveryCustomerName, #deliveryAddress1, #deliveryAddress2, #deliveryWhatsAppNumber, #deliveryOtherPhoneNumber, #deliveryDistrict', function() {
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            if (!cart.length) return;
            const currentDetails = getDeliveryDetails();
            clearPaymentSummaryCache('cart');
            setPhoneValidationUI(
                {
                    whatsAppSelector: '#deliveryWhatsAppNumber',
                    otherSelector: '#deliveryOtherPhoneNumber',
                    errorSelector: '#deliveryPhoneError'
                },
                currentDetails
            );
            refreshCartSummaryState(cart);
            scheduleScrollCartToPhoneFieldsIfNeeded();
        });

    $(document).off('click', '#orderNowBtn').on('click', '#orderNowBtn', function() {
        if (this.disabled) return;
        const id = Number($(this).data('id'));
        trackProductCtaGa4('orderNowBtn', id);
        const product = products.find((p) => p.id === id);
        if (!product) return;
        openBuyNowPopup(product);
    });

    $(document).off('click', '#buyNowPopupClose, #buyNowPaymentCancel, #buyNowPopupBackdrop')
        .on('click', '#buyNowPopupClose, #buyNowPaymentCancel, #buyNowPopupBackdrop', function() {
            closeBuyNowPopup();
        });

    $(document).off('click', '#buyNowEnterDeliveryBtn').on('click', '#buyNowEnterDeliveryBtn', function() {
        setBuyNowCheckoutStage(CHECKOUT_STAGES.DELIVERY);
        document.getElementById('buyNowCustomerName')?.focus();
    });

    $(document).off('click', '#buyNowBackToProduct').on('click', '#buyNowBackToProduct', function() {
        setBuyNowCheckoutStage(CHECKOUT_STAGES.ITEMS);
        renderBuyNowProductStage();
    });

    $(document).off('click', '#buyNowBackToDelivery').on('click', '#buyNowBackToDelivery', function() {
        clearPaymentSummaryCache('buyNow');
        setBuyNowCheckoutStage(CHECKOUT_STAGES.DELIVERY);
        refreshBuyNowSummaryState();
    });

    $(document).off('click', '#buyNowViewPaymentSummaryBtn').on('click', '#buyNowViewPaymentSummaryBtn', async function() {
        if (this.disabled || paymentSummaryLoading) return;
        if (!validateBuyNowDeliveryForSummary()) return;
        const item = getBuyNowItemFromPopup();
        if (!item) return;
        const deliveryDetails = getBuyNowDeliveryDetails();
        await loadPaymentSummaryAndShow({
            items: [item],
            deliveryDetails,
            panelId: 'buyNowPaymentSummary',
            setStageFn: setBuyNowCheckoutStage,
            context: 'buyNow',
            scrollTargetId: 'buyNowPaymentScroll'
        });
    });

    $(document).off('submit', '#buyNowDeliveryForm').on('submit', '#buyNowDeliveryForm', function(event) {
        event.preventDefault();
    });

    $(document).off('click', '#buyNowCheckoutBtn').on('click', '#buyNowCheckoutBtn', function() {
        submitBuyNowOrder();
    });

    $(document).off('input change', '#buyNowDeliveryType, #buyNowCustomerName, #buyNowAddress1, #buyNowAddress2, #buyNowWhatsAppNumber, #buyNowOtherPhoneNumber, #buyNowDistrict')
        .on('input change', '#buyNowDeliveryType, #buyNowCustomerName, #buyNowAddress1, #buyNowAddress2, #buyNowWhatsAppNumber, #buyNowOtherPhoneNumber, #buyNowDistrict', function() {
            const currentDetails = getBuyNowDeliveryDetails();
            clearPaymentSummaryCache('buyNow');
            setPhoneValidationUI(
                {
                    whatsAppSelector: '#buyNowWhatsAppNumber',
                    otherSelector: '#buyNowOtherPhoneNumber',
                    errorSelector: '#buyNowPhoneError'
                },
                currentDetails
            );
            refreshBuyNowSummaryState();
            scheduleScrollBuyNowToPhoneFieldsIfNeeded();
        });

    $(document).off('keydown', '#buyNowDeliveryPopup').on('keydown', '#buyNowDeliveryPopup', function(event) {
        if (event.key === 'Escape') {
            closeBuyNowPopup();
        }
    });

    $(document).off('click', '.order-confirm-modal__copy-btn').on('click', '.order-confirm-modal__copy-btn', async function() {
        const text = this.dataset.copyText || '';
        const btn = this;
        const prev = btn.textContent;
        btn.disabled = true;
        const ok = await copyTextToClipboard(text);
        btn.textContent = ok ? 'Copied!' : 'Copy failed';
        setTimeout(() => {
            btn.textContent = prev;
            btn.disabled = false;
        }, 1800);
    });

    $(document).off('click', '#orderFeedbackClose, #orderFeedbackOk, #orderFeedbackBackdrop')
        .on('click', '#orderFeedbackClose, #orderFeedbackOk, #orderFeedbackBackdrop', function() {
            const panel = document.querySelector('#orderFeedbackPopup .order-feedback-popup__panel');
            if (panel?.classList.contains('order-feedback-popup__panel--success')) {
                return;
            }
            closeOrderFeedbackPopup();
        });

    $(document).off('click', '#orderFeedbackDownloadReceipt').on('click', '#orderFeedbackDownloadReceipt', function() {
        const popup = document.getElementById('orderFeedbackPopup');
        const url = popup?.dataset.receiptDownloadUrl || '';
        if (!url) return;

        const btn = this;
        const prevHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<svg class="order-confirm-modal__download-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg> Downloading…';

        triggerOrderReceiptDownload(url).finally(() => {
            closeOrderFeedbackPopup();
            btn.disabled = false;
            btn.innerHTML = prevHtml;
        });
    });

    $(document).off('keydown', '#orderFeedbackPopup').on('keydown', '#orderFeedbackPopup', function(event) {
        if (event.key === 'Escape') {
            const panel = this.querySelector('.order-feedback-popup__panel');
            if (panel?.classList.contains('order-feedback-popup__panel--success')) {
                return;
            }
            closeOrderFeedbackPopup();
        }
    });
});
