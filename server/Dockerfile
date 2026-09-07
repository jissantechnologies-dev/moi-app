# @node-rs/argon2 ships prebuilt binaries, so nothing here needs a compiler.
# Installing in a separate stage still keeps npm's cache out of the final image.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
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
