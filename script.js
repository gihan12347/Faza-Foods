let products = [];

/** Order API: POST + public GET contract — see reference/fasa-orders-api/README.txt */
const SPRING_BOOT_ORDER_API_URL = 'http://localhost:8082/api/orders';
/** Public read-only status by token (fasa-orders-api GET …/public/{token}). */
const ORDER_PUBLIC_STATUS_PATH = '/public';
/** Business WhatsApp (digits only, country code). Keep in sync with footer wa.me links. */
const FASA_ORDERS_WHATSAPP_PHONE = '94767486675';
/** Digits only, after stripping non-digits (e.g. 0771234567). */
const ORDER_PHONE_DIGIT_LENGTH = 10;
const ORDER_SUBMIT_SPINNER_SRC = '/public/images/cart.gif';
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

const SPECIAL_RATE_DISTRICTS = new Set([
    'ampara',
    'anuradhapura',
    'batticaloa',
    'trincomalee',
    'jaffna'
]);

const SHIPPING_RATES = {
    normal: {
        courier: [500, 650, 800],
        cashOnDelivery: [550, 700, 850]
    },
    special: {
        courier: [550, 700, 850],
        cashOnDelivery: [600, 750, 900]
    }
};

const SRI_LANKA_DISTRICTS = [
    'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle',
    'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle',
    'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Monaragala',
    'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura',
    'Trincomalee', 'Vavuniya'
];

async function loadProducts() {
  try {
    const response = await fetch('/public/products.json');
    if (!response.ok) throw new Error('Failed to load products');

    const data = await response.json();
    products = data.products;

  } catch (error) {
    console.error('Error loading products:', error);
  }
}

// ============================================
// Utility Functions
// ============================================
function formatPrice(price) {
    return `Rs. ${price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
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

// ============================================
// Product Card Component
// ============================================
function createProductCard(product) {
    const originalPrice = Number(product.originalPrice);
    const currentPrice = Number(product.price);

    const discount = (originalPrice > currentPrice)
        ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
        : 0;
    
    return `
        <div class="product-card" data-product-id="${product.id}">
            <div class="product-image-container">
                <img src="${product.image}" alt="${product.name}" class="product-image" loading="lazy">
                ${discount > 0 ? `<div class="product-badge sale">${discount}% OFF</div>` : ''}
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
    let filteredProducts = products;
    
    if (category !== 'all') {
        filteredProducts = products.filter(product => product.category === category);
    }
    
    renderProducts(filteredProducts, 'productsGrid');
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
    
    const product = products.find(p => p.id === productId);
    
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
            </div>
            <p class="product-description-detail">${product.description}</p>
            <div class="product-features">
                <h3>Ingredients</h3>
                <ul>
                    ${featuresHTML}
                </ul>
            </div>
            <div class="product-actions">
                <button type="button" id="addToCart" class="btn btn-primary" data-id="${product.id}">Add to Cart</button>
                <button type="button" id="orderNowBtn" class="btn btn-secondary" data-id="${product.id}" aria-label="Order Now">Order Now</button>
            </div>
        </div>
    `;
    
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
    
    if (toggle && nav) {
        toggle.addEventListener('click', function() {
            nav.classList.toggle('active');
        });
        
        // Close menu when clicking on a link
        const navLinks = nav.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
            });
        });
    }
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

    // Load products data
    await loadProducts();

    // Update cart badge on page load
    updateCartBadge();

    // Initialize mobile menu
    initMobileMenu();
    
    // Initialize smooth scrolling
    initSmoothScrolling();

    // Initialize scroll-to-top button
    initScrollToTopButton();
    
    if (isProductDetailsPage()) {
        loadProductDetails();
        return;
    }

    const bestSellers = products.filter(p => p.isBestSeller);
    const offers = products.filter(p => p.originalPrice > p.price);

    if (bestSellers.length) {
        renderProducts(bestSellers, 'bestSellersGrid');
    }
    if (offers.length) {
        renderProducts(offers, 'offersGrid');
    } else {
        const offersEl = document.getElementById('offers');
        offersEl.style.display = 'none';
        document.querySelector('a[href="#offers"]')?.closest('li')?.remove();
    }
    renderProducts(products, 'productsGrid');

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            filterProducts(this.dataset.filter);
        });
    });
}

function addToCart(product) {
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
            quantity: 1
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
    const $cartTotals = $('#cartTotals');
    
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
        $cartTotals.hide();
        $cartSummary.hide();
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
                <button class="remove-btn" data-id="${item.id}">Remove</button>
            </div>
        </div>
    `).join('');
    
    $cartItems.html(html);
    $cartSummary.show();
    refreshCartSummaryState(cart);
}

function normalizeDistrictName(district) {
    const normalized = String(district || '').trim().toLowerCase();
    if (normalized === 'jaffa') return 'jaffna';
    if (normalized === 'batticallo') return 'batticaloa';
    if (normalized === 'amapara') return 'ampara';
    return normalized;
}

function normalizeDeliveryType(deliveryType) {
    const normalized = String(deliveryType || '').trim().toLowerCase();
    return normalized.includes('cash') ? 'cashOnDelivery' : 'courier';
}

function parseWeightToKg(weightValue) {
    if (typeof weightValue !== 'string') return null;
    const normalized = weightValue.trim().toLowerCase();
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml)$/);
    if (!match) return null;

    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value) || value <= 0) return null;

    return unit === 'kg' ? value : value / 1000;
}

function getProductWeightKgById(productId) {
    const product = products.find((p) => Number(p.id) === Number(productId));
    if (!product) return null;
    return parseWeightToKg(product.weight);
}

function getCartWeightKg(items) {
    const totalWeight = items.reduce((sum, item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const itemWeightKg =
            parseWeightToKg(item.weight) ??
            getProductWeightKgById(item.id) ??
            0;
        return sum + (itemWeightKg * quantity);
    }, 0);

    return Math.max(totalWeight, 0.01);
}

function getShippingFee(items, deliveryDetails) {
    if (!deliveryDetails || !hasDeliveryDetails(deliveryDetails)) {
        return 0;
    }
    const deliveryTypeKey = normalizeDeliveryType(deliveryDetails.deliveryType);

    if (deliveryTypeKey === 'courier' && Array.isArray(items) && items.length === 1) {
        const [item] = items;
        const itemName = String(item?.name || '').trim().toLowerCase();
        const quantity = Math.max(1, Number(item?.quantity) || 1);
        const isHairOil = itemName === 'hair oil' || itemName.includes('hair oil');

        if (isHairOil) {
            return quantity > 1 ? 0 : 250;
        }
    }

    const normalizedDistrict = normalizeDistrictName(deliveryDetails.district);
    const districtGroup = SPECIAL_RATE_DISTRICTS.has(normalizedDistrict) ? 'special' : 'normal';
    const rates = SHIPPING_RATES[districtGroup][deliveryTypeKey] || SHIPPING_RATES[districtGroup].courier;

    const totalWeightKg = getCartWeightKg(items);
    const billableKg = Math.max(1, Math.ceil(totalWeightKg));

    if (billableKg <= 3) {
        return rates[billableKg - 1];
    }

    const perExtraKg = rates[2] - rates[1];
    return rates[2] + ((billableKg - 3) * perExtraKg);
}

function updateSummary(cart, deliveryDetails = getDeliveryDetails()) {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = getShippingFee(cart, deliveryDetails);
    const total = subtotal + shipping;

    $('#subtotal').text('Rs. ' + subtotal.toLocaleString());
    $('#shipping').text(shipping === 0 ? 'Free' : 'Rs. ' + shipping.toLocaleString());
    $('#total').text('Rs. ' + total.toLocaleString());
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
    if (document.getElementById('buyNowDeliveryPopup')) return;
    const districtOptions = SRI_LANKA_DISTRICTS
        .map((district) => `<option value="${district}">${district}</option>`)
        .join('');

    const modalMarkup = `
        <div class="buy-now-popup hidden" id="buyNowDeliveryPopup" role="dialog" aria-modal="true" aria-labelledby="buyNowPopupTitle">
            <div class="buy-now-popup__backdrop" id="buyNowPopupBackdrop"></div>
            <div class="buy-now-popup__panel" role="document">
                <div class="buy-now-popup__header">
                    <h3 id="buyNowPopupTitle">Delivery Details</h3>
                    <button type="button" class="buy-now-popup__close" id="buyNowPopupClose" aria-label="Close delivery details popup">&times;</button>
                </div>
                <p class="buy-now-popup__hint">Enter delivery details to calculate shipping and total price.</p>
                <form id="buyNowDeliveryForm" class="buy-now-popup__form">
                    <label class="buy-now-popup__group buy-now-popup__group--delivery-type">
                        <span>Delivery Type</span>
                        <select id="buyNowDeliveryType" required>
                            <option value="Courier">Courier</option>
                            <option value="Cash on delivery">Cash on delivery</option>
                        </select>
                    </label>
                    <label class="buy-now-popup__group buy-now-popup__group--customer-name">
                        <span>Full name</span>
                        <input type="text" id="buyNowCustomerName" name="customerName" autocomplete="name" inputmode="text" placeholder="Your full name" required maxlength="120">
                    </label>
                    <label class="buy-now-popup__group buy-now-popup__group--address1">
                        <span>Address Line 1</span>
                        <input type="text" id="buyNowAddress1" placeholder="House no, street" required>
                    </label>
                    <label class="buy-now-popup__group buy-now-popup__group--address2">
                        <span>Address Line 2 <span class="field-optional">(optional)</span></span>
                        <input type="text" id="buyNowAddress2" placeholder="Area / city">
                    </label>
                    <label class="buy-now-popup__group buy-now-popup__group--whatsapp">
                        <span>WhatsApp Number</span>
                        <input type="tel" id="buyNowWhatsAppNumber" inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="0771234567" required>
                    </label>
                    <label class="buy-now-popup__group buy-now-popup__group--other-phone">
                        <span>Other Phone Number</span>
                        <input type="tel" id="buyNowOtherPhoneNumber" inputmode="numeric" maxlength="10" autocomplete="tel" placeholder="0712345678" required>
                    </label>
                    <p class="buy-now-popup__phone-error hidden" id="buyNowPhoneError" role="alert" aria-live="polite"></p>
                    <label class="buy-now-popup__group buy-now-popup__group--district">
                        <span>District</span>
                        <select id="buyNowDistrict" required>    
                            ${districtOptions}
                        </select>
                    </label>
                    <div class="buy-now-popup__price-summary hidden" id="buyNowPriceSummary">
                        <div class="buy-now-popup__price-row">
                            <span>Subtotal</span>
                            <span id="buyNowSubtotal">Rs. 0</span>
                        </div>
                        <div class="buy-now-popup__price-row">
                            <span>Shipping</span>
                            <span id="buyNowShipping">Rs. 0</span>
                        </div>
                        <div class="buy-now-popup__price-row buy-now-popup__price-row--total">
                            <span>Total</span>
                            <span id="buyNowTotal">Rs. 0</span>
                        </div>
                    </div>
                    <div class="buy-now-popup__actions">
                        <button type="button" class="buy-now-popup__btn buy-now-popup__btn--ghost" id="buyNowPopupCancel">Cancel</button>
                        <button type="submit" class="buy-now-popup__btn buy-now-popup__btn--primary" disabled>Order Now</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalMarkup);
}

function openBuyNowPopup(product) {
    if (!product) return;
    ensureBuyNowPopup();

    const popup = document.getElementById('buyNowDeliveryPopup');
    if (!popup) return;

    popup.classList.remove('hidden');
    document.body.classList.add('buy-now-popup-open');
    popup.dataset.productId = String(product.id);

    const firstInput = document.getElementById('buyNowDeliveryType');
    firstInput?.focus();
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
    const summary = document.getElementById('buyNowPriceSummary');
    summary?.classList.add('hidden');
    $('#buyNowPhoneError').text('').addClass('hidden');
    wasBuyNowPricePreviewComplete = false;
    updateBuyNowSubmitButtonState();
}

function ensureOrderFeedbackPopup() {
    const existing = document.getElementById('orderFeedbackPopup');
    if (existing && !document.getElementById('orderFeedbackDownloadReceipt')) {
        const actions = existing.querySelector('.order-feedback-popup__actions');
        if (actions) {
            actions.id = 'orderFeedbackActions';
            actions.insertAdjacentHTML('afterbegin', `
                <button type="button" class="order-feedback-popup__btn order-feedback-popup__download-receipt-btn hidden" id="orderFeedbackDownloadReceipt">
                    <span class="order-feedback-popup__download-icon" aria-hidden="true">↓</span>
                    Download receipt (PDF)
                </button>
            `);
        }
    }
    if (existing) return;

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
                    <button type="button" class="order-feedback-popup__btn order-feedback-popup__download-receipt-btn hidden" id="orderFeedbackDownloadReceipt">
                        <span class="order-feedback-popup__download-icon" aria-hidden="true">↓</span>
                        Download receipt (PDF)
                    </button>
                    <button type="button" class="order-feedback-popup__btn" id="orderFeedbackOk">OK</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupMarkup);
}

function restoreOrderFeedbackPopupChrome() {
    const ok = document.getElementById('orderFeedbackOk');
    const downloadBtn = document.getElementById('orderFeedbackDownloadReceipt');
    const closeBtn = document.getElementById('orderFeedbackClose');
    const popup = document.getElementById('orderFeedbackPopup');
    ok?.classList.remove('hidden');
    downloadBtn?.classList.add('hidden');
    closeBtn?.classList.remove('hidden');
    if (downloadBtn) {
        downloadBtn.disabled = false;
    }
    if (popup) {
        delete popup.dataset.receiptDownloadUrl;
    }
}

function configureOrderSuccessPopupActions(downloadUrl) {
    const ok = document.getElementById('orderFeedbackOk');
    const downloadBtn = document.getElementById('orderFeedbackDownloadReceipt');
    const closeBtn = document.getElementById('orderFeedbackClose');
    const popup = document.getElementById('orderFeedbackPopup');
    const url = String(downloadUrl || '').trim();
    if (!popup) return;

    closeBtn?.classList.add('hidden');

    if (url) {
        popup.dataset.receiptDownloadUrl = url;
        ok?.classList.add('hidden');
        downloadBtn?.classList.remove('hidden');
        if (downloadBtn) {
            downloadBtn.disabled = false;
        }
    } else {
        delete popup.dataset.receiptDownloadUrl;
        ok?.classList.remove('hidden');
        downloadBtn?.classList.add('hidden');
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
    }
    restoreOrderFeedbackPopupChrome();
}

function ensurePendingOrderConfirmPopup() {
    if (document.getElementById('pendingOrderConfirmPopup')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div class="order-feedback-popup hidden" id="pendingOrderConfirmPopup" role="dialog" aria-modal="true" aria-labelledby="pendingOrderConfirmTitle">
            <div class="order-feedback-popup__backdrop" id="pendingOrderConfirmBackdrop"></div>
            <div class="order-feedback-popup__panel" role="document">
                <div class="order-feedback-popup__header">
                    <h3 id="pendingOrderConfirmTitle">Pending order</h3>
                </div>
                <div class="order-feedback-popup__message" id="pendingOrderConfirmMessage"></div>
                <div class="order-feedback-popup__actions order-feedback-popup__actions--split">
                    <button type="button" class="order-feedback-popup__btn order-feedback-popup__btn--secondary" id="pendingOrderConfirmCancel">Cancel</button>
                    <button type="button" class="order-feedback-popup__btn" id="pendingOrderConfirmReplace">Replace previous order</button>
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

    const idLine = existingOrderId != null && String(existingOrderId).length
        ? `<p class="pending-order-confirm__id">Existing order ID: <strong>${escapeHtml(String(existingOrderId))}</strong></p>`
        : '';

    messageEl.innerHTML = `<p class="pending-order-confirm__lead">${escapeHtml(String(message || ''))}</p>${idLine}`;

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
        localStorage.removeItem('cart');
        renderCart();
        updateCartBadge();
        $('#cartSidepanel').removeClass('active');
        $('#cartOverlay').removeClass('active');
    } else if (context.mode === 'buyNow') {
        closeBuyNowPopup();
    }
}

function handleOrderSubmitFailure(xhr, items, deliveryDetails, priceOverrides) {
    const waText = buildOrderWhatsAppText(items, deliveryDetails, priceOverrides, xhr);
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
        quantity: 1
    };
}

function renderBuyNowPricePreview() {
    const summary = document.getElementById('buyNowPriceSummary');
    if (!summary) return;

    const item = getBuyNowItemFromPopup();
    const deliveryDetails = getBuyNowDeliveryDetails();

    if (!item || !hasDeliveryDetails(deliveryDetails) || !hasValidOrderPhones(deliveryDetails)) {
        summary.classList.add('hidden');
        wasBuyNowPricePreviewComplete = false;
        updateBuyNowSubmitButtonState();
        return;
    }

    const items = [item];
    const subtotal = items.reduce((sum, cartItem) => sum + (Number(cartItem.price) * (Number(cartItem.quantity) || 1)), 0);
    const shipping = getShippingFee(items, deliveryDetails);
    const total = subtotal + shipping;

    $('#buyNowSubtotal').text(formatPrice(subtotal));
    $('#buyNowShipping').text(formatPrice(shipping));
    $('#buyNowTotal').text(formatPrice(total));
    summary.classList.remove('hidden');
    if (!wasBuyNowPricePreviewComplete) {
        scrollBuyNowPriceSummaryIntoView();
    }
    wasBuyNowPricePreviewComplete = true;
    updateBuyNowSubmitButtonState();
}

function updateBuyNowSubmitButtonState() {
    const btn = document.querySelector('#buyNowDeliveryForm button[type="submit"]');
    if (!btn) return;
    const d = getBuyNowDeliveryDetails();
    btn.disabled = !isCartOrderSummaryUnlocked(d);
}

function clearDeliveryDetails() {
    $('#deliveryType').val('');
    $('#deliveryCustomerName').val('');
    $('#deliveryAddress1').val('');
    $('#deliveryAddress2').val('');
    $('#deliveryWhatsAppNumber').val('');
    $('#deliveryOtherPhoneNumber').val('');
    $('#deliveryDistrict').val('');
    $('#deliveryPhoneError').text('').addClass('hidden');
    wasCartOrderSummaryUnlocked = false;
}

function scrollCartSummaryToBottom() {
    const cartSummaryEl = $('#cartSummary').get(0);
    if (!cartSummaryEl) return;
    requestAnimationFrame(() => {
        cartSummaryEl.scrollTo({
            top: cartSummaryEl.scrollHeight,
            behavior: 'smooth'
        });
    });
}

function scrollBuyNowPriceSummaryIntoView() {
    const panel = document.querySelector('#buyNowDeliveryPopup .buy-now-popup__panel');
    if (!panel) return;
    requestAnimationFrame(() => {
        panel.scrollTo({
            top: panel.scrollHeight,
            behavior: 'smooth'
        });
    });
}

let cartPhoneScrollDebounceTimer = null;

function scrollCartPanelToward(selector) {
    const panel = document.getElementById('cartSummary');
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
    const panel = document.querySelector('#buyNowDeliveryPopup .buy-now-popup__panel');
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
            scrollBuyNowPanelToward('#buyNowDeliveryForm .buy-now-popup__group--customer-name');
        } else if (hasDeliveryDetails(d) && !hasValidOrderPhones(d)) {
            scrollBuyNowPanelToward('#buyNowDeliveryForm .buy-now-popup__group--whatsapp');
        }
    }, 450);
}

function refreshCartSummaryState(cart) {
    const details = getDeliveryDetails();
    const unlocked = isCartOrderSummaryUnlocked(details);
    const wasUnlocked = wasCartOrderSummaryUnlocked;
    const $cartTotals = $('#cartTotals');

    if (unlocked) {
        updateSummary(cart, details);
        $cartTotals.show();
        if (!wasUnlocked) {
            scrollCartSummaryToBottom();
        }
    } else {
        $cartTotals.hide();
    }
    wasCartOrderSummaryUnlocked = unlocked;
    $('#checkoutBtn').prop('disabled', !unlocked);
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
        renderCart();
        updateCartBadge();
    }
}

function removeItem(id) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart = cart.filter(i => i.id !== id);
    localStorage.setItem('cart', JSON.stringify(cart));
    renderCart();
     updateCartBadge();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
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
    }
    panelEl?.classList.add('order-feedback-popup__panel--success');

    const receiptMissingNote = !downloadUrl
        ? '<p class="order-feedback-popup__receipt-missing">Receipt is not ready yet. Please save your order reference and contact us on WhatsApp if you need a copy.</p>'
        : '';

    messageEl.innerHTML = ''
        + '<div class="order-feedback-popup__success" role="status">'
        + '<div class="order-feedback-popup__success-badge" aria-hidden="true">✓</div>'
        + '<p class="order-feedback-popup__success-headline">Thank you — we have your order!</p>'
        + `<p class="order-feedback-popup__msg-primary">${escapeHtml(primary)}</p>`
        + '<div class="order-feedback-popup__receipt-card">'
        + '<p class="order-feedback-popup__receipt-hint">'
        + 'Download and keep your receipt for your records. '
        + '<strong>Use the link in your receipt to see your order status</strong> — '
        + 'open the PDF anytime and tap that link for live delivery progress.'
        + '</p>'
        + receiptMissingNote
        + '</div>'
        + '<p class="order-feedback-popup__success-footer">'
        + 'Questions about your order? '
        + `<a class="order-feedback-popup__wa-link" href="${escapeHtml(waUrl)}" target="_blank" rel="noopener noreferrer">Message us on WhatsApp (${escapeHtml(displayPhone)})</a>`
        + '</p>'
        + '</div>';

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
    }
    popup.querySelector('.order-feedback-popup__panel')?.classList.remove('order-feedback-popup__panel--success');
    restoreOrderFeedbackPopupChrome();
    messageEl.textContent = String(message || 'Request completed.');
    popup.classList.remove('hidden');
}

function computeOrderPrices(items, deliveryDetails) {
    const safeItems = Array.isArray(items) ? items : [];
    const orderPrice = safeItems.reduce((sum, item) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        return sum + (Number(item.price) * qty);
    }, 0);
    const deliveryPrice = getShippingFee(safeItems, deliveryDetails);
    return {
        orderPrice: Number(orderPrice.toFixed(2)),
        deliveryPrice: Number(deliveryPrice.toFixed(2))
    };
}

/**
 * Resolves order subtotal + shipping for POST /api/orders (orderPrice, deliveryPrice).
 * When cart or buy-now summary is visible, uses those amounts so the request matches the UI.
 */
function resolvePricesForBackend(items, deliveryDetails, priceOverrides = null) {
    const computed = computeOrderPrices(items, deliveryDetails);
    if (priceOverrides
        && Number.isFinite(Number(priceOverrides.orderPrice))
        && Number.isFinite(Number(priceOverrides.deliveryPrice))) {
        return {
            orderPrice: Number(Number(priceOverrides.orderPrice).toFixed(2)),
            deliveryPrice: Number(Number(priceOverrides.deliveryPrice).toFixed(2))
        };
    }
    return computed;
}

function buildOrderWhatsAppText(items, deliveryDetails, priceOverrides, xhr) {
    const safeItems = Array.isArray(items) ? items : [];
    const prices = resolvePricesForBackend(safeItems, deliveryDetails, priceOverrides);
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
    lines.push(`Subtotal: Rs. ${prices.orderPrice.toLocaleString()}`);
    lines.push(`Shipping: Rs. ${prices.deliveryPrice.toLocaleString()}`);
    const grand = Number((prices.orderPrice + prices.deliveryPrice).toFixed(2));
    lines.push(`*Total: Rs. ${grand.toLocaleString()}*`);
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
                <img src="${ORDER_SUBMIT_SPINNER_SRC}" alt="" class="order-loading-overlay__gif" width="88" height="88">
                <p class="order-loading-overlay__text">Submitting your order…</p>
            </div>
        </div>
    `);
}

/** Full-viewport curtain + cart gif; optionally disables primary submit button(s). */
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

function submitOrderToSpringBoot(items, deliveryDetails = null, priceOverrides = null, submitOptions = null) {
    const safeItems = Array.isArray(items) ? items : [];
    const prices = resolvePricesForBackend(safeItems, deliveryDetails, priceOverrides);
    const opts = submitOptions && typeof submitOptions === 'object' ? submitOptions : {};
    const payload = {
        orderSource: 'website',
        placedAt: new Date().toISOString(),
        orderPrice: prices.orderPrice,
        deliveryPrice: prices.deliveryPrice,
        items: safeItems.map((item) => ({
            id: Number(item.id),
            name: item.name,
            price: Number(item.price),
            quantity: Math.max(1, Number(item.quantity) || 1),
            weight: item.weight || ''
        })),
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

    let priceOverrides = null;
    const $totals = $('#cartTotals');
    if ($totals.length && $totals.is(':visible')) {
        const orderFromUi = parseDisplayedRsAmount($('#subtotal').text());
        const shipFromUi = parseDisplayedRsAmount($('#shipping').text());
        if (orderFromUi !== null && shipFromUi !== null) {
            priceOverrides = { orderPrice: orderFromUi, deliveryPrice: shipFromUi };
        }
    }

    const $checkoutBtn = $('#checkoutBtn');
    setOrderSubmitLoading(true, $checkoutBtn);
    submitOrderToSpringBoot(cart, deliveryDetails, priceOverrides)
        .done((response) => {
            if (response && response.status === ORDER_STATUS_CONFIRM_PENDING) {
                showPendingOrderReplaceConfirm(
                    response.message,
                    response.existingOrderId,
                    () => {
                        setOrderSubmitLoading(true, $checkoutBtn);
                        submitOrderToSpringBoot(cart, deliveryDetails, priceOverrides, { replacePendingOrder: true })
                            .done((r2) => {
                                handleSuccessfulOrderSubmit(r2, { mode: 'cart' });
                            })
                            .fail((xhr) => {
                                handleOrderSubmitFailure(xhr, cart, deliveryDetails, priceOverrides);
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
            handleOrderSubmitFailure(xhr, cart, deliveryDetails, priceOverrides);
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
        const id = $(this).data('id');
        trackProductCtaGa4('addToCart', id);
        const product = products.find(p => p.id === id);
        addToCart(product);
    });

    $(document).off('click', '#cartToggle').on('click', '#cartToggle', function() {
        console.log('Cart icon clicked');
        renderCart();
        $('#cartSidepanel').addClass('active');
        $('#cartOverlay').addClass('active');
    });

    $(document).off('click', '#cartClose').on('click', '#cartClose', function() {
        $('#cartSidepanel').removeClass('active');
        $('#cartOverlay').removeClass('active');
    });

    $(document).off('click', '#cartOverlay').on('click', '#cartOverlay', function() {
        $('#cartSidepanel').removeClass('active');
        $('#cartOverlay').removeClass('active');
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
        const id = Number($(this).data('id'));
        trackProductCtaGa4('orderNowBtn', id);
        const product = products.find((p) => p.id === id);
        if (!product) return;
        openBuyNowPopup(product);
    });

    $(document).off('click', '#buyNowPopupClose, #buyNowPopupCancel, #buyNowPopupBackdrop')
        .on('click', '#buyNowPopupClose, #buyNowPopupCancel, #buyNowPopupBackdrop', function() {
            closeBuyNowPopup();
        });

    $(document).off('submit', '#buyNowDeliveryForm').on('submit', '#buyNowDeliveryForm', function(event) {
        event.preventDefault();
        const $submitButton = $(this).find('button[type="submit"]');

        const popup = document.getElementById('buyNowDeliveryPopup');
        if (!popup) {
            return;
        }

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
                scrollBuyNowPanelToward('#buyNowDeliveryForm .buy-now-popup__group--customer-name');
            } else {
                scheduleScrollBuyNowToPhoneFieldsIfNeeded();
            }
            return;
        }

        const buyNowItem = {
            id: product.id,
            name: product.name,
            price: Number(product.price),
            weight: product.weight || '',
            quantity: 1
        };

        let buyNowPriceOverrides = null;
        const $buySummary = $('#buyNowPriceSummary');
        if ($buySummary.length && !$buySummary.hasClass('hidden')) {
            const orderFromUi = parseDisplayedRsAmount($('#buyNowSubtotal').text());
            const shipFromUi = parseDisplayedRsAmount($('#buyNowShipping').text());
            if (orderFromUi !== null && shipFromUi !== null) {
                buyNowPriceOverrides = { orderPrice: orderFromUi, deliveryPrice: shipFromUi };
            }
        }

        setOrderSubmitLoading(true, $submitButton);
        submitOrderToSpringBoot([buyNowItem], deliveryDetails, buyNowPriceOverrides)
            .done((response) => {
                if (response && response.status === ORDER_STATUS_CONFIRM_PENDING) {
                    showPendingOrderReplaceConfirm(
                        response.message,
                        response.existingOrderId,
                        () => {
                            setOrderSubmitLoading(true, $submitButton);
                            submitOrderToSpringBoot([buyNowItem], deliveryDetails, buyNowPriceOverrides, { replacePendingOrder: true })
                                .done((r2) => {
                                    handleSuccessfulOrderSubmit(r2, { mode: 'buyNow' });
                                })
                                .fail((xhr) => {
                                    handleOrderSubmitFailure(xhr, [buyNowItem], deliveryDetails, buyNowPriceOverrides);
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
                handleOrderSubmitFailure(xhr, [buyNowItem], deliveryDetails, buyNowPriceOverrides);
            })
            .always(() => {
                setOrderSubmitLoading(false, $submitButton);
                updateBuyNowSubmitButtonState();
            });
    });

    $(document).off('input change', '#buyNowDeliveryType, #buyNowCustomerName, #buyNowAddress1, #buyNowAddress2, #buyNowWhatsAppNumber, #buyNowOtherPhoneNumber, #buyNowDistrict')
        .on('input change', '#buyNowDeliveryType, #buyNowCustomerName, #buyNowAddress1, #buyNowAddress2, #buyNowWhatsAppNumber, #buyNowOtherPhoneNumber, #buyNowDistrict', function() {
            const currentDetails = getBuyNowDeliveryDetails();
            setPhoneValidationUI(
                {
                    whatsAppSelector: '#buyNowWhatsAppNumber',
                    otherSelector: '#buyNowOtherPhoneNumber',
                    errorSelector: '#buyNowPhoneError'
                },
                currentDetails
            );
            renderBuyNowPricePreview();
            scheduleScrollBuyNowToPhoneFieldsIfNeeded();
        });

    $(document).off('keydown', '#buyNowDeliveryPopup').on('keydown', '#buyNowDeliveryPopup', function(event) {
        if (event.key === 'Escape') {
            closeBuyNowPopup();
        }
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
        btn.innerHTML = 'Downloading…';

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
