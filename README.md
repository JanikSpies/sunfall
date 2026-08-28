<div align="center">
  <img src="frontend/public/assets/main/logo-white.svg" width="140" alt="Sunfall" />

  # Sunfall

  BärnHäckt 2026 project of the OvoRocks team.
</div>

## Local setup

```bash
cp frontend/.example.env frontend/.env.local
docker compose -f docker-compose.dev.yml up --build -d
```

Go to [localhost](http://localhost). Profit.

## Analytics

- Admin: [localhost/admin](http://localhost/admin)
- Grafana: [localhost/graphs](http://localhost/graphs)

Local credentials: `admin` / `admin`

## Bots

**Local**

```bash
docker compose -f docker-compose.dev.yml --profile bots up --build -d   # on
docker compose -f docker-compose.dev.yml stop dev_bot                   # off
```

**Server**

```bash
docker service scale sunfall_prod_bot=1   # on
docker service scale sunfall_prod_bot=0   # off — do this when done!
```
