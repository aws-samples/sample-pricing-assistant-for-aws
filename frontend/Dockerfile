# Multi-stage build for React frontend
FROM public.ecr.aws/docker/library/node:20-alpine AS builder

# Apply Alpine security updates to base image layer
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Set production environment
ENV NODE_ENV=production

# Build the application
RUN npm run build:prod

# Production stage
FROM public.ecr.aws/nginx/nginx:alpine

# Apply Alpine security updates to base image layer
RUN apk update && apk upgrade --no-cache

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration and remove defaults that conflict with non-root
COPY nginx.conf /etc/nginx/nginx.conf
RUN rm -f /etc/nginx/conf.d/default.conf && \
    rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh

# Fix permissions for non-root nginx user
RUN chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx && \
    chmod -R 755 /var/cache/nginx /var/run /var/log/nginx

# Expose port 8080
EXPOSE 8080

# Run as non-root user
USER nginx

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
