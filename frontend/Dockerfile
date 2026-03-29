# ── Stage 1: Build the Vite app ──
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@8 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_SOLANA_RPC=""
ARG VITE_API_BASE=""
ARG VITE_WS_BASE=""

RUN pnpm build

# ── Stage 2: Serve with nginx ──
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
