package io.giovannymassuia.springecssqs;

import io.awspring.cloud.sqs.operations.SqsTemplate;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class Controller {

    @Value("${app.version}")
    private String version;

    private final SqsTemplate sqsTemplate;

    public Controller(SqsTemplate sqsTemplate) {
        this.sqsTemplate = sqsTemplate;
    }

    @GetMapping("/hello")
    public ResponseEntity<?> hello() {
        return ResponseEntity.ok(Map.of("message", "hello world: v" + version));
    }

    @PostMapping("/send-message")
    @ResponseStatus(HttpStatus.CREATED)
    public void sendMessage(@RequestBody Map<String, String> body) {
        sqsTemplate.send((sqs) -> sqs.queue("my-sqs-queue.fifo").payload(body));
    }

}
