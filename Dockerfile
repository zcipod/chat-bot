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

# Expose the port the app runs on
EXPOSE 3000

# Command to start the app, using HOST environment variables
CMD ["sh", "-c", "HOST=$HOST npm run start"]
