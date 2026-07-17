package com.ai.travel.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.filter.CorsFilter;

class CorsConfigTest {

  @Test
  void allowedOriginPreflightReturnsConfiguredCorsHeaders() throws Exception {
    CorsFilter filter = createFilter(List.of("http://localhost:3000"));
    MockHttpServletRequest request = preflightRequest("http://localhost:3000");
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(request, response, (req, res) -> { });

    assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
        .isEqualTo("http://localhost:3000");
    assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS)).isEqualTo("true");
    assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_MAX_AGE)).isEqualTo("3600");
  }

  @Test
  void unknownOriginPreflightDoesNotReturnAllowOrigin() throws Exception {
    CorsFilter filter = createFilter(List.of("http://localhost:3000"));
    MockHttpServletRequest request = preflightRequest("https://untrusted.example");
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(request, response, (req, res) -> { });

    assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_FORBIDDEN);
    assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN)).isNull();
  }

  @Test
  void allowedOriginUnauthorizedResponseKeepsCorsHeaders() throws Exception {
    CorsFilter filter = createFilter(List.of("http://localhost:3000"));
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/private");
    request.addHeader(HttpHeaders.ORIGIN, "http://localhost:3000");
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(request, response,
        (req, res) -> ((HttpServletResponse) res).setStatus(HttpServletResponse.SC_UNAUTHORIZED));

    assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED);
    assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
        .isEqualTo("http://localhost:3000");
  }

  @Test
  void wildcardAllowedOriginFailsFast() {
    AppCorsProperties properties = new AppCorsProperties();
    properties.setAllowedOrigins(List.of("*"));
    CorsConfig config = new CorsConfig(properties);

    assertThatThrownBy(config::corsFilter)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("Wildcard CORS origins");
  }

  @Test
  void emptyAllowedOriginsFailsFast() {
    AppCorsProperties properties = new AppCorsProperties();
    properties.setAllowedOrigins(List.of(" "));
    CorsConfig config = new CorsConfig(properties);

    assertThatThrownBy(config::corsFilter)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("At least one CORS allowed origin");
  }

  private CorsFilter createFilter(List<String> origins) {
    AppCorsProperties properties = new AppCorsProperties();
    properties.setAllowedOrigins(origins);
    return new CorsConfig(properties).corsFilter();
  }

  private MockHttpServletRequest preflightRequest(String origin) {
    MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/private");
    request.addHeader(HttpHeaders.ORIGIN, origin);
    request.addHeader(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET");
    request.addHeader(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS,
        "Authorization, Content-Type");
    return request;
  }
}
