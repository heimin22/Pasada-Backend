FROM oven/bun:1

WORKDIR /app

# Copy package files first
COPY package*.json bun.lock ./

# Install dependencies without running postinstall (which tries to build)
RUN bun install --ignore-scripts

# Copy source code
COPY . .

# Now run the build
RUN bun run build

EXPOSE 8080
CMD ["bun", "dist/server.js"]
