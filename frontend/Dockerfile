# Use Node.js image
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose React's default port
EXPOSE 3000

# Start the app
CMD ["npm", "run", "dev", "--", "--host"]