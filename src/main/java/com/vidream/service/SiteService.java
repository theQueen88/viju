package com.vidream.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vidream.dto.AdminLeadView;
import com.vidream.entity.Case;
import com.vidream.entity.Lead;
import com.vidream.entity.Order;
import com.vidream.entity.OrderInterest;
import com.vidream.entity.SiteConfig;
import com.vidream.repository.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SiteService {

    private final SiteConfigRepository siteConfigRepository;
    private final LeadRepository leadRepository;
    private final OrderRepository orderRepository;
    private final OrderInterestRepository orderInterestRepository;
    private final CaseRepository caseRepository;
    private final PageViewRepository pageViewRepository;
    private final ObjectMapper objectMapper;

    public SiteService(SiteConfigRepository siteConfigRepository,
                       LeadRepository leadRepository,
                       OrderRepository orderRepository,
                       OrderInterestRepository orderInterestRepository,
                       CaseRepository caseRepository,
                       PageViewRepository pageViewRepository,
                       ObjectMapper objectMapper) {
        this.siteConfigRepository = siteConfigRepository;
        this.leadRepository = leadRepository;
        this.orderRepository = orderRepository;
        this.orderInterestRepository = orderInterestRepository;
        this.caseRepository = caseRepository;
        this.pageViewRepository = pageViewRepository;
        this.objectMapper = objectMapper;
    }

    public Map<String, String> getAllConfig() {
        return siteConfigRepository.findAll().stream()
            .collect(Collectors.toMap(SiteConfig::getConfigKey, SiteConfig::getConfigValue));
    }

    public Map<String, Object> getHomeConfig() {
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> homeKeys = List.of("hero_stats", "hero_badges", "partner_logos", "background_videos");
        for (String key : homeKeys) {
            siteConfigRepository.findByConfigKey(key).ifPresent(c -> result.put(key, c.getConfigValue()));
        }
        return result;
    }

    public Map<String, Object> getResourcesConfig() {
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> keys = List.of("case_tx_count", "case_iqy_count", "resource_data_bar", "partner_logos");
        for (String key : keys) {
            siteConfigRepository.findByConfigKey(key).ifPresent(c -> result.put(key, c.getConfigValue()));
        }
        result.put("cases", caseRepository.findAllByOrderBySortOrderAsc());
        return result;
    }

    public Map<String, Object> getCooperationConfig() {
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> keys = List.of("settlement_days", "cooperation_note", "cooperation_case");
        for (String key : keys) {
            siteConfigRepository.findByConfigKey(key).ifPresent(c -> result.put(key, c.getConfigValue()));
        }
        return result;
    }

    public Map<String, Object> getContactConfig() {
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> keys = List.of("drama_types", "privacy_notice", "wechat_qr_url");
        for (String key : keys) {
            siteConfigRepository.findByConfigKey(key).ifPresent(c -> result.put(key, c.getConfigValue()));
        }
        return result;
    }

    public Map<String, Object> getFooterConfig() {
        Map<String, Object> result = new LinkedHashMap<>();
        List<String> keys = List.of("company_name", "contact_email", "vidream_business_email",
            "wechat_qr_url", "icp_no", "public_security_no");
        for (String key : keys) {
            siteConfigRepository.findByConfigKey(key).ifPresent(c -> result.put(key, c.getConfigValue()));
        }
        return result;
    }

    @Transactional
    public Lead saveLead(Lead lead) {
        if (lead == null) {
            return null;
        }

        String phone = lead.getPhone();
        if (phone == null || phone.isBlank()) {
            return leadRepository.save(lead);
        }

        List<Lead> samePhoneLeads = leadRepository.findAllByPhoneOrderByIdAsc(phone);
        if (samePhoneLeads.isEmpty()) {
            return leadRepository.save(lead);
        }

        Lead canonicalLead = samePhoneLeads.get(0);
        canonicalLead.setPhone(phone);
        canonicalLead.setTeamName(lead.getTeamName());
        canonicalLead.setDramaTypes(lead.getDramaTypes());
        canonicalLead.setUsedVidream(lead.getUsedVidream());
        canonicalLead.setTeamScale(lead.getTeamScale());
        canonicalLead.setDeliveryDays(lead.getDeliveryDays());
        if (lead.getStatus() != null && !lead.getStatus().isBlank()) {
            canonicalLead.setStatus(lead.getStatus());
        }

        Lead savedLead = leadRepository.save(canonicalLead);
        mergeOrderInterestsToCanonicalLead(savedLead.getId(), samePhoneLeads);
        return savedLead;
    }

    public List<Lead> getAllLeads() {
        return leadRepository.findAll();
    }

    public Map<String, Object> getAdminLeads(int page, int size, String phone, String startDate, String endDate) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(size, 1);
        String phoneKeyword = normalizeKeyword(phone);
        LocalDateTime start = parseDateTimeStart(startDate);
        LocalDateTime end = parseDateTimeEnd(endDate);
        List<Lead> filteredLeads = leadRepository.findAll().stream()
            .filter(lead -> matchesLead(lead, phoneKeyword, start, end))
            .sorted(Comparator
                .comparing(Lead::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(Lead::getId, Comparator.nullsLast(Comparator.reverseOrder())))
            .collect(Collectors.toList());
        int total = filteredLeads.size();
        int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / safeSize);
        int fromIndex = Math.min((safePage - 1) * safeSize, total);
        int toIndex = Math.min(fromIndex + safeSize, total);
        List<Lead> leads = filteredLeads.subList(fromIndex, toIndex);
        Map<String, Object> result = new LinkedHashMap<>();
        if (leads.isEmpty()) {
            result.put("items", Collections.emptyList());
            result.put("page", safePage);
            result.put("size", safeSize);
            result.put("total", total);
            result.put("totalPages", totalPages);
            return result;
        }

        List<Long> leadIds = leads.stream()
            .map(Lead::getId)
            .filter(Objects::nonNull)
            .collect(Collectors.toList());

        Map<Long, String> orderTitleById = orderRepository.findAll().stream()
            .filter(order -> order.getId() != null)
            .collect(Collectors.toMap(Order::getId, Order::getTitle, (left, right) -> left, LinkedHashMap::new));

        Map<Long, List<String>> interestedOrdersByLeadId = new HashMap<>();
        if (!leadIds.isEmpty()) {
            for (OrderInterest interest : orderInterestRepository.findAllByLeadIdIn(leadIds)) {
                Long leadId = interest.getLeadId();
                Long orderId = interest.getOrderId();
                if (leadId == null || orderId == null) continue;
                String orderTitle = orderTitleById.get(orderId);
                if (orderTitle == null || orderTitle.isBlank()) {
                    orderTitle = "订单#" + orderId;
                }
                interestedOrdersByLeadId
                    .computeIfAbsent(leadId, key -> new ArrayList<>())
                    .add(orderTitle);
            }
        }

        List<AdminLeadView> items = leads.stream()
            .map(lead -> {
                List<String> titles = interestedOrdersByLeadId.getOrDefault(lead.getId(), Collections.emptyList());
                List<String> distinctTitles = titles.stream().distinct().collect(Collectors.toList());
                String interestedOrdersText = distinctTitles.isEmpty() ? "" : String.join("、", distinctTitles);
                return AdminLeadView.from(lead, distinctTitles, interestedOrdersText);
            })
            .collect(Collectors.toList());
        result.put("items", items);
        result.put("page", safePage);
        result.put("size", safeSize);
        result.put("total", total);
        result.put("totalPages", totalPages);
        return result;
    }

    public boolean leadExists(Long leadId) {
        return leadId != null && leadRepository.existsById(leadId);
    }

    public List<Order> getActiveOrders() {
        return orderRepository.findByStatus("active");
    }

    public List<Order> getAllOrders() {
        return orderRepository.findAll();
    }

    public List<Order> getAdminOrders(String title, String startDate, String endDate) {
        String titleKeyword = normalizeKeyword(title);
        LocalDateTime start = parseDateTimeStart(startDate);
        LocalDateTime end = parseDateTimeEnd(endDate);
        return orderRepository.findAll().stream()
            .filter(order -> matchesOrder(order, titleKeyword, start, end))
            .sorted(Comparator
                .comparing(Order::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(Order::getId, Comparator.nullsLast(Comparator.reverseOrder())))
            .collect(Collectors.toList());
    }

    public Optional<Order> getOrderById(Long id) {
        return orderRepository.findById(id);
    }

    public Order saveOrder(Order order) {
        return orderRepository.save(order);
    }

    @Transactional
    public OrderInterest saveOrderInterest(Long leadId, Long orderId) {
        Long canonicalLeadId = resolveCanonicalLeadId(leadId);
        if (canonicalLeadId == null) {
            return orderInterestRepository.save(new OrderInterest(leadId, orderId));
        }

        return orderInterestRepository.findByLeadIdAndOrderId(canonicalLeadId, orderId)
            .orElseGet(() -> orderInterestRepository.save(new OrderInterest(canonicalLeadId, orderId)));
    }

    public List<Long> getInterestedOrderIds(Long leadId) {
        Long canonicalLeadId = resolveCanonicalLeadId(leadId);
        if (canonicalLeadId == null) {
            return Collections.emptyList();
        }

        List<Long> relatedLeadIds = getRelatedLeadIdsByPhone(canonicalLeadId);
        if (relatedLeadIds.isEmpty()) {
            relatedLeadIds = Collections.singletonList(canonicalLeadId);
        }

        return orderInterestRepository.findAllByLeadIdIn(relatedLeadIds).stream()
            .map(OrderInterest::getOrderId)
            .filter(Objects::nonNull)
            .distinct()
            .collect(Collectors.toList());
    }

    private Long resolveCanonicalLeadId(Long leadId) {
        if (leadId == null) {
            return null;
        }

        return leadRepository.findById(leadId)
            .map(lead -> {
                List<Lead> samePhoneLeads = leadRepository.findAllByPhoneOrderByIdAsc(lead.getPhone());
                if (samePhoneLeads.isEmpty()) {
                    return lead.getId();
                }
                return samePhoneLeads.get(0).getId();
            })
            .orElse(leadId);
    }

    private List<Long> getRelatedLeadIdsByPhone(Long leadId) {
        if (leadId == null) {
            return Collections.emptyList();
        }

        return leadRepository.findById(leadId)
            .map(lead -> leadRepository.findAllByPhoneOrderByIdAsc(lead.getPhone()).stream()
                .map(Lead::getId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList()))
            .orElse(Collections.singletonList(leadId));
    }

    private void mergeOrderInterestsToCanonicalLead(Long canonicalLeadId, List<Lead> samePhoneLeads) {
        if (canonicalLeadId == null || samePhoneLeads == null || samePhoneLeads.size() <= 1) {
            return;
        }

        for (Lead lead : samePhoneLeads) {
            if (lead == null || lead.getId() == null || canonicalLeadId.equals(lead.getId())) {
                continue;
            }

            for (OrderInterest interest : orderInterestRepository.findAllByLeadId(lead.getId())) {
                Long orderId = interest.getOrderId();
                if (orderId == null) {
                    continue;
                }

                boolean exists = orderInterestRepository.findByLeadIdAndOrderId(canonicalLeadId, orderId).isPresent();
                if (exists) {
                    orderInterestRepository.delete(interest);
                    continue;
                }

                interest.setLeadId(canonicalLeadId);
                orderInterestRepository.save(interest);
            }
        }
    }

    public void updateOrderStatus(Long id, String status) {
        orderRepository.findById(id).ifPresent(order -> {
            order.setStatus(status);
            orderRepository.save(order);
        });
    }

    public Optional<Order> updateOrder(Long id, Order patch) {
        return orderRepository.findById(id).map(order -> {
            if (patch.getTitle() != null) order.setTitle(patch.getTitle());
            if (patch.getBudget() != null) order.setBudget(patch.getBudget());
            if (patch.getDeadline() != null) order.setDeadline(patch.getDeadline());
            if (patch.getRequirements() != null) order.setRequirements(patch.getRequirements());
            if (patch.getDramaType() != null) order.setDramaType(patch.getDramaType());
            if (patch.getStatus() != null) order.setStatus(patch.getStatus());
            return orderRepository.save(order);
        });
    }

    @Transactional
    public boolean deleteOrder(Long id) {
        if (id == null || !orderRepository.existsById(id)) {
            return false;
        }
        orderInterestRepository.deleteAllByOrderId(id);
        orderRepository.deleteById(id);
        return true;
    }

    public void updateConfig(String key, String value) {
        SiteConfig config = siteConfigRepository.findByConfigKey(key)
            .orElse(new SiteConfig(key, value));
        config.setConfigValue(value);
        siteConfigRepository.save(config);
    }

    public void updateConfigBatch(Map<String, String> configs) {
        configs.forEach(this::updateConfig);
    }

    public void removeConfigImageReference(String key, String imageUrl) {
        if ("partner_logos".equals(key)) {
            removePartnerLogo(imageUrl);
            return;
        }
        updateConfig(key, "");
    }

    private void removePartnerLogo(String imageUrl) {
        SiteConfig config = siteConfigRepository.findByConfigKey("partner_logos")
            .orElse(new SiteConfig("partner_logos", "[]"));
        List<Map<String, Object>> items = parsePartnerLogos(config.getConfigValue());
        items.removeIf(item -> imageUrl.equals(readPartnerLogoUrl(item)));
        try {
            config.setConfigValue(objectMapper.writeValueAsString(items));
        } catch (Exception e) {
            throw new IllegalArgumentException("partner_logos 数据格式不正确");
        }
        siteConfigRepository.save(config);
    }

    private List<Map<String, Object>> parsePartnerLogos(String raw) {
        String json = (raw == null || raw.isBlank()) ? "[]" : raw;
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException("partner_logos 数据格式不正确");
        }
    }

    private String readPartnerLogoUrl(Map<String, Object> item) {
        if (item == null) return "";
        Object value = item.get("image_url");
        if (value == null) value = item.get("url");
        if (value == null) value = item.get("imageUrl");
        return value == null ? "" : String.valueOf(value);
    }

    public List<Case> getAllCases() {
        return normalizeCaseCreatedAt(caseRepository.findAllByOrderBySortOrderAsc());
    }

    public Map<String, Object> getAdminCases(int page, int size, String title) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(size, 1);
        String titleKeyword = normalizeKeyword(title);
        List<Case> filteredCases = normalizeCaseCreatedAt(caseRepository.findAllByOrderBySortOrderAsc()).stream()
            .filter(c -> containsIgnoreCase(c.getTitle(), titleKeyword))
            .sorted(Comparator
                .comparing(Case::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(Case::getId, Comparator.nullsLast(Comparator.reverseOrder())))
            .collect(Collectors.toList());
        int total = filteredCases.size();
        int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / safeSize);
        int currentPage = totalPages == 0 ? 1 : Math.min(safePage, totalPages);
        int fromIndex = Math.min((currentPage - 1) * safeSize, total);
        int toIndex = Math.min(fromIndex + safeSize, total);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", filteredCases.subList(fromIndex, toIndex));
        result.put("page", currentPage);
        result.put("size", safeSize);
        result.put("total", total);
        result.put("totalPages", totalPages);
        return result;
    }

    public Case saveCase(Case c) {
        if (c.getCreatedAt() == null) {
            c.setCreatedAt(LocalDateTime.now());
        }
        return caseRepository.save(c);
    }

    public Optional<Case> updateCase(Long id, Case patch) {
        return caseRepository.findById(id).map(existing -> {
            if (existing.getCreatedAt() == null) existing.setCreatedAt(LocalDateTime.now());
            if (patch.getTitle() != null) existing.setTitle(patch.getTitle());
            if (patch.getPlatform() != null) existing.setPlatform(patch.getPlatform());
            if (patch.getImageUrl() != null) existing.setImageUrl(patch.getImageUrl());
            if (patch.getDescription() != null) existing.setDescription(patch.getDescription());
            if (patch.getVidreamFeatures() != null) existing.setVidreamFeatures(patch.getVidreamFeatures());
            if (patch.getSortOrder() != null) existing.setSortOrder(patch.getSortOrder());
            return caseRepository.save(existing);
        });
    }

    private List<Case> normalizeCaseCreatedAt(List<Case> cases) {
        List<Case> normalized = cases == null ? Collections.emptyList() : cases;
        List<Case> dirtyCases = new ArrayList<>();
        for (Case item : normalized) {
            if (item != null && item.getCreatedAt() == null) {
                item.setCreatedAt(LocalDateTime.now());
                dirtyCases.add(item);
            }
        }
        if (!dirtyCases.isEmpty()) {
            caseRepository.saveAll(dirtyCases);
        }
        return normalized;
    }

    public void deleteCase(Long id) {
        caseRepository.deleteById(id);
    }

    public void recordPageView(String pagePath) {
        pageViewRepository.save(new com.vidream.entity.PageView(pagePath));
    }

    private boolean matchesLead(Lead lead, String phoneKeyword, LocalDateTime start, LocalDateTime end) {
        if (lead == null) {
            return false;
        }
        if (!containsIgnoreCase(lead.getPhone(), phoneKeyword)) {
            return false;
        }
        return isDateTimeInRange(lead.getCreatedAt(), start, end);
    }

    private boolean matchesOrder(Order order, String titleKeyword, LocalDateTime start, LocalDateTime end) {
        if (order == null) {
            return false;
        }
        if (!containsIgnoreCase(order.getTitle(), titleKeyword)) {
            return false;
        }
        return isDateStringInRange(order.getDeadline(), start, end);
    }

    private String normalizeKeyword(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean containsIgnoreCase(String source, String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return true;
        }
        if (source == null || source.isBlank()) {
            return false;
        }
        return source.toLowerCase(Locale.ROOT).contains(keyword.toLowerCase(Locale.ROOT));
    }

    private LocalDateTime parseDateTimeStart(String value) {
        return parseDateTimeValue(value, false);
    }

    private LocalDateTime parseDateTimeEnd(String value) {
        return parseDateTimeValue(value, true);
    }

    private LocalDateTime parseDateTimeValue(String value, boolean useDayEnd) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        try {
            return LocalDateTime.parse(trimmed);
        } catch (DateTimeParseException e) {
            try {
                LocalDate date = LocalDate.parse(trimmed);
                return useDayEnd ? date.atTime(LocalTime.MAX) : date.atStartOfDay();
            } catch (DateTimeParseException ignored) {
                return null;
            }
        }
    }

    private boolean isDateTimeInRange(LocalDateTime dateTime, LocalDateTime start, LocalDateTime end) {
        if (start == null && end == null) {
            return true;
        }
        if (dateTime == null) {
            return false;
        }
        if (start != null && dateTime.isBefore(start)) {
            return false;
        }
        if (end != null && dateTime.isAfter(end)) {
            return false;
        }
        return true;
    }

    private boolean isDateStringInRange(String rawDate, LocalDateTime start, LocalDateTime end) {
        if (start == null && end == null) {
            return true;
        }
        LocalDateTime dateTime = parseDateTimeStart(rawDate);
        if (dateTime == null) {
            return false;
        }
        if (start != null && dateTime.isBefore(start)) {
            return false;
        }
        if (end != null && dateTime.isAfter(end)) {
            return false;
        }
        return true;
    }
}
