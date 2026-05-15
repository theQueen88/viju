package com.vidream.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "leads")
public class Lead {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String phone;

    @Column(name = "team_name")
    private String teamName;

    @Column(name = "drama_types", columnDefinition = "TEXT")
    private String dramaTypes;

    @Column(name = "used_vidream")
    private Boolean usedVidream;

    @Column(name = "team_scale")
    private String teamScale;

    @Column(name = "delivery_days")
    private String deliveryDays;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "status")
    private String status = "pending";

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = "pending";
        }
    }

    public Lead() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getTeamName() { return teamName; }
    public void setTeamName(String teamName) { this.teamName = teamName; }
    public String getDramaTypes() { return dramaTypes; }
    public void setDramaTypes(String dramaTypes) { this.dramaTypes = dramaTypes; }
    public Boolean getUsedVidream() { return usedVidream; }
    public void setUsedVidream(Boolean usedVidream) { this.usedVidream = usedVidream; }
    public String getTeamScale() { return teamScale; }
    public void setTeamScale(String teamScale) { this.teamScale = teamScale; }
    public String getDeliveryDays() { return deliveryDays; }
    public void setDeliveryDays(String deliveryDays) { this.deliveryDays = deliveryDays; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
