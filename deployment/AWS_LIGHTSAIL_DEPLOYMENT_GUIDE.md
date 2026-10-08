# AWS Lightsail Deployment & CI/CD Automation Guide
**Project:** Digital Sanskrit Guru Ecommerce Website  
**Date:** October 8, 2026  
**Infrastructure:** AWS Lightsail (Ubuntu 22.04 / 24.04 LTS, Dual-Stack IPv4/IPv6, 1 GB RAM, 1 vCPU, 40 GB SSD)

---

## 1. Architecture Summary

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Server** | AWS Lightsail Ubuntu Instance | Dedicated cloud compute hosting both frontend and backend |
| **Web Server & Reverse Proxy** | Nginx | Serves static React build files (`/dist`) and proxies `/api` to Express |
| **Backend Runtime** | Node.js 20.x + PM2 | Production process management, crash restart, clustering (`WEB_CONCURRENCY=1`) |
| **Database** | MongoDB Atlas | Cloud MongoDB database cluster |
| **Security & SSL** | Let's Encrypt / Certbot | Automated SSL certificates (HTTPS on port 443) |
| **Automation / CI/CD** | GitHub Actions | Automatic build and deployment on every `git push origin main` |

---

## 2. Phase 1: AWS Lightsail Provisioning (Completed)

1. **Instance Created:**
   - Platform: Linux/Unix
   - Blueprint: Ubuntu OS Only
   - Plan: $7/month ($5 compute + $2 public IPv4 allocation)
   - Instance Name: `ecommerce-server`
   - Location: Mumbai (`ap-south-1`)

2. **Permanent Static IP:**
   - Static IP created and attached to `ecommerce-server`.
   - Guaranteed IP address retention across server restarts and reboots.

3. **Firewall Rules Configured:**
   - `HTTP (Port 80)` -> Allowed from `Anywhere IPv4/IPv6`
   - `HTTPS (Port 443)` -> Allowed from `Anywhere IPv4/IPv6`
   - `SSH (Port 22)` -> Allowed for Lightsail browser SSH and remote terminal

---

## 3. Phase 2: Server Environment & Memory Optimization

### Why Swap Memory is Essential:
On a 1 GB RAM server, running `npm run build` (Vite / React bundling) or installing large npm packages can briefly exceed physical RAM. A 2 GB swap file guarantees zero memory crashes during builds.

### Commands Executed:
```bash
# 1. Create and enable 2GB Swap Space
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 2. Update Ubuntu repositories and install Node.js 20, Nginx, Git, PM2
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx
sudo npm install -g pm2
```

---

## 4. Phase 3: Project Setup & First Build

```bash
# 1. Create deployment directory with correct permissions
sudo mkdir -p /var/www/ecommerce
sudo chown -R $USER:$USER /var/www/ecommerce
cd /var/www/ecommerce

# 2. Clone repository
git clone <YOUR_GITHUB_REPO_URL> .

# 3. Create production backend environment file
nano backend/.env
# (Enter MONGO_URI, JWT_SECRET, RAZORPAY keys, etc.)

# 4. Install dependencies and build React frontend
npm install
npm run build

# 5. Start Backend with PM2 Process Manager
cd backend
pm2 start server.js --name "ecommerce-api" --env NODE_ENV=production,WEB_CONCURRENCY=1
pm2 save
pm2 startup
```

---

## 5. Phase 4: Nginx Web Server & Reverse Proxy Configuration

Create `/etc/nginx/sites-available/ecommerce`:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Serve React Frontend build
    root /var/www/ecommerce/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Reverse proxy API requests to Node.js backend on port 5001
    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site configuration:
```bash
sudo ln -s /etc/nginx/sites-available/ecommerce /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 6. Phase 5: Free Auto-Renewing SSL (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 7. Phase 6: Automated CI/CD (GitHub Actions)

### Step 1: Generate Deployment Key on Lightsail
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy
```

### Step 2: Store GitHub Secrets
In GitHub Repo -> **Settings** -> **Secrets and variables** -> **Actions**:
* `LIGHTSAIL_IP`: Your Lightsail Static IP
* `LIGHTSAIL_USER`: `ubuntu`
* `LIGHTSAIL_SSH_KEY`: Private key from above

### Step 3: Workflow Configuration (`.github/workflows/deploy.yml`)
Every `git push origin main` triggers an automated zero-downtime deployment:
```yaml
name: Auto Deploy to AWS Lightsail

on:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Deploy Application
    runs-on: ubuntu-latest

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.LIGHTSAIL_IP }}
          username: ${{ secrets.LIGHTSAIL_USER }}
          key: ${{ secrets.LIGHTSAIL_SSH_KEY }}
          script: |
            set -e
            cd /var/www/ecommerce
            git pull origin main
            npm install
            npm run build
            pm2 reload ecommerce-api --update-env
```
