package com.vidream.repository;

import com.vidream.entity.Lead;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LeadRepository extends JpaRepository<Lead, Long> {
    List<Lead> findAllByPhoneOrderByIdAsc(String phone);
}
