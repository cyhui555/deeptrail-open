package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.response.ItineraryResponse;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 关键事务边界契约测试，防止事务注解退回到无法代理的私有方法。 */
class ServiceTransactionBoundaryTest {

  @Test
  void aiPersistenceUsesPublicRequiresNewBoundaries() throws Exception {
    assertPropagation(
        AiResultPersistenceService.class.getMethod(
            "saveItinerary",
            GenerateItineraryRequest.class,
            ItineraryResponse.class,
            Long.class),
        Propagation.REQUIRES_NEW);
    assertPropagation(
        AiResultPersistenceService.class.getMethod(
            "saveCallLog",
            com.ai.travel.enums.TaskType.class,
            String.class,
            com.ai.travel.enums.AiCallStatus.class,
            Integer.class,
            Integer.class,
            String.class,
            Long.class),
        Propagation.REQUIRES_NEW);
  }

  @Test
  void geocodingIsExplicitlySuspendedFromDatabaseTransactions() throws Exception {
    Method method = CheckinCoordinateService.class.getMethod(
        "resolveCoordinates",
        com.ai.travel.entity.TripPlan.class,
        String.class,
        String.class);

    assertPropagation(method, Propagation.NOT_SUPPORTED);
  }

  @Test
  void taskWriterOwnsTheDatabaseTransaction() throws Exception {
    Method method = CheckinTaskWriter.class.getMethod(
        "persistIfAbsent", String.class, List.class);

    assertPropagation(method, Propagation.REQUIRED);
  }

  private static void assertPropagation(Method method, Propagation expected) {
    assertThat(java.lang.reflect.Modifier.isPublic(method.getModifiers())).isTrue();
    Transactional transactional = method.getAnnotation(Transactional.class);
    assertThat(transactional).isNotNull();
    assertThat(transactional.propagation()).isEqualTo(expected);
  }
}
