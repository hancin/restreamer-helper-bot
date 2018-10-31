FROM node:10

ENV NODE_ENV=production
ENV TZ=America/New_York
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production && mkdir data && mkdir cfg

COPY . .

CMD ["node", "src/app"]

EXPOSE 3000