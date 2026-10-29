# One image for hosting: the game server also serves the built client on the same port.
FROM node:24.14.1-slim
WORKDIR /app

# Install with the lockfile first so dependency layers stay cached between code changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --ignore-scripts

COPY shared shared
COPY client client
COPY server server
RUN npm run build -w @legion/client

ENV NODE_ENV=production PORT=8080 CLIENT_DIR=/app/client/dist
EXPOSE 8080
# Game history for the stats page; a volume mounted here inherits the node owner.
RUN mkdir -p /data && chown node:node /data
WORKDIR /app/server
# No root at runtime: the game only reads its files (tsx keeps its cache in /tmp) and
# writes nothing but the history in /data.
USER node
CMD ["npx", "tsx", "src/index.ts"]
