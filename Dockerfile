# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG SOURCE_DATE_EPOCH
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID}
ENV NEXT_SHARED_CACHE_ENABLED=true
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=next_server_actions_encryption_key,required=true \
  export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(head -c 64 /run/secrets/next_server_actions_encryption_key)" && \
  npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
RUN apt-get update && \
  apt-get install --only-upgrade --yes --no-install-recommends libgnutls30=3.7.9-2+deb12u7 && \
  rm -f /var/log/apt/* /var/log/dpkg.log && \
  rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 && \
  rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_SHARED_CACHE_ENABLED=true
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID}
ARG SOURCE_REVISION
ARG SOURCE_CREATED
LABEL org.opencontainers.image.title="astroligyapp" \
      org.opencontainers.image.description="Personal Cosmic Calendar standalone application" \
      org.opencontainers.image.source="https://github.com/hbkdad/astroligyapp" \
      org.opencontainers.image.revision=${SOURCE_REVISION} \
      org.opencontainers.image.created=${SOURCE_CREATED} \
      org.opencontainers.image.licenses="LicenseRef-Proprietary"

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/scripts/validate-runtime-config.mjs ./scripts/validate-runtime-config.mjs
COPY --from=builder --chown=node:node /app/scripts/start-container.mjs ./scripts/start-container.mjs

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/start-container.mjs"]
