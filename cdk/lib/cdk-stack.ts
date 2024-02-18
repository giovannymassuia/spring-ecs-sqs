import * as cdk from 'aws-cdk-lib';
import {RemovalPolicy} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import {LogDriver} from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as sqs from 'aws-cdk-lib/aws-sqs'
import {RetentionDays} from "aws-cdk-lib/aws-logs";
import {Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";

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
      memoryMiB: '1024',
      cpu: '512',
      compatibility: ecs.Compatibility.FARGATE,
      networkMode: ecs.NetworkMode.AWS_VPC
    });

    const ecrRepository = new ecr.Repository(this, 'my-repo', {
      repositoryName: 'my-repo',
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteImages: true,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: 'max number of images',
        }
      ]
    });

    const container = taskDefinition.addContainer('my-app-contianer', {
      containerName: 'my-app',
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository, 'latest'),
      portMappings: [{containerPort: 8080}],
      logging: LogDriver.awsLogs({
        streamPrefix: 'ecs',
        logRetention: RetentionDays.FIVE_DAYS
      }),
      // healthCheck: {
      //   command: [
      //     'CMD-SHELL',
      //     'curl -sI -X GET http://localhost:8080/actuator/health | grep "HTTP/1.1 200" || exit 1'
      //   ],
      //   retries: 5,
      //   startPeriod: Duration.minutes(1),
      // }
    });

    const fifoSqs = new sqs.Queue(this, 'fifo-queue', {
      queueName: 'my-sqs-queue.fifo',
      fifo: true
    })

    taskDefinition.taskRole.addToPrincipalPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['sqs:*'],
      resources: [fifoSqs.queueArn]
    }))

    const fargateService = new ecs.FargateService(this, 'my-service-canary', {
      cluster: ecsCluster,
      serviceName: 'my-ecs-service-canary',
      desiredCount: 1,
      taskDefinition,
      vpcSubnets: {
        subnets: vpc.privateSubnets
      },
      deploymentController: {
        type: ecs.DeploymentControllerType.CODE_DEPLOY
      }
    });

    const blueTargetGroup = new alb.ApplicationTargetGroup(this, 'blue-tg', {
      vpc,
      targetGroupName: 'blue-tg',
      port: 8080,
      protocol: alb.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/actuator/health'
      },
      targets: [fargateService]
    });
    const greenTargetGroup = new alb.ApplicationTargetGroup(this, 'green-tg', {
      vpc,
      targetGroupName: 'green-tg',
      port: 8080,
      protocol: alb.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/actuator/health'
      },
      targets: [fargateService]
    });

    const prodListenerRule = new alb.ApplicationListenerRule(this, 'prod-listener-rule', {
      listener,
      priority: 11,
      conditions: [alb.ListenerCondition.pathPatterns(['/*'])],
      action: alb.ListenerAction.weightedForward([
        {targetGroup: blueTargetGroup, weight: 100},
        {targetGroup: greenTargetGroup, weight: 0}
      ])
    });

    const testListener = loadBalancer.addListener('TestListener', {
      port: 8080,
      protocol: alb.ApplicationProtocol.HTTP,
      defaultAction: alb.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found'
      })
    });
    const testListenerRule = new alb.ApplicationListenerRule(this, 'test-listener-rule', {
      listener: testListener,
      priority: 11,
      conditions: [alb.ListenerCondition.pathPatterns(['/test'])],
      action: alb.ListenerAction.forward([greenTargetGroup])
    });

    const customDeploymentConfig = new codedeploy.EcsDeploymentConfig(this, 'CustomDeploymentConfig', {
      deploymentConfigName: 'CustomDeploymentConfigV2',
      trafficRouting: codedeploy.TrafficRouting.timeBasedLinear({
        interval: cdk.Duration.minutes(1),
        percentage: 50
      })
    });

    const ecsDeploymentGroup = new codedeploy.EcsDeploymentGroup(this, 'EcsDeploymentGroup', {
      application: new codedeploy.EcsApplication(this, 'ecs-app', {
        applicationName: 'my-ecs-application'
      }),
      deploymentGroupName: 'my-ecs-deployment-group',
      deploymentConfig: customDeploymentConfig,
      service: fargateService,
      // alarms: [alarm],
      autoRollback: {
        failedDeployment: true,
        stoppedDeployment: true
      },
      blueGreenDeploymentConfig: {
        blueTargetGroup,
        greenTargetGroup,
        listener,
        testListener,
        // terminationWaitTime: cdk.Duration.minutes(10),
        // deploymentApprovalWaitTime: cdk.Duration.minutes(10)
      }
    });

    new cdk.CfnOutput(this, 'lb-dns', {
      value: loadBalancer.loadBalancerDnsName,
      description: 'Load Balancer DNS'
    })
  }
}
