package com.fasa.orders.reference.publicstatus;

import java.util.Optional;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * COPY into fasa-orders-api and wire to your existing service/repository.
 *
 * URL must match the site: {@code SPRING_BOOT_ORDER_API_URL} + {@code /public/} + token
 * e.g. GET http://localhost:8082/api/orders/public/{token}
 *
 * Backend checklist:
 * <ul>
 *   <li>Load the order by public lookup token (same value returned at checkout).</li>
 *   <li>Eager-fetch or join-fetch line items so the list is never empty when items exist.</li>
 *   <li>Map each persisted line to {@link PublicOrderItemDto} (name, quantity, price, …).</li>
 *   <li>Expose {@code items} in JSON (not only JPA {@code orderItemEntities} on a raw entity).</li>
 *   <li>Add CORS for your storefront origin if the site and API are on different hosts.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/orders")
@CrossOrigin(origins = {"http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:3000", "http://127.0.0.1:3000"})
public class OrderPublicStatusController {

    /** Replace with your real service interface. */
    public interface PublicOrderStatusPort {
        Optional<PublicOrderStatusResponse> findByPublicToken(String token);
    }

    private final PublicOrderStatusPort publicOrderStatusPort;

    public OrderPublicStatusController(PublicOrderStatusPort publicOrderStatusPort) {
        this.publicOrderStatusPort = publicOrderStatusPort;
    }

    @GetMapping("/public/{token}")
    public ResponseEntity<PublicOrderStatusResponse> getByToken(@PathVariable("token") String token) {
        return publicOrderStatusPort
                .findByPublicToken(token)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
