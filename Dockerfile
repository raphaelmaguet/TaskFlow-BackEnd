FROM node:20-alpine

WORKDIR /app

# pnpm via corepack (gestionnaire de paquets standard du projet — version épinglée
# par le champ "packageManager" de package.json)
RUN corepack enable

# Copy manifest + lockfile pnpm
COPY package.json pnpm-lock.yaml ./

# Install dependencies (frozen = reproductible, échoue si le lock est désynchronisé)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

ENV PORT=80
EXPOSE 80

CMD ["pnpm", "start"]
