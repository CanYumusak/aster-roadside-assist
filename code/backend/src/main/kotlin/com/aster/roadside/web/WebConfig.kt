package com.aster.roadside.web

import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class WebConfig : WebMvcConfigurer {
    override fun addCorsMappings(registry: CorsRegistry) {
        registry
            .addMapping("/api/**")
            .allowedOrigins("http://127.0.0.1:8080", "http://localhost:8080")
            .allowedMethods("GET", "POST", "OPTIONS")
            .allowedHeaders("*")
    }
}
