#!/bin/bash
set -euo pipefail

# Rebuild the base image (only needed when package.json or prisma schema changes)

GCP_PROJECT_ID="${GCP_PROJECT_ID:-ncvgl-gcp}"
REGION="${REGION:-us-central1}"
IMAGE="us-central1-docker.pkg.dev/${GCP_PROJECT_ID}/cloud-run-source-deploy/slawk-base"

echo "Building base image..."
echo "  Image: ${IMAGE}:latest"
echo ""

gcloud builds submit . \
  --project "${GCP_PROJECT_ID}" \
  --tag "${IMAGE}:latest" \
  --config /dev/stdin <<YAML
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', 'Dockerfile.base', '-t', '${IMAGE}:latest', '.']
images: ['${IMAGE}:latest']
options:
  logging: CLOUD_LOGGING_ONLY
YAML

echo ""
echo "Base image built and pushed: ${IMAGE}:latest"
