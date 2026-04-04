FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --include=optional

COPY . .

EXPOSE 5173

ENV TAILWIND_DISABLE_OXIDE=1

CMD ["npm", "run", "dev"]
