server {
    listen 80;
    server_name barrel23.com www.barrel23.com;

    # Let Certbot handle SSL later — for now redirect www → root
    return 301 $scheme://barrel23.com$request_uri;
}

server {
    listen 80;
    server_name barrel23.com;

    client_max_body_size 210M;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Uploads — served directly by nginx from bind-mount path
    location /uploads/ {
        alias /root/barrel23/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Everything else → FastAPI (API + frontend static)
    location / {
        proxy_pass         http://127.0.0.1:8089;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;

        # Cache static assets
        location ~* \.(css|js|ico|woff2?)$ {
            proxy_pass http://127.0.0.1:8089;
            proxy_set_header Host $host;
            expires 7d;
            add_header Cache-Control "public";
        }
    }
}
