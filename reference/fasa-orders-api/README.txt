fasa-orders-api ↔ storefront contract
=====================================

1. Endpoint (must match script.js):
   GET {SPRING_BOOT_ORDER_API_URL}/public/{token}
   Example: GET http://localhost:8082/api/orders/public/abc123

2. Success JSON (200): use camelCase keys
   - orderId (number)
   - orderStatus (string, e.g. PENDING, PROCESSING, DELIVERED, DONE, REJECT)
   - message (string, optional human text)
   - items (array) — REQUIRED for the item list on track-order.html
     Each element: { "id", "name", "quantity", "price", "weight" }
     Same shape as lines in POST /api/orders body from the website.

3. Common backend mistakes
   - Returning the JPA Order entity with @JsonIgnore on orderItemEntities or items.
   - Lazy-loaded items: load with JOIN FETCH / @EntityGraph or a read-model query.
   - Different URL path than /api/orders/public/{token}.
   - Missing CORS when the site is served from another origin.

4. Copy the Java files in this folder into fasa-orders-api (adjust package names),
   implement PublicOrderStatusPort with your repository, and return
   new PublicOrderStatusResponse(orderId, status, message, itemDtos).

5. Example mapping from JPA line entities (adjust getters):
   order.getOrderItemEntities().stream()
       .map(e -> new PublicOrderItemDto(
           e.getProductId(),
           e.getProductName(),
           e.getQuantity(),
           e.getUnitPrice(),
           e.getWeight() != null ? e.getWeight() : ""))
       .toList();
