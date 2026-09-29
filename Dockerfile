FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine
# Links the GHCR package to the repository (description, README, access).
LABEL org.opencontainers.image.source="https://github.com/mobileproxy/mcp-server"
LABEL org.opencontainers.image.description="MCP server for mobileproxy.space mobile and residential proxies"
LABEL org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
USER node
# stdio transport: run with `docker run -i --rm -e MOBILEPROXY_API_KEY=... <image>`
ENTRYPOINT ["node", "dist/index.js"]
