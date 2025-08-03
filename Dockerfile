# Stage 1: Build the application
FROM node:20-slim as builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Run the application
FROM node:20-slim

WORKDIR /app

# Copy only necessary files from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.env.example ./.env.example
COPY --from=builder /app/prisma ./prisma

# Install Prisma CLI for database operations
RUN npm install -g prisma

# Expose the port the app runs on
EXPOSE 3000

# Command to initialize database and start the app
CMD ["sh", "-c", "npx prisma migrate deploy && HOST=$HOST npm run start"]
