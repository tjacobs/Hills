FROM node:current-alpine

WORKDIR /app

COPY package*.json .

RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
