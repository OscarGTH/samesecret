# Samesecret - Socialist Millionaire Protocol Matcher

Samesecret is a web application that implements the mathematical Socialist Millionaire Protocol (SMP) to compare raw secrets cryptographically. Neither participant learns the other's secret unless they match. The server never sees any plaintext secrets, operating strictly as an ephemeral coordinator.

---

## Local Development and Running Locally

### Prerequisites

- Node.js (version 18 or higher is recommended)
- npm (Node Package Manager)

### 1. Install Dependencies

Clone or extract the source code, navigate to the folder, and run:

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory. You can copy the template provided in `.env.example`:

```bash
cp .env.example .env
```

Open `.env` and fill in the values:
- `APP_URL`: The base URL where the application is accessed (e.g., `http://localhost:3000`).

### 3. Run the Development Server

The backend and frontend dev elements run in union through a Vite-integrated Express server:

```bash
npm run dev
```

The application will be accessible at:
```
http://localhost:3000
```

### 4. Build and Run in Production Mode Locally

To verify and test the compiled production structure:

```bash
# Compile client-side Vite bundle and server-side CommonJS bundle
npm run build

# Start the built production server
npm run start
```

---

## Deploying to a VPS using Docker

Using Docker containers is the recommended option for VPS deployment. The app is packaged with a multi-stage `Dockerfile` to create a minimal, optimized runtime footprint.

### Prerequisites on the VPS

- Docker installed
- Docker Compose installed

### 1. Transfer Project Files

Archive and send the project files to your VPS, or pull them directly onto your server. Make sure the following files are present in the target directory on your VPS:
- `assets/`
- `src/`
- `index.html`
- `package.json`
- `package-lock.json`
- `server.ts`
- `tsconfig.json`
- `vite.config.ts`
- `Dockerfile`
- `docker-compose.yml`

### 2. Run with Docker Compose

On your VPS, navigate to the directory containing `docker-compose.yml` and run:

```bash
docker compose up --build -d
```

This command will:
1. Trigger the multi-stage Docker build to compile your react assets and bundler.
2. Spin up a production-ready container named `samesecret-app`.
3. Set Node to production mode (`NODE_ENV=production`).
4. Keep the server automatically restarted if it exits.
5. Bind container port 3000 to server port 3000.

### 3. Check Logs and Status

To confirm the container is running and listen to standard outputs:

```bash
docker compose logs -f
```

To stop the instance:

```bash
docker compose down
```

---

## Setting up Nginx Reverse Proxy and SSL on your VPS

To expose your app securely to the wider internet with HTTPS, setup Nginx on your VPS to forward traffic to the Docker container.

### 1. Install Nginx (if not already present)

```bash
# For Ubuntu/Debian
sudo apt update
sudo apt install nginx -y
```

### 2. Create an Nginx Configuration Block

Create a configuration file (for example, `/etc/nginx/sites-available/samesecret`):

```nginx
server {
    listen 80;
    server_name yourdomain.com; # Replace with your registered domain

    # Increase payload limits matching secret transfers if needed
    client_max_body_size 5M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site configuration and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/samesecret /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. Secure and Obtain a Free SSL Certificate (Let's Encrypt)

Install Certbot and the Nginx plugin:

```bash
sudo apt install certbot python3-certbot-nginx -y
```

Request and apply the SSL certificate automatically:

```bash
sudo certbot --nginx -d yourdomain.com
```

Select the option to automatically redirect all HTTP traffic to HTTPS. Your Nginx server block is now secured and will route traffic seamlessly to samesecret running inside your container.
