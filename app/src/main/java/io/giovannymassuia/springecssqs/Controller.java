package io.giovannymassuia.springecssqs;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class Controller {

    @Value("${app.version}")
    private String version;

    @GetMapping("/hello")
    public ResponseEntity<?> hello() {
        return ResponseEntity.ok(Map.of("message", "hello world: v" + version));
    }

}
