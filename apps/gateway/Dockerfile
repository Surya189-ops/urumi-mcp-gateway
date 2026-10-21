FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/woo-mcp-server/package.json apps/woo-mcp-server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY apps/gateway/tsconfig.json apps/gateway/tsconfig.json
COPY apps/gateway/tsconfig.build.json apps/gateway/tsconfig.build.json
COPY apps/gateway/src apps/gateway/src
COPY packages/shared packages/shared

RUN npx tsc --project apps/gateway/tsconfig.build.json

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/woo-mcp-server/package.json apps/woo-mcp-server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev

COPY --from=build /app/apps/gateway/dist apps/gateway/dist
COPY apps/gateway/migrations apps/gateway/migrations

EXPOSE 3000
CMD ["node", "apps/gateway/dist/index.js"]
