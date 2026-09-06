# argon2 is a native module, so it needs a toolchain to build. Compiling in a
# separate stage keeps the compiler out of the image that actually runs.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Node 22 runs TypeScript directly by stripping the types, so there is no build
# step and no compiled output to keep in sync with the source.
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/index.ts"]
