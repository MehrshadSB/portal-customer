FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/portal/package.json ./apps/portal/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/types/package.json ./packages/types/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validators/package.json ./packages/validators/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm exec turbo run build --filter=@portal/api
RUN mkdir -p apps/api/dist/infrastructure/database/migrations && \
    cp -r apps/api/src/infrastructure/database/migrations/. apps/api/dist/infrastructure/database/migrations/

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/portal/package.json ./apps/portal/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/types/package.json ./packages/types/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validators/package.json ./packages/validators/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=development

COPY --from=prod-deps --chown=node:node /app/package.json ./package.json
COPY --from=prod-deps --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=node:node /app/packages ./packages

COPY --from=builder --chown=node:node /app/packages/types/dist ./packages/types/dist
COPY --from=builder --chown=node:node /app/packages/validators/dist ./packages/validators/dist
COPY --from=builder --chown=node:node /app/packages/i18n/dist ./packages/i18n/dist
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "node dist/infrastructure/database/migrate.js && exec node dist/main.js"]
