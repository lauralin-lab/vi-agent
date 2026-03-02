FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_API_URL=http://localhost:8000
ARG VITE_LIVEKIT_URL=wss://localhost:7880

RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
# nginx:alpine entrypoint runs envsubst on templates/*.template
# Only defined env vars are substituted; nginx $vars are left intact
CMD ["nginx", "-g", "daemon off;"]
