# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/app/.npm-cache npm ci

ARG VITE_N8N_WEBHOOK_URL
ARG VITE_SUMAI_COMPANY_ID
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID

ENV VITE_N8N_WEBHOOK_URL=${VITE_N8N_WEBHOOK_URL} \
    VITE_SUMAI_COMPANY_ID=${VITE_SUMAI_COMPANY_ID} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET} \
    VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID} \
    VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID}

COPY . .

RUN test -n "${VITE_N8N_WEBHOOK_URL}" \
    && test -n "${VITE_SUMAI_COMPANY_ID}" \
    && test -n "${VITE_FIREBASE_API_KEY}" \
    && test -n "${VITE_FIREBASE_AUTH_DOMAIN}" \
    && test -n "${VITE_FIREBASE_PROJECT_ID}" \
    && test -n "${VITE_FIREBASE_APP_ID}" \
    && npm run check

FROM nginx:1.28-alpine AS runtime

LABEL org.opencontainers.image.title="SUMA-AI Frontend" \
      org.opencontainers.image.description="Vue frontend and same-origin proxy for the SUMA-AI n8n webhook"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
