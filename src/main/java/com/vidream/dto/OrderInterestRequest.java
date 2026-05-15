package com.vidream.dto;

import jakarta.validation.constraints.NotNull;

public class OrderInterestRequest {

    @NotNull(message = "缺少线索信息")
    private Long leadId;

    @NotNull(message = "缺少订单信息")
    private Long orderId;

    public Long getLeadId() { return leadId; }
    public void setLeadId(Long leadId) { this.leadId = leadId; }
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long orderId) { this.orderId = orderId; }
}
