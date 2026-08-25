# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d
ARG RUNTIME_IMAGE=gcr.io/distroless/base-nossl-debian13@sha256:5cab74e7f8a5e7c5f1c8a9e6268b1f352f053c36c656f493308340bcecbc636c

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci

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
  npm run build && \
  node scripts/normalize-next-build.mjs /run/secrets/next_server_actions_encryption_key

FROM ${RUNTIME_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PATH=/usr/local/bin:/usr/bin \
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

COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/x86_64-linux-gnu/libgcc_s.so.1
COPY --from=builder /lib/x86_64-linux-gnu/libstdc++.so.6 /lib/x86_64-linux-gnu/libstdc++.so.6
COPY --from=builder --chown=nonroot:nonroot /app/public ./public
COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=builder --chown=nonroot:nonroot /app/scripts/validate-runtime-config.mjs ./scripts/validate-runtime-config.mjs
COPY --from=builder --chown=nonroot:nonroot /app/scripts/start-container.mjs ./scripts/start-container.mjs

USER nonroot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["/usr/local/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["/usr/local/bin/node", "scripts/start-container.mjs"]
