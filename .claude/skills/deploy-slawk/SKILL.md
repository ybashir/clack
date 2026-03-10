---
name: deploy-slawk
description: Deploy Slawk to GCP. Use when the user says "deploy", "/deploy", or asks to deploy the application.
---

# Deploy Slawk to GCP

## Prerequisites Check

Before anything, verify the user has the tools installed:

```bash
gcloud --version
```

If `gcloud` is not installed, tell the user to install it: https://cloud.google.com/sdk/docs/install

Check authentication:

```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)"
```

If not authenticated, run `gcloud auth login`.

## Step 1: Project Setup

Ask the user which GCP project to use, or create a new one. Default project name: `slawk`.

```bash
# Check if project exists
gcloud projects describe PROJECT_ID 2>/dev/null

# Or create one
gcloud projects create PROJECT_ID --name="slawk"
gcloud config set project PROJECT_ID
```

Link a billing account (required for Cloud SQL and Cloud Run):

```bash
# List billing accounts
gcloud billing accounts list

# Link billing
gcloud billing projects link PROJECT_ID --billing-account=BILLING_ACCOUNT_ID
```

## Step 2: Enable APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  --project=PROJECT_ID
```

## Step 3: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker \
  --location=REGION \
  --project=PROJECT_ID 2>/dev/null || true
```

## Step 4: Build the Base Image

The base image caches npm dependencies for faster builds. This only needs to run once (or when dependencies change).

```bash
# From the repo root
chmod +x build-base.sh

# Update build-base.sh to use the correct project/region, then run:
GCP_PROJECT_ID=PROJECT_ID REGION=REGION bash build-base.sh
```

If build-base.sh references a hardcoded project/region, update it to match.

Also update the `Dockerfile` ARG BASE_IMAGE to point to the correct Artifact Registry path:

```
ARG BASE_IMAGE=REGION-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/slawk-base:latest
```

## Step 5: Create Cloud SQL Instance

```bash
# Create a PostgreSQL 15 instance (this takes 5-10 minutes)
gcloud sql instances create slawk-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=REGION \
  --project=PROJECT_ID \
  --storage-size=10GB \
  --storage-auto-increase

# Set the postgres password
gcloud sql users set-password postgres \
  --instance=slawk-db \
  --password=GENERATED_PASSWORD \
  --project=PROJECT_ID

# Create the database
gcloud sql databases create slackclone \
  --instance=slawk-db \
  --project=PROJECT_ID
```

Generate a secure password: `openssl rand -base64 24`

The Cloud SQL connection name is: `PROJECT_ID:REGION:slawk-db`

## Step 6: Grant Cloud Build Permissions

Cloud Build needs permission to deploy to Cloud Run and access Cloud SQL:

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')

# Grant Cloud Build the Cloud Run Admin role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin" --quiet

# Grant Cloud Build the Service Account User role (to act as the compute SA)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" --quiet
```

## Step 7: Deploy

Set environment variables and run `deploy.sh`:

```bash
export GCP_PROJECT_ID=PROJECT_ID
export REGION=REGION
export DATABASE_URL="postgresql://postgres:PASSWORD@localhost/slackclone?host=/cloudsql/PROJECT_ID:REGION:slawk-db"
export JWT_SECRET=$(openssl rand -hex 32)
export GCS_BUCKET_NAME=slawk-uploads-PROJECT_ID
export RUN_SEED=true

chmod +x deploy.sh
bash deploy.sh
```

Set `RUN_SEED=true` on first deploy to populate the database with demo data. Set to `false` on subsequent deploys.

## Step 8: Verify

```bash
# Get the service URL
gcloud run services describe slawk \
  --project=PROJECT_ID \
  --region=REGION \
  --format='value(status.url)'
```

Open the URL in a browser. Login with: `eve@slawk.dev` / `password123`

## Cost Breakdown

~$15/month total:
- Cloud SQL (db-f1-micro): ~$10/month
- Cloud Run (min 1 instance, 512Mi): ~$4/month
- GCS, Artifact Registry, Cloud Build: free tier

## Redeployment

For subsequent deploys after code changes, just run:

```bash
export RUN_SEED=false
# ... (same env vars as above, except RUN_SEED)
bash deploy.sh
```

## Important Notes

- The `deploy.sh` script clones from the `main` branch on GitHub 
- Cloud SQL instance creation takes 5-10 minutes. Be patient.
- The JWT_SECRET should be saved somewhere secure. If you lose it, all existing sessions will be invalidated.
- The first deploy uses `RUN_SEED=true` to populate demo data. Never re-seed a production database.
