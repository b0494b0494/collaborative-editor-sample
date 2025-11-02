FROM node:20-alpine

WORKDIR /app

# Create data directory for database
RUN mkdir -p /app/data

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001 1234

CMD ["npm", "start"]
