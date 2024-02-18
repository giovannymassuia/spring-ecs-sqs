# Spring Boot API + ECS

- [Simpler Deploy Approach](https://github.com/giovannymassuia/spring-ecs-sqs/tree/poc)
    - This deployment approach uses simple docker image tagging and ecs force redeployment strategy

- [Canary/Blue-Green Deploy](https://github.com/giovannymassuia/spring-ecs-sqs/tree/poc-canary-deploy)
    - This deployment uses AWS CodeDeploy to manage deploys and handle the blue/green tasks/load-balancer loads
