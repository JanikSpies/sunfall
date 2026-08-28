#!/bin/bash

# Function to install docker and docker compose
function install_docker {
    sudo apt-get update
    sudo apt-get -y install apt-transport-https ca-certificates curl gnupg-agent software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
    sudo apt-key fingerprint 0EBFCD88

    sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    sudo apt-get update
    sudo apt-get -y install docker-ce docker-ce-cli containerd.io
    sudo gpasswd -a ubuntu docker
    sudo docker swarm init || true

    # Install bash auto completion for docker, docker-compose and docker swarm
    # https://docs.docker.com/compose/completion/
    sudo curl -L https://raw.githubusercontent.com/docker/compose/1.29.2/contrib/completion/bash/docker-compose -o /etc/bash_completion.d/docker-compose

    echo
    echo '************************************************************************'
    echo '* This is a fresh install. Please run this script directly on the host *'
    echo '************************************************************************'
    echo
}

# Function to test the docker setup
function test_docker_setup {
    docker run --rm hello-world
}

function setup {
    local ENV_TYPE=$1

    # Install Docker
    if [[ $(which docker) && $(docker --version) ]]; then
        echo '[*] Docker is already installed...'
    else
        echo '[*] Docker executable is not found. Installing now...'
        install_docker
    fi

    # Set Host
    source .hosts
    source .env

    LE_HOST=$(eval echo "\${${ENV_TYPE^^}_HOST}")

    export LE_HOST
    export IMAGE_PATH_BACKEND
    export IMAGE_PATH_FRONTEND
    export IMAGE_PATH_BOT
    export IMAGE_PATH_ADMIN
    # Consumed via ${VAR} substitution in docker-compose.yml (postgres,
    # admin panel, grafana). Must be set as GitHub repo secrets/vars --
    # see admin_panel/.example.env and the README.
    export POSTGRES_USER
    export POSTGRES_PASSWORD
    export POSTGRES_DB
    export GRAFANA_ADMIN_USER
    export GRAFANA_ADMIN_PASSWORD
    # "Sign in with Django" for Grafana -- see admin_panel/.example.env.
    # Left unset, GRAFANA_OAUTH_ENABLED defaults to false in docker-compose.yml.
    export GRAFANA_ROOT_URL
    export GRAFANA_OAUTH_ENABLED
    export GRAFANA_OAUTH_AUTH_URL
    export OAUTH_CLIENT_ID
    export OAUTH_CLIENT_SECRET

    test_docker_setup

    # Creating data folder tree if not existing already
    base_path="/data"
    mkdir -p "$base_path"

    # Create the directory structure
    mkdir -p "$base_path"/{prod,local,test}/{db,frontend_static,locale,media,static}
    mkdir -p "$base_path/le-config"

    # Set ownership to the ubuntu user
    chown -R ubuntu:ubuntu "$base_path"

    # Allows the user to read, write, and execute (rwx), and others to read and execute
    chmod -R 755 "$base_path"

    STACK_NAME=${LE_HOST%%.*}  # removes the top level domain

    echo '[*] Deploying now'

    # Log into docker registry
    echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
    docker pull "$IMAGE_PATH_BACKEND"
    docker pull "$IMAGE_PATH_FRONTEND"
    docker pull "$IMAGE_PATH_BOT"
    docker pull "$IMAGE_PATH_ADMIN"

    echo "Command: docker stack deploy -c docker-compose.yml --with-registry-auth $STACK_NAME"
    IMAGE_PATH_BACKEND=$IMAGE_PATH_BACKEND IMAGE_PATH_FRONTEND=$IMAGE_PATH_FRONTEND IMAGE_PATH_BOT=$IMAGE_PATH_BOT IMAGE_PATH_ADMIN=$IMAGE_PATH_ADMIN docker stack deploy -c docker-compose.yml --with-registry-auth "$STACK_NAME"

    docker logout ghcr.io
}

# if script is run interactivly
if [[ -z "$1" ]]; then
    echo "Where do you want to deploy?"
    PS3="Please select an option (1 or 2): "
    options=("test" "Prod" "Cancel")
    select opt in "${options[@]}"
    do
        case $opt in
            "test")
                echo "Test isn't configured yet. Feel free to do it."
                break
                ;;
            "prod")
                setup "prod"
                break
                ;;
            "cancel")
                echo "Deployment canceled."
                break
                ;;
            *)
                echo "Invalid option. Please try again."
                ;;
        esac
    done
else
    # If an argument is passed, run the setup directly
    if [[ "$1" == "prod" || "$1" == "test" ]]; then
        setup "$1"
    else
        echo "Invalid environment specified. Use 'test' or 'prod'."
        exit 1
    fi
fi