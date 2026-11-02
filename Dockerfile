FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install --omit=dev
ARG SERVICE
ENV SERVICE=${SERVICE}
CMD ["sh", "-c", "node services/$SERVICE/src/index.js"]
