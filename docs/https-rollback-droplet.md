# HTTPS-to-HTTP Rollback: Droplet Changes

After merging the `rollback-https` branch, the following changes need to be made on the DigitalOcean droplet (167.71.81.89) via SSH.

## 1. Update Nginx Configuration

Edit the Nginx site config:

```bash
sudo nano /etc/nginx/sites-available/default
```

Remove:
- Any `server` block listening on port 443 with `ssl`
- Any `return 301 https://...` redirect in the port 80 block
- All `ssl_certificate` and `ssl_certificate_key` directives

Keep a single server block:

```nginx
server {
    listen 80;
    server_name 167.71.81.89;

    location / {
        proxy_pass http://localhost:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Test and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 2. Disable Certbot Auto-Renewal

```bash
sudo systemctl stop certbot.timer
sudo systemctl disable certbot.timer
```

## 3. Remove Expired SSL Certificate

```bash
sudo certbot certificates          # list certs to find the exact name
sudo certbot delete --cert-name [NAME_FROM_ABOVE]
```

## 4. Verify Server .env

In the project's `server/` directory on the droplet, confirm the `.env` uses HTTP:

```bash
cat ~/COP4331-Large-Project/server/.env | grep URL
```

`FRONTEND_URL` should be `http://...`, not `https://...`.

## 5. (Optional) Close Port 443

If nothing else on the droplet needs HTTPS:

```bash
sudo ufw deny 443
sudo ufw reload
```

## Verification

After completing the above:

```bash
curl http://167.71.81.89:5050/
```

The API should respond over plain HTTP.
