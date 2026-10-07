# 90-Day CISSP Challenge — container image
# Works unchanged on AWS App Runner / ECS, Azure Container Apps / App Service, Google Cloud Run.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app
COPY package.json server.js plan.js ./
COPY public ./public

# Run as the unprivileged user that ships with the node image; /data is the persistence volume.
RUN mkdir -p /data && chown -R node:node /app /data
USER node
VOLUME ["/data"]

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "server.js"]
