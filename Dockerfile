FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (production + tsx needed at runtime)
RUN npm ci

# Copy source
COPY . .

ENV PORT=80
EXPOSE 80

CMD ["npm", "start"]
