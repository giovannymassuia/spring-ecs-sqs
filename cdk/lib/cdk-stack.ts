import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class CdkStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = new cdk.aws_ec2.Vpc(this, 'VPC', {
            maxAzs: 2,
            natGateways: 1,
            vpcName: 'my-vpc'
        });

        const loadBalancer = new alb.ApplicationLoadBalancer(this, 'my-load-balancer', {
            vpc,
            loadBalancerName: 'my-load-balancer',
            internetFacing: true
        });

        const listener = new alb.ApplicationListener(this, 'listener-80', {
            loadBalancer,
            port: 80,
            protocol: alb.ApplicationProtocol.HTTP,
            defaultAction: alb.ListenerAction.fixedResponse(404, {
                contentType: 'text/plain',
                messageBody: 'not found'
            })
        });

        const ecsCluster = new ecs.Cluster(this, 'ecs-cluster', {
            vpc,
            clusterName: 'my-ecs-cluster'
        });

        const taskDefinition = new ecs.TaskDefinition(this, 'task-def', {
            family: 'my-task-def',
            memoryMiB: '512',
            cpu: '256',
            compatibility: ecs.Compatibility.FARGATE,
            networkMode: ecs.NetworkMode.AWS_VPC
        });

        const ecrReporsitory = new ecr.Repository(this, 'my-repo', {
            repositoryName: 'my-repo'
        });

        const container = taskDefinition.addContainer('my-app-contianer', {
            containerName: 'my-app',
            image: ecs.ContainerImage.fromEcrRepository(ecrReporsitory, 'latest'),
            environment: {
                APPVERSION: 'v1'
            },
            portMappings: [{ containerPort: 8080 }]
        });

        const fargateService = new ecs.FargateService(this, 'my-service', {
            cluster: ecsCluster,
            serviceName: 'my-ecs-service',
            desiredCount: 1,
            taskDefinition,
            vpcSubnets: {
                subnets: vpc.privateSubnets
            }
        });

        const targetGroup = new alb.ApplicationTargetGroup(this, 'target-group-v2', {
            vpc,
            targetGroupName: 'my-app-tg-spring',
            protocol: alb.ApplicationProtocol.HTTP,
            port: 8080,
            healthCheck: {
                path: '/actuator/health'
            },
            targets: [fargateService]
        });

        const albRule = new alb.ApplicationListenerRule(this, 'my-app-rule', {
            listener,
            priority: 10,
            conditions: [alb.ListenerCondition.pathPatterns(['/*'])],
            action: alb.ListenerAction.forward([targetGroup])
        });
    }
}
