FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4001 \
    HOSTNAME=0.0.0.0
COPY --from=builder /app ./
EXPOSE 4001
CMD ["npm", "run", "start"]
