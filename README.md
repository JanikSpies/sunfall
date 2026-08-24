# Sunfall

BärnHäckt 2026 project of the OvoRocks team.

## Local Setup

Make .env file from example.

```
cp frontend/.example.env frontend/.env.local
```

Launch docker containers.

```Shell
docker compose -f docker-compose.dev.yml up --build -d
```

Go to [localhost](localhost).

Profit.


## Bots

### Local

Turn on:

```Shell
docker compose -f docker-compose.dev.yml --profile bots up --build -d
```

Turn off:

```Shell
docker compose -f docker-compose.dev.yml stop dev_bot
```

### Server

Replicas is 0 by default. turn on like this:

```Shell
docker service scale sunfall_prod_bot=1
```

Scale back to 0 when done!
