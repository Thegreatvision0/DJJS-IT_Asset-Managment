FROM node:20-alpine AS build
WORKDIR /app
COPY shared ./shared
COPY client/package*.json ./client/
RUN npm install --prefix client
COPY client ./client
RUN npm run build --prefix client

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY shared ./shared
COPY server/package*.json ./server/
RUN npm install --omit=dev --prefix server
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
EXPOSE 5000
CMD ["node", "server/src/index.js"]
