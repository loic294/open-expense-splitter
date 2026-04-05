FROM node:18-alpine

WORKDIR /app

ARG VITE_LOGIN_VARIANT=login
ENV VITE_LOGIN_VARIANT=${VITE_LOGIN_VARIANT}

COPY package*.json ./

RUN npm install --include=optional

COPY . .

EXPOSE 5173

ENV TAILWIND_DISABLE_OXIDE=1

CMD ["npm", "run", "dev"]
