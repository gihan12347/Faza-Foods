package com.fasa.orders.reference.publicstatus;

import java.math.BigDecimal;

/**
 * One line on the public track-order response. Field names match the website checkout
 * payload (script.js submitOrderToSpringBoot): id, name, price, quantity, weight.
 */
public record PublicOrderItemDto(
        Long id,
        String name,
        int quantity,
        BigDecimal price,
        String weight
) {
}
