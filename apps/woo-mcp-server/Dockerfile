FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/woo-mcp-server/package.json apps/woo-mcp-server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY apps/woo-mcp-server apps/woo-mcp-server

FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100

COPY --from=build /app /app
EXPOSE 3100

CMD ["npm", "run", "start", "--workspace=@urumi/woo-mcp-server"]
