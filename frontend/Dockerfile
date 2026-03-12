FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_API_URL=""
ARG VITE_LIVEKIT_URL=""
ARG VITE_FIREBASE_API_KEY=""
ARG VITE_FIREBASE_AUTH_DOMAIN=""
ARG VITE_FIREBASE_PROJECT_ID=""
ARG VITE_FIREBASE_STORAGE_BUCKET=""
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=""
ARG VITE_FIREBASE_APP_ID=""
ARG VITE_FIREBASE_PACKAGE_NAME="com.viapp.web"

RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
# nginx:alpine entrypoint runs envsubst on templates/*.template
# Only defined env vars are substituted; nginx $vars are left intact
CMD ["nginx", "-g", "daemon off;"]
