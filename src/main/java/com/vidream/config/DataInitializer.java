package com.vidream.config;

import com.vidream.entity.Order;
import com.vidream.entity.SiteConfig;
import com.vidream.repository.OrderRepository;
import com.vidream.repository.SiteConfigRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.nio.charset.StandardCharsets;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final String DEFAULT_COMPANY_LOGO = "/images/vidream.png";

    private final SiteConfigRepository siteConfigRepository;
    private final OrderRepository orderRepository;

    public DataInitializer(SiteConfigRepository siteConfigRepository, OrderRepository orderRepository) {
        this.siteConfigRepository = siteConfigRepository;
        this.orderRepository = orderRepository;
    }

    @Override
    public void run(String... args) {
        initSiteConfig();
        initOrders();
    }

    private void initSiteConfig() {
        normalizeLegacyCompanyLogo();

        Map<String, String> defaults = Map.ofEntries(
            Map.entry("navigation_items", "[{\"slot\":\"home\",\"name\":\"首页\",\"anchor\":\"home\",\"title\":\"首页\"},{\"slot\":\"resources\",\"name\":\"资源\",\"anchor\":\"resources\",\"title\":\"资源\"},{\"slot\":\"cooperation\",\"name\":\"合作\",\"anchor\":\"cooperation\",\"title\":\"合作\"},{\"slot\":\"contact\",\"name\":\"咨询\",\"anchor\":\"contact\",\"title\":\"咨询\"}]"),
            Map.entry("hero_stats", "已成功对接30+家工作室，累计订单金额1200万元 | AI工具赋能，交付效率提升70%"),
            Map.entry("hero_badges", "[\"VIDream官方授权河南总代理\",\"大厂订单直连\",\"AI创作赋能\"]"),
            Map.entry("hero_title", "短剧接单：订单直连 + AI提效 + 规则验收"),
            Map.entry("hero_subtitle", "腾讯 / 爱奇艺 / 昆仑万维 / 芒果TV / 无界漫维 合作方<br>依托 VIDream AI 动画引擎，为创作者与工作室提供真实商单 + 工具支持"),
            Map.entry("resources_title", "我们凭什么能够给你订单？"),
            Map.entry("resources_cards", "[{\"title\":\"官方授权 + AI 工具加持\",\"content\":\"VIDream 河南总代理，同步享有 AI 智能驱动、海量正版素材、云端协作功能，本地化服务全程护航订单交付。\"},{\"title\":\"大厂订单直连\",\"content\":\"已与 5 家头部平台建立短剧采购合作，定期发布制作需求（剧本+预算+适配要求）。\"},{\"title\":\"真实案例 + 创作链路\",\"content\":\"已交付腾讯定制短剧 8 部 / 爱奇艺项目 5 部，均通过 VIDream AI 工具高效交付，合格率 100%，周期缩短 30%。\"}]"),
            Map.entry("case_tx_count", "8"),
            Map.entry("case_iqy_count", "5"),
            Map.entry("partner_logos", "[{\"name\":\"腾讯\",\"image_url\":\"/logos/tencent.png\"},{\"name\":\"爱奇艺\",\"image_url\":\"/logos/iqiyi.png\"},{\"name\":\"昆仑万维\",\"image_url\":\"/logos/kunlun.png\"},{\"name\":\"芒果TV\",\"image_url\":\"/logos/mango.png\"},{\"name\":\"无界漫维\",\"image_url\":\"/logos/wujie.png\"},{\"name\":\"VIDream\",\"image_url\":\"/logos/vidream.png\"}]"),
            Map.entry("resource_data_bar", "2025年计划发布短剧订单50+部，预算总额800万元 | 依托VIDream AI，降低制作成本20%，缩短交付周期30%"),
            Map.entry("cooperation_title", "如何合作？门槛低，结算快，AI 全程提效"),
            Map.entry("cooperation_cards", "[{\"title\":\"提交资料 + 能力评估\",\"content\":\"填写表单（可勾选擅长短剧类型、团队规模、交付能力），我们结合 VIDream 工具适配性评估你的制作能力，精准匹配订单。\"},{\"title\":\"接收订单 + AI 辅助创作\",\"content\":\"我们定期发布大厂需求（剧本+预算+适配要求）。你可借助 VIDream AI 工具快速完成脚本改写、分镜设计、AI 配音，调用正版素材，提升接单竞争力。\"},{\"title\":\"交付结算 + 云端协作\",\"content\":\"按成片验收（验收标准提前告知），最快 3 天结算。全程使用 VIDream 云端协作功能同步进度、对接修改。\"}]"),
            Map.entry("settlement_days", "3"),
            Map.entry("cooperation_note", "无需预付任何费用，拒绝押金，无隐形条款。平台服务费5%-8%，创作者拿大头。验收不合格可借助AI工具快速修改，降低返工成本。"),
            Map.entry("cooperation_case", "某工作室通过我们承接爱奇艺《XX短剧》，借助VIDream AI分镜、正版素材功能，单集制作费5万，15天完成交付，较传统节省10天工期。"),
            Map.entry("contact_title", "立即获取最新订单列表"),
            Map.entry("contact_form_fields", "[{\"key\":\"phone\",\"label\":\"手机号\",\"type\":\"input\",\"required\":true,\"placeholder\":\"请输入手机号\"},{\"key\":\"teamScale\",\"label\":\"团队规模\",\"type\":\"radio\",\"options\":[\"个人\",\"工作室\",\"团队\"]},{\"key\":\"usedVidream\",\"label\":\"是否使用过 VIDream 工具\",\"type\":\"radio\",\"options\":[\"是\",\"否\"]},{\"key\":\"dramaTypes\",\"label\":\"擅长短剧类型（可多选）\",\"type\":\"checkbox\",\"options\":[\"都市\",\"古风\",\"悬疑\",\"科幻\",\"喜剧\",\"言情\"]}]"),
            Map.entry("drama_types", "[\"都市\",\"古风\",\"悬疑\",\"科幻\",\"喜剧\",\"言情\"]"),
            Map.entry("privacy_notice", "提交即同意《隐私政策》，信息仅用于订单沟通、能力评估及VIDream工具试用通知。我们将严格保护信息安全，不泄露、不滥用，可随时申请删除。"),
            Map.entry("wechat_qr_url", "/images/wechat-qr.png"),
            Map.entry("company_logo", ""),
            Map.entry("contact_email", "lihuan@viju.cn"),
            Map.entry("vidream_business_email", "cailiang@chongho.net"),
            Map.entry("company_name", "郑州微爱剧科技有限公司"),
            Map.entry("icp_no", "豫ICP备XXXXXX号"),
            Map.entry("public_security_no", "410XXXXXXXXXX号"),
            Map.entry("vidream_trial_url", "https://www.vidream.net/trial"),
            Map.entry("success_page_text", "我们将在24小时内通过手机号与你联系，发送当前短剧订单需求列表。你也可以先免费体验VIDream AI短剧工具，解锁脚本生成、智能分镜、AI配音等功能，提前熟悉工具，提升接单效率。"),
            Map.entry("data_retention_days", "365"),
            Map.entry("background_videos", "{\"home\":\"/videos/home.mp4\",\"resources\":\"/videos/resources.mp4\",\"cooperation\":\"/videos/cooperation.mp4\",\"contact\":\"/videos/contact.mp4\"}"),
            Map.entry("background_media", "{\"sequenceFrames\":[],\"secondVideo\":null,\"thirdVideo\":null,\"mobileBackgroundImage\":null,\"mobileBackgroundPoster\":null,\"mobilePlaybackStrategy\":\"browser-enhanced\"}")
        );

        defaults.forEach((key, value) -> {
            if (siteConfigRepository.findByConfigKey(key).isEmpty()) {
                siteConfigRepository.save(new SiteConfig(key, value));
            }
        });

        repairPotentialMojibakeValues();
    }

    private void normalizeLegacyCompanyLogo() {
        siteConfigRepository.findByConfigKey("company_logo").ifPresent(config -> {
            if (DEFAULT_COMPANY_LOGO.equals(config.getConfigValue())) {
                config.setConfigValue("");
                siteConfigRepository.save(config);
            }
        });
    }

    private void repairPotentialMojibakeValues() {
        siteConfigRepository.findAll().forEach(config -> {
            String current = config.getConfigValue();
            String repaired = repairMojibake(current);
            if (!current.equals(repaired)) {
                config.setConfigValue(repaired);
                siteConfigRepository.save(config);
            }
        });
    }

    private String repairMojibake(String value) {
        if (value == null || value.isBlank() || !looksLikeMojibake(value)) {
            return value;
        }

        String repaired = new String(value.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8);
        return isBetterText(value, repaired) ? repaired : value;
    }

    private boolean looksLikeMojibake(String value) {
        return value.contains("Ã")
            || value.contains("Â")
            || value.contains("ð")
            || value.contains("ï")
            || value.contains("æ")
            || value.contains("å")
            || value.contains("ç")
            || value.contains("é");
    }

    private boolean isBetterText(String original, String repaired) {
        if (repaired == null || repaired.isBlank()) {
            return false;
        }
        return countCjkChars(repaired) > countCjkChars(original)
            || countMojibakeMarkers(repaired) < countMojibakeMarkers(original);
    }

    private int countMojibakeMarkers(String value) {
        int count = 0;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == 'Ã' || ch == 'Â' || ch == 'ð' || ch == 'ï' || ch == 'æ' || ch == 'å' || ch == 'ç' || ch == 'é') {
                count++;
            }
        }
        return count;
    }

    private int countCjkChars(String value) {
        int count = 0;
        for (int i = 0; i < value.length(); i++) {
            Character.UnicodeBlock block = Character.UnicodeBlock.of(value.charAt(i));
            if (block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS
                || block == Character.UnicodeBlock.CJK_UNIFIED_IDEOGRAPHS_EXTENSION_A
                || block == Character.UnicodeBlock.CJK_COMPATIBILITY_IDEOGRAPHS) {
                count++;
            }
        }
        return count;
    }

    private void initOrders() {
        if (orderRepository.count() > 0) {
            return;
        }

        Order order1 = new Order();
        order1.setTitle("都市情感短剧《遇见你》");
        order1.setBudget("3-5万/集");
        order1.setDeadline("2025-07-30");
        order1.setRequirements("要求15集，每集3分钟，都市轻喜剧风格");
        order1.setDramaType("都市");
        order1.setStatus("active");
        orderRepository.save(order1);

        Order order2 = new Order();
        order2.setTitle("古风悬疑短剧《长安秘案》");
        order2.setBudget("4-6万/集");
        order2.setDeadline("2025-08-15");
        order2.setRequirements("10集，每集5分钟，需有反转剧情");
        order2.setDramaType("古风");
        order2.setStatus("active");
        orderRepository.save(order2);

        Order order3 = new Order();
        order3.setTitle("科幻喜剧短剧《AI恋人》");
        order3.setBudget("5-8万/集");
        order3.setDeadline("2025-09-01");
        order3.setRequirements("20集，每集3分钟，AI主题轻科幻喜剧");
        order3.setDramaType("科幻");
        order3.setStatus("active");
        orderRepository.save(order3);
    }
}
