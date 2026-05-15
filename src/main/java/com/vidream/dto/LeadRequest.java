package com.vidream.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class LeadRequest {

    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1\\d{10}$", message = "手机号格式不正确")
    private String phone;

    private String teamName;

    private String dramaTypes;

    private Boolean usedVidream;

    private String teamScale;

    private String deliveryDays;

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
}
