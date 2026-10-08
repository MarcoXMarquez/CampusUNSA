# syntax=docker/dockerfile:1
FROM node:18-alpine AS dev

WORKDIR /app

# Install dependencies needed for alpine builds
RUN apk add --no-cache libc6-compat

# Copy package descriptors
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy application source code
COPY . .

# Set non-root user
USER node

EXPOSE 3000

ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

CMD ["npm", "run", "dev"]
