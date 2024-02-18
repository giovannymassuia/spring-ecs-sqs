#!/bin/bash

## exit in case of any error
set -e

export AWS_PAGER=""

## update version (patch)
BASE_VERSION=$(mvn help:evaluate -Dexpression=project.version -q -DforceStdout)
echo "Current Version: $BASE_VERSION"

PATCH_VERSION=$(echo $BASE_VERSION | awk -F. '{print $3}')
NEW_PATCH_VERSION=$((PATCH_VERSION+1))
NEW_BASE_VERSION=$(echo $BASE_VERSION | awk -v n=$NEW_PATCH_VERSION -F. '{print $1"."$2"."n}')
NEW_VERSION=$NEW_BASE_VERSION
echo "New version: $NEW_VERSION"

## update version in pom.xml
mvn versions:set -DnewVersion=$NEW_VERSION -DgenerateBackupPoms=false

## build app
mvn spring-boot:build-image

## fetch the AWS account ID using AWS CLI
AWS_ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)

## docker ecr tag
docker tag my-app:latest $AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/my-repo:${NEW_VERSION}
docker tag my-app:latest $AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/my-repo:latest

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

## docker push
docker push $AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/my-repo:${NEW_VERSION}
docker push $AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/my-repo:latest

## create a new code-deploy

## OPTIONAL: creating a new revision for each deployment is optional,
## but it makes it easier in case you want to rollback
# Retrieve the current task definition and remove unwanted parameters
#aws ecs describe-task-definition --task-definition my-task-def \
#    | jq '.taskDefinition | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)' > modified-task-def.json.tmp

aws ecs describe-task-definition --task-definition my-task-def \
    | jq --arg NEW_VERSION "$NEW_VERSION" '.taskDefinition |
        del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy) |
        .containerDefinitions[0].image |= sub(":.*$"; ":" + $NEW_VERSION)' > modified-task-def.json.tmp

# Register the new task definition revision
aws ecs register-task-definition --cli-input-json file://modified-task-def.json.tmp

# Replace 'your-task-definition-family' with your actual task definition family name
TASK_DEFINITION_FAMILY="my-task-def"
# Fetch the latest task definition for the given family
LATEST_TASK_DEFINITION=$(aws ecs describe-task-definition --task-definition $TASK_DEFINITION_FAMILY)
# Extract the task definition ARN
TASK_DEFINITION_ARN=$(echo "$LATEST_TASK_DEFINITION" | jq -r '.taskDefinition.taskDefinitionArn')
echo "Latest task definition ARN: $TASK_DEFINITION_ARN"

set +e
read -r -d '' APPSPEC_CONTENT << EOF
{
    "revisionType": "AppSpecContent",
    "appSpecContent": {
        "content": "{\"version\":\"$NEW_VERSION\",\"Resources\":[{\"TargetService\":{\"Type\":\"AWS::ECS::Service\",\"Properties\":{\"TaskDefinition\":\"$TASK_DEFINITION_ARN\",\"LoadBalancerInfo\":{\"ContainerName\":\"my-app\",\"ContainerPort\":8080}}}}]}"
    }
}
EOF
set -e

echo $APPSPEC_CONTENT > ./appspec.json.tmp

aws deploy create-deployment \
    --application-name my-ecs-application \
    --deployment-group-name my-ecs-deployment-group \
    --revision file://./appspec.json.tmp \
    --description "Deploy v$NEW_VERSION"

# can override deployment config with
# --deployment-config-name CodeDeployDefault.ECSLinear10PercentEvery1Minutes

echo
echo "Current Version: $BASE_VERSION"
echo "Version $NEW_VERSION is being deployed!"
