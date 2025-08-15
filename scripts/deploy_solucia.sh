#!/bin/bash

set -e

echo "Building Docker image..."
gcloud builds submit --config=cloudbuild.yaml .

echo "Deploying with Helm..."
helm upgrade lightdash lightdash/lightdash -n lightdash -f secrets/values.yaml

echo "Restarting pods..."
kubectl delete pod -l app.kubernetes.io/name=lightdash -n lightdash

echo "Deployment complete!"