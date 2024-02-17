#!/bin/bash

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

## docker push
docker push $AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/my-repo:${NEW_VERSION}
docker push $AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/my-repo:latest

## ecs force new deployment
aws ecs update-service --cluster my-ecs-cluster --service my-ecs-service --force-new-deployment
