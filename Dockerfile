# Using the Apify Node.js base image
FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "NPM install succeeded"

# Copy source code
COPY . ./

# Run the actor
CMD npm start
