package com.fasa.orders.reference.publicstatus;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * JSON body for GET /api/orders/public/{token}. The storefront reads:
 * orderId, orderStatus (or order_status), message, and items (array of line objects).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PublicOrderStatusResponse(
        Long orderId,
        String orderStatus,
        String message,
        List<PublicOrderItemDto> items
) {
}
