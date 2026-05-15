package com.vidream.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "page_views")
public class PageView {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "page_path")
    private String pagePath;

    @Column(name = "view_time")
    private LocalDateTime viewTime;

    @PrePersist
    protected void onCreate() {
        this.viewTime = LocalDateTime.now();
    }

    public PageView() {}

    public PageView(String pagePath) {
        this.pagePath = pagePath;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPagePath() { return pagePath; }
    public void setPagePath(String pagePath) { this.pagePath = pagePath; }
    public LocalDateTime getViewTime() { return viewTime; }
    public void setViewTime(LocalDateTime viewTime) { this.viewTime = viewTime; }
}
