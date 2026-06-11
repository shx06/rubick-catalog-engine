FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM alpine:latest
RUN apk add --no-cache python3; pip3 install --break-system-packages http-server || true
WORKDIR /app
COPY --from=builder /app/dist .
EXPOSE 3000
CMD ["python3", "-m", "http.server", "3000"]