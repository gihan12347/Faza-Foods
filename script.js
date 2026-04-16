import { getReviews } from "./review.js";

let products = [];

/** WhatsApp checkout: digits only, country code + number (e.g. 94740633345 for 074 063 3345). */
const WHATSAPP_ORDER_NUMBER = '94740633345';
let lastWhatsAppOpenAt = 0;
let wasDeliveryDetailsComplete = false;

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
                '<p class="related-products__empty">No other products in this category yet. <a href="index.html#products">Browse the full catalog</a>.</p>';
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
                <button type="button" id="buyNowWhatsApp" class="btn btn-secondary" data-id="${product.id}" aria-label="Order this product on WhatsApp">Buy Now</button>
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

// ============================================
// Initialize Page
// ============================================
async function init() {
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
    
    // Check if we're on the product details page
    if (window.location.pathname.endsWith('/product')) {
        loadProductDetails();
    } else {
        // Load products on index page
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
        
        // Initialize filter buttons
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Update active state
                filterButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                
                // Filter products
                const filter = this.dataset.filter;
                filterProducts(filter);
            });
        });
    }
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

window.headerReady.then(() => {
    console.log('Header loaded - updating cart badge');
    if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
});

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
                <button onclick="window.location.href='index.html'">Continue Shopping</button>
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
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(kg|g)$/);
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
            1;
        return sum + (itemWeightKg * quantity);
    }, 0);

    return Math.max(totalWeight, 0.01);
}

function getShippingFee(items, deliveryDetails) {
    if (!deliveryDetails || !hasDeliveryDetails(deliveryDetails)) {
        return 0;
    }

    const normalizedDistrict = normalizeDistrictName(deliveryDetails.district);
    const districtGroup = SPECIAL_RATE_DISTRICTS.has(normalizedDistrict) ? 'special' : 'normal';
    const deliveryTypeKey = normalizeDeliveryType(deliveryDetails.deliveryType);
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
        addressLine1: String($('#deliveryAddress1').val() || '').trim(),
        addressLine2: String($('#deliveryAddress2').val() || '').trim(),
        district: String($('#deliveryDistrict').val() || '').trim()
    };
}

function getBuyNowDeliveryDetails() {
    return {
        deliveryType: String($('#buyNowDeliveryType').val() || '').trim(),
        addressLine1: String($('#buyNowAddress1').val() || '').trim(),
        addressLine2: String($('#buyNowAddress2').val() || '').trim(),
        district: String($('#buyNowDistrict').val() || '').trim()
    };
}

function hasDeliveryDetails(details = getDeliveryDetails()) {
    return Boolean(
        details.deliveryType &&
        details.addressLine1 &&
        details.addressLine2 &&
        details.district
    );
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
                    <label class="buy-now-popup__group">
                        <span>Delivery Type</span>
                        <select id="buyNowDeliveryType" required>
                            <option value="Courier">Courier</option>
                            <option value="Cash on delivery">Cash on delivery</option>
                        </select>
                    </label>
                    <label class="buy-now-popup__group">
                        <span>Address Line 1</span>
                        <input type="text" id="buyNowAddress1" placeholder="House no, street" required>
                    </label>
                    <label class="buy-now-popup__group">
                        <span>Address Line 2</span>
                        <input type="text" id="buyNowAddress2" placeholder="Area / city" required>
                    </label>
                    <label class="buy-now-popup__group">
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
                        <button type="submit" class="buy-now-popup__btn buy-now-popup__btn--primary">Send to WhatsApp</button>
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

    if (!item || !hasDeliveryDetails(deliveryDetails)) {
        summary.classList.add('hidden');
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
}

function clearDeliveryDetails() {
    $('#deliveryType').val('');
    $('#deliveryAddress1').val('');
    $('#deliveryAddress2').val('');
    $('#deliveryDistrict').val('');
    wasDeliveryDetailsComplete = false;
}

function refreshCartSummaryState(cart) {
    const details = getDeliveryDetails();
    const isComplete = hasDeliveryDetails(details);
    const $cartTotals = $('#cartTotals');
    const cartSummaryEl = $('#cartSummary').get(0);

    if (isComplete) {
        updateSummary(cart, details);
        $cartTotals.show();
        if (!wasDeliveryDetailsComplete && cartSummaryEl) {
            requestAnimationFrame(() => {
                cartSummaryEl.scrollTo({
                    top: cartSummaryEl.scrollHeight,
                    behavior: 'smooth'
                });
            });
        }
        wasDeliveryDetailsComplete = true;
    } else {
        $cartTotals.hide();
        wasDeliveryDetailsComplete = false;
    }
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

function whatsappOrderDigits() {
    return String(WHATSAPP_ORDER_NUMBER).replace(/\D/g, '');
}

function buildWhatsAppOrderText(items, deliveryDetails = null) {
    const lines = [];
    lines.push('*New order — Fasa Products*');
    lines.push('');
    lines.push('*Items:*');
    let subtotal = 0;
    items.forEach((item, index) => {
        const price = Number(item.price);
        const qty = Math.max(1, Number(item.quantity) || 1);
        const lineTotal = price * qty;
        subtotal += lineTotal;
        lines.push(`${index + 1}. *${item.name}*`);
        lines.push(`   Qty: ${qty} × ${formatPrice(price)} = *${formatPrice(lineTotal)}*`);
    });
    lines.push('');
    lines.push(`Subtotal: *${formatPrice(subtotal)}*`);
    if (deliveryDetails && hasDeliveryDetails(deliveryDetails)) {
        const shipping = getShippingFee(items, deliveryDetails);
        const grandTotal = subtotal + shipping;
        lines.push(`Shipping: ${formatPrice(shipping)}`);
        lines.push(`*Total: ${formatPrice(grandTotal)}*`);
    } else {
        lines.push('Shipping: *Based on district and delivery type*');
    }
    if (deliveryDetails && hasDeliveryDetails(deliveryDetails)) {
        const deliveryLocation = [
            deliveryDetails.addressLine1,
            deliveryDetails.addressLine2,
            deliveryDetails.district
        ].filter(Boolean).join(', ');

        lines.push('');
        lines.push('*Delivery details:*');
        lines.push(`Delivery Type: ${deliveryDetails.deliveryType}`);
        lines.push(`Delivery Location: ${deliveryLocation}`);
    }
    lines.push('');
    lines.push('Please confirm this order. Thank you!');
    return lines.join('\n');
}

function openWhatsAppWithOrder(items, options = {}) {
    const { closeCart = false, clearCart = false, deliveryDetails = null } = options;
    if (!items.length) return;
    const now = Date.now();
    if (now - lastWhatsAppOpenAt < 1200) return;
    lastWhatsAppOpenAt = now;

    const digits = whatsappOrderDigits();
    if (!digits) {
        alert('WhatsApp number is not configured.');
        return;
    }

    const text = buildWhatsAppOrderText(items, deliveryDetails);
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

    if (closeCart) {
        $('#cartSidepanel').removeClass('active');
        $('#cartOverlay').removeClass('active');
    }

    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
        window.location.href = url;
    }

    if (clearCart) {
        localStorage.removeItem('cart');
        updateCartBadge();
    }
    renderCart();
}

function checkout() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];

    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }

    const deliveryDetails = getDeliveryDetails();
    if (!hasDeliveryDetails(deliveryDetails)) {
        alert('Please fill delivery type, address lines, and district before checkout.');
        return;
    }

    openWhatsAppWithOrder(cart, { closeCart: true, clearCart: true, deliveryDetails });
}

$(document).ready(function() {

    $(document).off('click', '#addToCart').on('click', '#addToCart', function() {
        const id = $(this).data('id');
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

    $(document).off('input change', '#deliveryType, #deliveryAddress1, #deliveryAddress2, #deliveryDistrict')
        .on('input change', '#deliveryType, #deliveryAddress1, #deliveryAddress2, #deliveryDistrict', function() {
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            if (!cart.length) return;
            refreshCartSummaryState(cart);
        });

    $(document).off('click', '#buyNowWhatsApp').on('click', '#buyNowWhatsApp', function() {
        const id = Number($(this).data('id'));
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

        const popup = document.getElementById('buyNowDeliveryPopup');
        if (!popup) return;

        const productId = Number(popup.dataset.productId);
        const product = products.find((p) => Number(p.id) === productId);
        if (!product) {
            closeBuyNowPopup();
            return;
        }

        const deliveryDetails = getBuyNowDeliveryDetails();
        if (!hasDeliveryDetails(deliveryDetails)) {
            alert('Please fill delivery type, address lines, and district.');
            return;
        }

        const buyNowItem = {
            id: product.id,
            name: product.name,
            price: Number(product.price),
            weight: product.weight || '',
            quantity: 1
        };

        closeBuyNowPopup();
        openWhatsAppWithOrder([buyNowItem], { closeCart: false, clearCart: false, deliveryDetails });
    });

    $(document).off('input change', '#buyNowDeliveryType, #buyNowAddress1, #buyNowAddress2, #buyNowDistrict')
        .on('input change', '#buyNowDeliveryType, #buyNowAddress1, #buyNowAddress2, #buyNowDistrict', function() {
            renderBuyNowPricePreview();
        });

    $(document).off('keydown', '#buyNowDeliveryPopup').on('keydown', '#buyNowDeliveryPopup', function(event) {
        if (event.key === 'Escape') {
            closeBuyNowPopup();
        }
    });
});
