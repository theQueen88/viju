package com.vidream.dto;

import com.vidream.entity.Lead;

import java.time.LocalDateTime;
import java.util.List;

public class AdminLeadView {

    private Long id;
    private String phone;
    private String teamName;
    private String dramaTypes;
    private Boolean usedVidream;
    private String teamScale;
    private String deliveryDays;
    private LocalDateTime createdAt;
    private String status;
    private List<String> interestedOrders;
    private String interestedOrdersText;

    public static AdminLeadView from(Lead lead, List<String> interestedOrders, String interestedOrdersText) {
        AdminLeadView view = new AdminLeadView();
        view.setId(lead.getId());
        view.setPhone(lead.getPhone());
        view.setTeamName(lead.getTeamName());
        view.setDramaTypes(lead.getDramaTypes());
        view.setUsedVidream(lead.getUsedVidream());
        view.setTeamScale(lead.getTeamScale());
        view.setDeliveryDays(lead.getDeliveryDays());
        view.setCreatedAt(lead.getCreatedAt());
        view.setStatus(lead.getStatus());
        view.setInterestedOrders(interestedOrders);
        view.setInterestedOrdersText(interestedOrdersText);
        return view;
    }

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
    public List<String> getInterestedOrders() { return interestedOrders; }
    public void setInterestedOrders(List<String> interestedOrders) { this.interestedOrders = interestedOrders; }
    public String getInterestedOrdersText() { return interestedOrdersText; }
    public void setInterestedOrdersText(String interestedOrdersText) { this.interestedOrdersText = interestedOrdersText; }
}
