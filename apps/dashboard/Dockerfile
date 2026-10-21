FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/woo-mcp-server/package.json apps/woo-mcp-server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .
RUN npm run build --workspace=@urumi/dashboard

FROM nginx:1.28-alpine
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 8080
