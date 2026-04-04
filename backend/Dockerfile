FROM node:20-alpine AS builder
WORKDIR /app
ARG CACHEBUST=1
COPY . .
RUN npm ci --only=production=false
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 4000
CMD ["node", "dist/index.js"]
