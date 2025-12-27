# Fasa Products - Product Catalog Website

A modern, responsive product catalog website built with plain HTML, CSS, and JavaScript. This website allows users to browse products, view best sellers, check special offers, and see detailed product information with customer reviews.

## Features

- **Landing Page** with scrollable product sections
- **Best Sellers** section highlighting popular products
- **Special Offers** section with discounted items
- **Product Grid** with filtering by category
- **Product Details Page** with:
  - Multiple product images with thumbnail navigation
  - Full product description and features
  - Customer reviews and ratings
  - Related products suggestions
- **Fully Responsive** design that works on all devices
- **Modern UI/UX** inspired by professional e-commerce templates

## File Structure

```
fasaproducts/
├── index.html          # Landing page with product listings
├── product.html        # Product details page
├── styles.css          # Main stylesheet with responsive design
├── script.js           # JavaScript for interactivity and product data
└── README.md          # This file
```

## Getting Started

1. Simply open `index.html` in a web browser to view the website
2. No build process or dependencies required - it's pure HTML/CSS/JS
3. All product images are loaded from Unsplash (requires internet connection)

## Usage

### Viewing Products
- Scroll through the landing page to see all products
- Click on any product card to view detailed information
- Use the filter buttons to filter products by category

### Product Details
- Click on a product to see full details
- Browse through product images using thumbnails
- Read customer reviews and ratings
- View related products at the bottom of the page

## Customization

### Adding Products
Edit the `products` array in `script.js` to add, modify, or remove products. Each product object should have:

```javascript
{
    id: number,
    name: string,
    category: string,
    description: string,
    price: number,
    originalPrice: number (optional),
    image: string (URL),
    images: array of image URLs,
    isBestSeller: boolean,
    isOffer: boolean,
    rating: number (0-5),
    features: array of strings,
    reviews: array of review objects
}
```

### Styling
Modify `styles.css` to change colors, fonts, spacing, or layout. The CSS uses CSS variables for easy customization:

```css
:root {
    --primary-color: #2d5016;
    --secondary-color: #4a7c2a;
    --accent-color: #6b9f3d;
    /* ... more variables */
}
```

### Content
- Update company name, contact information, and social links in the footer
- Modify section titles and descriptions in the HTML files
- Change hero section content in `index.html`

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Best Practices Implemented

- ✅ Semantic HTML5 elements
- ✅ Responsive design with mobile-first approach
- ✅ Accessible markup (ARIA labels, alt text)
- ✅ Clean, organized code structure
- ✅ CSS variables for maintainability
- ✅ Efficient JavaScript with event delegation
- ✅ Optimized images with lazy loading
- ✅ Smooth scrolling and transitions
- ✅ Mobile-friendly navigation menu

## Notes

- Product images are loaded from Unsplash. For production, replace with your own hosted images
- The website uses Google Fonts (Poppins) - requires internet connection
- All functionality is client-side only (no backend required)

## License

This project is created for client use. All rights reserved.

## How to run the project
- prerequisites : need to install note js
- npm install -g serve
- serve F:/fasaproducts/fasaproducts

