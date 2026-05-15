package com.vidream.repository;

import com.vidream.entity.Case;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CaseRepository extends JpaRepository<Case, Long> {
    List<Case> findAllByOrderBySortOrderAsc();
}
