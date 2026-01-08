import { getReviews } from "./review.js";

let products = [];

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
    const discount = product.originalPrice 
        ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
        : 0;
    
    return `
        <div class="product-card" data-product-id="${product.id}">
            <div class="product-image-container">
                <img src="${product.image}" alt="${product.name}" class="product-image" loading="lazy">
                ${product.isOffer ? `<div class="product-badge sale">${discount}% OFF</div>` : ''}
                ${product.isBestSeller ? `<div class="product-badge">Best Seller</div>` : ''}
            </div>
            <div class="product-info">
                <div class="product-category">${product.category === 'category1' ? 'Food Mixes' : product.category === 'category2' ? 'Beauty Products' : 'Health Mixes'}</div>
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.description}</p>
                <div class="product-footer">
                    <div class="product-price">
                        <span class="price-current">${formatPrice(product.price)}</span>
                        ${product.originalPrice ? `<span class="price-original">${formatPrice(product.originalPrice)}</span>` : ''}
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
    
    // Render reviews
    renderReviews(productId);
    
    // Render related products
    const relatedProducts = products
        .filter(p => p.id !== productId && p.category === product.category)
        .slice(0, 4);
    renderProducts(relatedProducts, 'relatedProductsGrid');
}

function renderProductDetails(product) {
    const discount = product.originalPrice 
        ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
        : 0;
    
    const thumbnailsHTML = product.images.map((img, index) => 
        `<div class="thumbnail ${index === 0 ? 'active' : ''}" data-image="${img}">
            <img src="${img}" alt="${product.name} view ${index + 1}">
        </div>`
    ).join('');
    
    const featuresHTML = product.features.map(feature => 
        `<li>${feature}</li>`
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
            <div class="product-category-detail">${product.category === 'category1' ? 'Food Mixes' : product.category === 'category2' ? 'Beauty Products' : 'Health Mixes'}</div>
            <h1 class="product-title-detail">${product.name}</h1>
            <div class="product-rating">
                <span class="stars">${renderStars(product.rating)}</span>
                <span class="rating-text">(${product.rating} based on ${product.reviews.length} reviews)</span>
            </div>
            <div class="product-price-detail">
                <span class="price-current-detail">${formatPrice(product.price)}</span>
                ${product.originalPrice ? `<span class="price-original-detail">${formatPrice(product.originalPrice)}</span>` : ''}
                ${product.originalPrice ? `<span class="product-badge sale" style="display: inline-block; margin-left: 1rem;">${discount}% OFF</span>` : ''}
            </div>
            <p class="product-description-detail">${product.description}</p>
            <div class="product-features">
                <h3>Key Features</h3>
                <ul>
                    ${featuresHTML}
                </ul>
            </div>
            <div class="product-actions">
                <button id="addToCart" class="btn btn-primary" data-id="${product.id}">Add to Cart</button>
                <button class="btn btn-secondary">Buy Now</button>
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
    const reviews = await getReviews(productId);
    console.log("Reviews array:", reviews);

    const container = document.getElementById("reviewsContainer");
    if (!container) return;

    if (reviews.length === 0) {
        container.innerHTML = "<p>No reviews yet. Be the first to review this product!</p>";
        return;
    }

    container.innerHTML = reviews.map(review => `
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
    `).join('');
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
    
    // Check if we're on the product details page
    if (window.location.pathname.endsWith('/product')) {
        loadProductDetails();
    } else {
        // Load products on index page
        const bestSellers = products.filter(p => p.isBestSeller);
        const offers = products.filter(p => p.isOffer);
        
        renderProducts(bestSellers, 'bestSellersGrid');
        renderProducts(offers, 'offersGrid');
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
    
    if (cart.length === 0) {
        $cartItems.html(`
            <div class="empty-cart">
                <div class="empty-cart-icon">🛒</div>
                <p>Your cart is empty</p>
                <button onclick="window.location.href='index.html'">Continue Shopping</button>
            </div>
        `);
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
    updateSummary(cart);
    $cartSummary.show();
}

function updateSummary(cart) {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = subtotal > 50000 ? 0 : 500;
    const total = subtotal + shipping;

    $('#subtotal').text('Rs. ' + subtotal.toLocaleString());
    $('#shipping').text(shipping === 0 ? 'Free' : 'Rs. ' + shipping.toLocaleString());
    $('#total').text('Rs. ' + total.toLocaleString());
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

function checkout() {
    alert('Proceeding to checkout...');
}

$(document).ready(function() {

    $(document).on('click', '#addToCart', function() {
        const id = $(this).data('id');
        const product = products.find(p => p.id === id);
        addToCart(product);
    });

    $(document).on('click', '#cartToggle', function() {
        console.log('Cart icon clicked');
        renderCart();
        $('#cartSidepanel').addClass('active');
        $('#cartOverlay').addClass('active');
    });

    $(document).on('click', '#cartClose', function() {
        $('#cartSidepanel').removeClass('active');
        $('#cartOverlay').removeClass('active');
    });

    $(document).on('click', '#cartOverlay', function() {
        $('#cartSidepanel').removeClass('active');
        $('#cartOverlay').removeClass('active');
    });

    $(document).on('click', '.quantity-btn', function() {
        const id = Number($(this).data('id'));
        const change = Number($(this).data('change'));
        updateQuantity(id, change);
    });

    $(document).on('click', '.remove-btn', function() {
        const id = Number($(this).data('id'));
        removeItem(id);
    });

    $(document).on('click', '#checkoutBtn', function() {
        checkout();
    });
});
