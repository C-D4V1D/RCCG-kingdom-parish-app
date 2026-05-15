#!/usr/bin/env bash
# =============================================================================
# deploy.sh — One-shot idempotent deploy for the KPSC Voice FP Cloud Run service
#
# Usage:
#   ./deploy.sh [PROJECT_ID]
#
# If PROJECT_ID is omitted you will be prompted.
# Re-running this script is safe — all steps are idempotent.
# =============================================================================

set -euo pipefail

REGION="us-central1"
SERVICE_NAME="voice-fp"
AR_REPO="voice-fp"
IMAGE_TAG="latest"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_FILE="${SCRIPT_DIR}/.deploy-secrets"

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
_green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
_yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
_red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
_bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. Check gcloud is installed and user is logged in
# ---------------------------------------------------------------------------
if ! command -v gcloud &>/dev/null; then
  _red "gcloud CLI not found."
  echo ""
  echo "Install it with:"
  echo "  curl https://sdk.cloud.google.com | bash"
  echo "  exec -l \$SHELL"
  echo "  gcloud init"
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q '@'; then
  _red "No active gcloud account found. Please log in:"
  echo "  gcloud auth login"
  exit 1
fi

_green "gcloud OK: $(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"

# ---------------------------------------------------------------------------
# 2. Resolve PROJECT_ID
# ---------------------------------------------------------------------------
PROJECT_ID="${1:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  read -rp "Enter GCP Project ID (e.g. kpsc-voice): " PROJECT_ID
fi

if [[ -z "${PROJECT_ID}" ]]; then
  _red "PROJECT_ID is required."
  exit 1
fi

echo ""
_bold "Project: ${PROJECT_ID}"

# Check if project exists; create it if not.
if ! gcloud projects describe "${PROJECT_ID}" &>/dev/null; then
  _yellow "Project '${PROJECT_ID}' not found — creating it..."
  gcloud projects create "${PROJECT_ID}" --name="${PROJECT_ID}"
  _green "Project created."
else
  _green "Project exists."
fi

gcloud config set project "${PROJECT_ID}" --quiet

# ---------------------------------------------------------------------------
# 3. Billing check
# ---------------------------------------------------------------------------
BILLING_ACCOUNT=$(gcloud beta billing projects describe "${PROJECT_ID}" \
  --format='value(billingAccountName)' 2>/dev/null || true)

if [[ -z "${BILLING_ACCOUNT}" ]]; then
  _yellow ""
  _yellow "No billing account linked to '${PROJECT_ID}'."
  _yellow "Please link one at:"
  _yellow "  https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}"
  echo ""
  read -rp "Press [Enter] once billing is linked to continue..."
fi

# ---------------------------------------------------------------------------
# 4. Enable required APIs
# ---------------------------------------------------------------------------
_bold "Enabling required APIs (this may take ~1 min on first run)..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${PROJECT_ID}"
_green "APIs enabled."

# ---------------------------------------------------------------------------
# 5. Artifact Registry repository
# ---------------------------------------------------------------------------
if ! gcloud artifacts repositories describe "${AR_REPO}" \
     --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  _yellow "Creating Artifact Registry repo '${AR_REPO}'..."
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --description="KPSC voice fingerprinting service images"
  _green "Repo created."
else
  _green "Artifact Registry repo '${AR_REPO}' already exists."
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

# ---------------------------------------------------------------------------
# 6. Generate / load VOICE_FP_TOKEN
# ---------------------------------------------------------------------------
if [[ -f "${SECRETS_FILE}" ]]; then
  # shellcheck source=/dev/null
  source "${SECRETS_FILE}"
  _green "Loaded existing VOICE_FP_TOKEN from ${SECRETS_FILE}"
else
  VOICE_FP_TOKEN="$(openssl rand -hex 32)"
  echo "VOICE_FP_TOKEN=${VOICE_FP_TOKEN}" > "${SECRETS_FILE}"
  chmod 0600 "${SECRETS_FILE}"
  _green "Generated new VOICE_FP_TOKEN → saved to ${SECRETS_FILE}"
fi

# ---------------------------------------------------------------------------
# 7. Build and push image via Cloud Build
# ---------------------------------------------------------------------------
_bold "Submitting build to Cloud Build..."
gcloud builds submit "${SCRIPT_DIR}" \
  --tag "${IMAGE_URI}" \
  --project="${PROJECT_ID}"
_green "Image pushed: ${IMAGE_URI}"

# ---------------------------------------------------------------------------
# 8. Deploy to Cloud Run
# ---------------------------------------------------------------------------
_bold "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_URI}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --min-instances 1 \
  --max-instances 3 \
  --concurrency 8 \
  --cpu 1 \
  --memory 2Gi \
  --set-env-vars "VOICE_FP_TOKEN=${VOICE_FP_TOKEN}" \
  --allow-unauthenticated \
  --quiet

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format 'value(status.url)')

# ---------------------------------------------------------------------------
# 9. Final summary
# ---------------------------------------------------------------------------
echo ""
_bold "============================================================"
_green "  Deploy complete"
_bold "============================================================"
echo ""
echo "  Service URL:   ${SERVICE_URL}"
echo "  Bearer token:  ${VOICE_FP_TOKEN}"
echo ""
_yellow "  Set these in Cloudflare Pages env vars (Production + Preview):"
echo "    VOICE_FP_URL    = ${SERVICE_URL}"
echo "    VOICE_FP_TOKEN  = ${VOICE_FP_TOKEN}"
echo ""
echo "  Health check:  curl ${SERVICE_URL}/health"
echo ""
