#!/usr/bin/env bash
# Builds the web export and ships it to the VPS.
#
#   ./deploy/deploy.sh
#
# The server runs Traefik on :80/:443 (nginx on the host is dead and unused).
# Moi Book is a plain nginx container at /opt/moi-book serving ./dist, routed by
# the Traefik labels in docker-compose.yml. Traefik issues the TLS certificate.
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@187.127.218.193}"
REMOTE_DIR="${REMOTE_DIR:-/opt/moi-book}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"

SSH=(ssh -i "$SSH_KEY" "$VPS_HOST")
SCP=(scp -i "$SSH_KEY")

echo "==> Building web export"
npx expo export --platform web

echo "==> Uploading to ${VPS_HOST}:${REMOTE_DIR}"
# Upload beside the live directory and swap, so a half-finished transfer is
# never the served site.
"${SSH[@]}" "rm -rf ${REMOTE_DIR}/dist.new && mkdir -p ${REMOTE_DIR}/dist.new"
"${SCP[@]}" -r dist/* "$VPS_HOST:${REMOTE_DIR}/dist.new/"
"${SCP[@]}" deploy/docker-compose.yml deploy/site.conf "$VPS_HOST:${REMOTE_DIR}/"

echo "==> Swapping in and restarting"
"${SSH[@]}" "cd ${REMOTE_DIR} \
  && rm -rf dist.old \
  && if [ -d dist ]; then mv dist dist.old; fi \
  && mv dist.new dist \
  && docker compose up -d \
  && docker compose restart web \
  && rm -rf dist.old"

echo "==> Live at https://moi.gvndemo.com/"
