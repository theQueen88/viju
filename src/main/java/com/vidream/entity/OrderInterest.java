package com.vidream.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "order_interests",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"lead_id", "order_id"})
    }
)
public class OrderInterest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "lead_id", nullable = false)
    private Long leadId;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "status")
    private String status = "interested";

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    public OrderInterest() {}

    public OrderInterest(Long leadId, Long orderId) {
        this.leadId = leadId;
        this.orderId = orderId;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = "interested";
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getLeadId() { return leadId; }
    public void setLeadId(Long leadId) { this.leadId = leadId; }
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long orderId) { this.orderId = orderId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
