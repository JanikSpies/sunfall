FROM node:24-alpine AS base
WORKDIR /app

# Native-module build toolchain lives only in this stage. dev and builder need
# it to run `npm ci`; the production image below never inherits from here, so
# it never pays for it.
FROM base AS deps
RUN apk add --no-cache g++ make py3-pip libc6-compat
COPY package*.json ./
RUN npm ci

FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM deps AS builder
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# output: "standalone" (next.config.ts) traces the real runtime dependency
# graph at build time, so this is the app plus only the packages it actually
# needs at runtime -- not the full node_modules with every devDependency.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
