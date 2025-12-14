FROM node:18-bullseye-slim

WORKDIR /app

# Install dependencies first to leverage Docker layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 7070

CMD ["node", "server.js"]
