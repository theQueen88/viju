package com.vidream.controller;

import com.vidream.dto.ApiResponse;
import com.vidream.dto.LeadRequest;
import com.vidream.dto.OrderInterestRequest;
import com.vidream.entity.Lead;
import com.vidream.entity.Order;
import com.vidream.entity.OrderInterest;
import com.vidream.service.SiteService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class ApiController {

    private final SiteService siteService;

    public ApiController(SiteService siteService) {
        this.siteService = siteService;
    }

    @GetMapping("/config")
    public ApiResponse getAllConfig() {
        return ApiResponse.ok(siteService.getAllConfig());
    }

    @GetMapping("/config/home")
    public ApiResponse getHomeConfig() {
        return ApiResponse.ok(siteService.getHomeConfig());
    }

    @GetMapping("/config/resources")
    public ApiResponse getResourcesConfig() {
        return ApiResponse.ok(siteService.getResourcesConfig());
    }

    @GetMapping("/config/cooperation")
    public ApiResponse getCooperationConfig() {
        return ApiResponse.ok(siteService.getCooperationConfig());
    }

    @GetMapping("/config/contact")
    public ApiResponse getContactConfig() {
        return ApiResponse.ok(siteService.getContactConfig());
    }

    @GetMapping("/config/footer")
    public ApiResponse getFooterConfig() {
        return ApiResponse.ok(siteService.getFooterConfig());
    }

    @GetMapping("/orders")
    public ApiResponse getOrders(@RequestParam(defaultValue = "active") String status) {
        if ("all".equals(status)) {
            return ApiResponse.ok(siteService.getAllOrders());
        }
        return ApiResponse.ok(siteService.getActiveOrders());
    }

    @PostMapping("/leads")
    public ApiResponse submitLead(@Valid @RequestBody LeadRequest req) {
        Lead lead = new Lead();
        lead.setPhone(req.getPhone());
        lead.setTeamName(req.getTeamName());
        lead.setDramaTypes(req.getDramaTypes());
        lead.setUsedVidream(req.getUsedVidream());
        lead.setTeamScale(req.getTeamScale());
        lead.setDeliveryDays(req.getDeliveryDays());

        Lead savedLead = siteService.saveLead(lead);
        return ApiResponse.ok("已为你准备【订单预览 + 预算区间 + 验收口径】", Map.of("leadId", savedLead.getId()));
    }

    @PostMapping("/order-interests")
    public ApiResponse submitOrderInterest(@Valid @RequestBody OrderInterestRequest req) {
        if (!siteService.leadExists(req.getLeadId())) {
            return ApiResponse.fail("线索不存在，请先提交联系方式");
        }

        Order order = siteService.getOrderById(req.getOrderId()).orElse(null);
        if (order == null) {
            return ApiResponse.fail("订单不存在或已下线");
        }

        OrderInterest interest = siteService.saveOrderInterest(req.getLeadId(), req.getOrderId());
        return ApiResponse.ok(
            "已登记你对《" + order.getTitle() + "》的意向",
            Map.of("interestId", interest.getId(), "leadId", req.getLeadId(), "orderId", req.getOrderId())
        );
    }

    @GetMapping("/order-interests")
    public ApiResponse getOrderInterests(@RequestParam Long leadId) {
        if (!siteService.leadExists(leadId)) {
            return ApiResponse.ok(Map.of("orderIds", java.util.List.of()));
        }
        return ApiResponse.ok(Map.of("orderIds", siteService.getInterestedOrderIds(leadId)));
    }

    @PostMapping("/page-view")
    public ApiResponse recordPageView(@RequestBody Map<String, String> body) {
        String path = body.getOrDefault("path", "/");
        siteService.recordPageView(path);
        return ApiResponse.ok(null);
    }
}
