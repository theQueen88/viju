package com.vidream.repository;

import com.vidream.entity.OrderInterest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderInterestRepository extends JpaRepository<OrderInterest, Long> {
    Optional<OrderInterest> findByLeadIdAndOrderId(Long leadId, Long orderId);
    List<OrderInterest> findAllByLeadId(Long leadId);
    List<OrderInterest> findAllByLeadIdIn(List<Long> leadIds);
    void deleteAllByOrderId(Long orderId);
}
