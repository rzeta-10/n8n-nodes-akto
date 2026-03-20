FROM n8nio/n8n:latest

USER root

# Copy built package into a temp location
WORKDIR /tmp/n8n-nodes-akto
COPY package.json ./
COPY dist/ ./dist/
COPY icons/ ./icons/

# Install into n8n's custom extensions directory
RUN mkdir -p /home/node/.n8n/custom && \
    cd /home/node/.n8n/custom && \
    npm install /tmp/n8n-nodes-akto && \
    rm -rf /tmp/n8n-nodes-akto

USER node

WORKDIR /home/node

EXPOSE 5678
