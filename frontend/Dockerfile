FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Environment variables needed during build time
ENV NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
