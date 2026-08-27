#!/bin/bash

# Script to create .env files for frontend and/or backend

# Default paths
env_file_frontend="frontend/.env"
env_file_backend="backend/.env"
env_file_admin="admin_panel/.env"
env_file_deployment=".env"

# Function to create frontend .env file
create_frontend_env() {
    echo "Creating dynamic .env file for frontend"
    echo "# Generated .env file for Frontend" > $env_file_frontend

    echo "$SECRETS_JSON" | jq -r 'to_entries | map(select(.key | startswith("NEXT_"))) | .[] | "\(.key)=\"\(.value | gsub("\""; "\\\""))\""' >> $env_file_frontend
    echo "$VARS_JSON" | jq -r 'to_entries | map(select(.key | startswith("NEXT_"))) | .[] | "\(.key)=\(.value)"' >> $env_file_frontend

    echo "Frontend .env file created successfully!"
}

# Function to create backend .env file
create_backend_env() {
    echo "Creating dynamic .env file for backend"
    echo "# Generated .env file for Backend" > $env_file_backend

    echo "$SECRETS_JSON" | jq -r 'to_entries | .[] | "\(.key)=\"\(.value | gsub("\""; "\\\""))\""' >> $env_file_backend
    echo "$VARS_JSON" | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' >> $env_file_backend

    echo "Backend .env file created successfully!"
}

# Function to create admin_panel (Django) .env file. Same "dump everything"
# approach as backend: add whatever DJANGO_*/POSTGRES_*/GRAFANA_* secrets or
# vars you want in the GitHub repo settings and they show up here, no script
# changes needed.
create_admin_env() {
    echo "Creating dynamic .env file for admin panel"
    echo "# Generated .env file for Admin Panel" > $env_file_admin

    echo "$SECRETS_JSON" | jq -r 'to_entries | .[] | "\(.key)=\"\(.value | gsub("\""; "\\\""))\""' >> $env_file_admin
    echo "$VARS_JSON" | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' >> $env_file_admin

    echo "Admin panel .env file created successfully!"
}

create_deployment_env() {
  echo "Creating dynamic .env file for deployment"
  echo "# Generated .env file for Deployment" > $env_file_deployment

  IMAGE_NAME_BACKEND=$(echo "${GITHUB_REPOSITORY#${GITHUB_REPOSITORY_OWNER}/}-backend" | tr '[:upper:]' '[:lower:]')
  IMAGE_NAME_FRONTEND=$(echo "${GITHUB_REPOSITORY#${GITHUB_REPOSITORY_OWNER}/}-frontend" | tr '[:upper:]' '[:lower:]')
  IMAGE_NAME_BOT=$(echo "${GITHUB_REPOSITORY#${GITHUB_REPOSITORY_OWNER}/}-bot" | tr '[:upper:]' '[:lower:]')
  IMAGE_NAME_ADMIN=$(echo "${GITHUB_REPOSITORY#${GITHUB_REPOSITORY_OWNER}/}-admin" | tr '[:upper:]' '[:lower:]')
  IMAGE_OWNER=$(echo "${GITHUB_REPOSITORY_OWNER}" | tr '[:upper:]' '[:lower:]')
  echo "IMAGE_PATH_BACKEND=ghcr.io/${IMAGE_OWNER}/${IMAGE_NAME_BACKEND}:latest" >> $env_file_deployment
  echo "IMAGE_PATH_FRONTEND=ghcr.io/${IMAGE_OWNER}/${IMAGE_NAME_FRONTEND}:latest" >> $env_file_deployment
  echo "IMAGE_PATH_BOT=ghcr.io/${IMAGE_OWNER}/${IMAGE_NAME_BOT}:latest" >> $env_file_deployment
  echo "IMAGE_PATH_ADMIN=ghcr.io/${IMAGE_OWNER}/${IMAGE_NAME_ADMIN}:latest" >> $env_file_deployment

  echo "GITHUB_TOKEN=$GITHUB_TOKEN" >> $env_file_deployment
  echo "GITHUB_ACTOR=$GITHUB_ACTOR" >> $env_file_deployment

  # docker-compose.yml also needs POSTGRES_*/GRAFANA_* (and anything else you
  # add) available for ${VAR} substitution at `docker stack deploy` time --
  # see run.sh's explicit exports.
  echo "$SECRETS_JSON" | jq -r 'to_entries | .[] | "\(.key)=\"\(.value | gsub("\""; "\\\""))\""' >> $env_file_deployment
  echo "$VARS_JSON" | jq -r 'to_entries | .[] | "\(.key)=\(.value)"' >> $env_file_deployment

  echo "Deployment .env file created successfully!"
}

# Check arguments and call the appropriate function
if [ "$1" == "frontend" ]; then
    create_frontend_env
elif [ "$1" == "backend" ]; then
    create_backend_env
elif [ "$1" == "admin" ]; then
    create_admin_env
elif [ "$1" == "deployment" ]; then
    create_deployment_env
elif [ "$1" == "all" ] || [ -z "$1" ]; then
    create_frontend_env
    create_backend_env
    create_admin_env
    create_deployment_env
else
    echo "Invalid option. Use 'frontend', 'backend', 'admin', 'deployment' or 'all'."
    exit 1
fi