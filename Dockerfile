FROM node:20-slim

# Install Chromium + required fonts/libs
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    fonts-noto \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer: skip downloading bundled Chrome, use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HEADLESS=true
# NOTE: Do NOT hardcode PORT here — Railway/Render/Fly inject their own PORT env var

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN rm -f page.html

# Railway injects $PORT at runtime, so EXPOSE is just documentation
EXPOSE 8080

CMD ["node", "server.js"]
