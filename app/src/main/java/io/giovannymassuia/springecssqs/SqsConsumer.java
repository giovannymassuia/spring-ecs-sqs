package io.giovannymassuia.springecssqs;

import io.awspring.cloud.sqs.annotation.SqsListener;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;

@Component
public class SqsConsumer {

    private static final Logger logger = LoggerFactory.getLogger(SqsConsumer.class);

    @SqsListener("my-sqs-queue.fifo")
    public void consume(Message<?> message) {
        logger.info(message.getPayload().toString());
    }

}
