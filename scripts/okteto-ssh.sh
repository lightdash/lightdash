#!/bin/bash

set -euo pipefail

PR_NUMBER="$1"

if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: $0 <pr_number>"
  exit 1
fi

NAMESPACE="pr-$PR_NUMBER"

echo "Setting up PR environment for PR #$PR_NUMBER..."

# Use Okteto namespace
echo "Switching to namespace: $NAMESPACE"
okteto namespace use "$NAMESPACE"

# Update kubeconfig
echo "Updating kubeconfig..."
okteto kubeconfig

# Find the lightdash-preview pod
POD=$(kubectl get pods -n "$NAMESPACE" --no-headers | awk '/lightdash-preview/ {print $1; exit}')

if [[ -z "$POD" ]]; then
  echo "No lightdash-preview pod found in namespace '$NAMESPACE'"
  exit 1
fi

echo "Found pod: $POD"
echo "Connecting to pod..."

# Execute shell in the pod
kubectl exec -it "$POD" -n "$NAMESPACE" -- /bin/bash