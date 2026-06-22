FROM node:20-alpine

WORKDIR /app

# Copy package configuration & install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
