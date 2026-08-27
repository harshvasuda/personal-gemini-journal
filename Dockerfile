# Use official Node.js runtime as the base image
FROM node:18-slim

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port Cloud Run expects
ENV PORT=8080
EXPOSE 8080

# Command to run the application
CMD ["npm", "start"]