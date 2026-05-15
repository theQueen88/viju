package com.vidream.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.vidream.service.ImageStorageService;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final RateLimitInterceptor rateLimitInterceptor;
    private final ImageStorageService imageStorageService;

    public WebConfig(RateLimitInterceptor rateLimitInterceptor, ImageStorageService imageStorageService) {
        this.rateLimitInterceptor = rateLimitInterceptor;
        this.imageStorageService = imageStorageService;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(rateLimitInterceptor);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String root = imageStorageService.getImagesRoot().toString().replace('\\', '/');
        if (!root.endsWith("/")) root = root + "/";
        registry.addResourceHandler("/images/**")
            .addResourceLocations("file:" + root, "classpath:/static/images/");
    }
}
