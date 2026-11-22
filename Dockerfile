# whoami: one small Node app, run as TypeScript with Node's type stripping (no build step).
# Base images are pinned by digest, the same versions as Spotcraft's own image; bump the version
# and digest together.

# Production dependencies only, from the lockfile.
FROM node:26.13.1-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS deps
RUN npm install --global pnpm@12.4.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Distroless: Node and nothing else (no shell, no package manager).
FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:1d736cf8b5716c07a245301f92717143215d248fd55771ee1936ef4b3302e531
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json NOTICE LICENSE ./
COPY src ./src
ENV NODE_ENV=production PORT=3000
USER 1000:1000
EXPOSE 3000
# Spotcraft runs this before each release (docs/contracts.md): it creates the visits table.
LABEL dev.spotcraft.migrate='["/nodejs/bin/node","src/migrate.ts"]'
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["src/server.ts"]
