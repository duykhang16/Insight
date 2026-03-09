# Stage 1: Build the React application
FROM node:20-alpine as build

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve the application using Nginx
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# We need a custom nginx configuration to support React Router (SPA fallback) and API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
