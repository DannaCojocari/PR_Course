FROM node:22-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run compile
EXPOSE 8000
CMD ["npm", "start", "8000", "./PR-labs/lab3/boards/zoom.txt"]