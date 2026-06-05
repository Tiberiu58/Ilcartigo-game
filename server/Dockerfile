# ILCARTIGO multiplayer server.
#
# Runs the TypeScript entrypoint directly via tsx (no compile-to-JS step) —
# tsx resolves the `.js` ESM specifiers on the `.ts` files at runtime, exactly
# as `npm run dev`/`npm start` do locally.
#
# IMPORTANT: `npm ci` installs ALL deps (NOT --omit=dev). The production run
# command is `npm start` → `tsx ...`, and tsx + typescript live in
# devDependencies. Omitting dev deps makes the container crash "tsx: not found".
FROM node:22-slim

WORKDIR /app

# Install deps first (cached layer) — copy only manifests before the source.
COPY package.json package-lock.json ./
RUN npm ci

# App source.
COPY . .

# Fly sets PORT; default to 8080 to match fly.toml's internal_port. The server
# reads Number(process.env.PORT) and binds 0.0.0.0 by default.
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
