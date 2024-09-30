#!/bin/bash

set -o errexit

# Vars
desired_os=0
os=""
setup_type="" # values: "default" | "local_dbt"
INSTALLATION_ID=$(curl -s 'https://www.uuidgenerator.net/api/version4')
LIGHTDASH_INSTALL_TYPE='bash_install'
dbt_project_dir=""
port=8080

# Events
Started="bash_install.started"
Failed="bash_install.failed"
Successful="bash_install.successful"
Support="bash_install.support"

# Errors
OsNotSupported="OS Not Supported"
DockerNotInstalled="Docker not installed"
ContainersNotStarted="Containers not started"
Interrupted="Interrupted"
DockerComposeNotFound="Docker Compose not found"
PortNotAvailable="Port not available"

# Regular Colors
Black='\033[0;30m'        # Black
Red='\[\e[0;31m\]'        # Red
Green='\033[0;32m'        # Green
Yellow='\033[0;33m'       # Yellow
Blue='\033[0;34m'         # Blue
Purple='\033[0;35m'       # Purple
Cyan='\033[0;36m'         # Cyan
White='\033[0;37m'        # White
NC='\033[0m' # No Color

is_command_present() {
    type "$1" >/dev/null 2>&1
}

# Check whether 'wget' command exists.
has_wget() {
    has_cmd wget
}

# Check whether 'curl' command exists.
has_curl() {
    has_cmd curl
}

# Check whether the given command exists.
has_cmd() {
    command -v "$1" > /dev/null 2>&1
}

is_mac() {
    [[ $OSTYPE == darwin* ]]
}

is_windows() {
    [[ $OSTYPE == msys* ]]
}

check_os() {
    if is_mac; then
        package_manager="brew"
        desired_os=1
        os="Mac"
        return
    fi

    if is_windows; then
        desired_os=1
        os="Windows"
        return
    fi

    os_name="$(cat /etc/*-release | awk -F= '$1 == "NAME" { gsub(/"/, ""); print $2; exit }')"

    case "$os_name" in
        Ubuntu*)
            desired_os=1
            os="ubuntu"
            package_manager="apt-get"
            ;;
        Amazon\ Linux*)
            desired_os=1
            os="amazon linux"
            package_manager="yum"
            ;;
        Debian*)
            desired_os=1
            os="debian"
            package_manager="apt-get"
            ;;
        Linux\ Mint*)
            desired_os=1
            os="linux mint"
            package_manager="apt-get"
            ;;
        Red\ Hat*)
            desired_os=1
            os="red hat"
            package_manager="yum"
            ;;
        CentOS*)
            desired_os=1
            os="centos"
            package_manager="yum"
            ;;
        SLES*)
            desired_os=1
            os="sles"
            package_manager="zypper"
            ;;
        openSUSE*)
            desired_os=1
            os="opensuse"
            package_manager="zypper"
            ;;
        Arch\ Linux*)
            desired_os=1
            os="arch"
            package_manager="pacman"
            ;;
        *)
            desired_os=0
            os="Not Found: $os_name"
    esac
}

track() {
  if [[ $CI == 'true' ]]; then
    return
  fi
  DATA='{
    "anonymousId":"'"$INSTALLATION_ID"'",
    "event": "'"$1"'",
    "properties": { "os": "'"$os"'", "setup_type": "'"$setup_type"'", "port": "'"$port"'"'$2'}
  }'
  URL="https://analytics.lightdash.com/v1/track"
  HEADER='Content-Type: application/json'
  HEADER_AUTH='Authorization: Basic MXZxa1NsV01WdFlPbDcwcmszUVNFMHYxZnFZOg=='

  if has_curl; then
      curl -sfL -d "$DATA" --header "$HEADER" --header "$HEADER_AUTH" "$URL" > /dev/null 2>&1
  elif has_wget; then
      wget -q --post-data="$DATA" --header="$HEADER" --header "$HEADER_AUTH" "$URL" > /dev/null 2>&1
  fi
}

track_error() {
  track $Failed ', "error": "'"$1"'"'
}

track_support() {
  echo -e "\n📨 🙏 Sorry that you had an issue with the installation. Please head to our Slack community and post your issue in #help 🙋 \n https://join.slack.com/t/lightdash-community/shared_invite/zt-2ehqnrvqt-LbCq7cUSFHAzEj_wMuxg4A \n Someone from Lightdash will help you out (usually the same day)"
}

# This function checks if the relevant ports required by Lightdash are available or not
# The script should error out in case they aren't available
check_ports_occupied() {
    local port_check_output
    local ports_pattern=$port

    if is_mac; then
        port_check_output="$(netstat -anp tcp | awk '$6 == "LISTEN" && $4 ~ /^.*\.('"$ports_pattern"')$/')"
    elif is_command_present ss; then
        # The `ss` command seems to be a better/faster version of `netstat`, but is not available on all Linux
        # distributions by default. Other distributions have `ss` but no `netstat`. So, we try for `ss` first, then
        # fallback to `netstat`.
        port_check_output="$(ss --all --numeric --tcp | awk '$1 == "LISTEN" && $4 ~ /^.*:('"$ports_pattern"')$/')"
    elif is_command_present netstat; then
        port_check_output="$(netstat --all --numeric --tcp | awk '$6 == "LISTEN" && $4 ~ /^.*:('"$ports_pattern"')$/')"
    fi

    if [[ -n $port_check_output ]]; then
        track_error "$PortNotAvailable"

        echo "+++++++++++ ERROR ++++++++++++++++++++++"
        echo "Lightdash requires ports $port to be open. Please shut down any other service(s) that may be running on these ports."
        echo "++++++++++++++++++++++++++++++++++++++++"
        echo ""
        exit 1
    fi
}

install_docker() {
    echo "++++++++++++++++++++++++"
    echo "Setting up docker repos"


    if [[ $package_manager == apt-get ]]; then
        apt_cmd="sudo apt-get --yes --quiet"
        $apt_cmd update
        $apt_cmd install software-properties-common gnupg-agent
        curl -fsSL "https://download.docker.com/linux/$os/gpg" | sudo apt-key add -
        sudo add-apt-repository \
            "deb [arch=amd64] https://download.docker.com/linux/$os $(lsb_release -cs) stable"
        $apt_cmd update
        echo "Installing docker"
        $apt_cmd install docker-ce docker-ce-cli containerd.io
    elif [[ $package_manager == zypper ]]; then
        zypper_cmd="sudo zypper --quiet --no-gpg-checks --non-interactive"
        echo "Installing docker"
        if [[ $os == sles ]]; then
            os_sp="$(cat /etc/*-release | awk -F= '$1 == "VERSION_ID" { gsub(/"/, ""); print $2; exit }')"
            os_arch="$(uname -i)"
            sudo SUSEConnect -p sle-module-containers/$os_sp/$os_arch -r ''
        fi
        $zypper_cmd install docker docker-runc containerd
        sudo systemctl enable docker.service
    elif [[ $package_manager == yum && $os == 'amazon linux' ]]; then
        echo
        echo "Amazon Linux detected ... "
        echo
        sudo yum install docker
        sudo service docker start
    elif [[ $package_manager == pacman ]]; then
        echo "Installing docker"
        # sudo pacman -Syu
        sudo pacman -S docker --noconfirm # (docker, containerd, runc)
        docker info
        sudo systemctl enable --now docker
        sudo usermod -aG docker $USER
    else

        yum_cmd="sudo yum --assumeyes --quiet"
        $yum_cmd install yum-utils
        sudo yum-config-manager --add-repo https://download.docker.com/linux/$os/docker-ce.repo
        echo "Installing docker"
        $yum_cmd install docker-ce docker-ce-cli containerd.io

    fi

}
install_docker_machine() {

    echo "\nInstalling docker machine ..."

    if [[ $os == "Mac" ]];then
        curl -sL https://github.com/docker/machine/releases/download/v0.16.2/docker-machine-`uname -s`-`uname -m` >/usr/local/bin/docker-machine
        chmod +x /usr/local/bin/docker-machine
    else
        curl -sL https://github.com/docker/machine/releases/download/v0.16.2/docker-machine-`uname -s`-`uname -m` >/tmp/docker-machine
        chmod +x /tmp/docker-machine
        sudo cp /tmp/docker-machine /usr/local/bin/docker-machine

    fi


}

check_docker_version() {
    docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
    major_version=$(echo "$docker_version" | cut -d. -f1)
    minor_version=$(echo "$docker_version" | cut -d. -f2)

    if [[ "$major_version" -lt 20 ]] || [[ "$major_version" -eq 20 && "$minor_version" -lt 10 ]]; then
        echo "Docker version 20.10 or higher is required. Please update your Docker installation."
        exit 1
    fi
}

start_docker() {
    echo "Starting Docker ..."
    if [ $os = "Mac" ]; then
      if open -Ra Docker; then
        open --background -a Docker && while ! docker system info > /dev/null 2>&1; do sleep 1; done
      else
        open --background -a OrbStack && while ! docker system info > /dev/null 2>&1; do sleep 1; done
      fi
    elif [ $os = "Windows" ]; then
      echo "+++++++++++ IMPORTANT READ ++++++++++++++++++++++"
      echo "Make sure Docker Desktop is running."
      echo "+++++++++++++++++++++++++++++++++++++++++++++++++"
    else
        if ! sudo systemctl is-active docker.service > /dev/null; then
            echo "Starting docker service"
            sudo systemctl start docker.service
        fi
    fi
}
wait_for_containers_start() {
    local timeout=$1

    # The while loop is important because for-loops don't work for dynamic values
    while [[ $timeout -gt 0 ]]; do
        status_code="$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/v1/health || true)"
        if [[ status_code -eq 200 ]]; then
            break
        else
            echo -ne "Waiting for all containers to start. This check will timeout in $timeout seconds ...\r\c"
            if [ $os = "Windows" ]; then
                  echo "+++++++++++ IMPORTANT READ ++++++++++++++++++++++"
                  echo "If you are getting the error 'Error response from daemon: i/o timeout'."
                  echo "Go to Docker > Settings > General and enable the option 'Expose daemon on tcp://localhost:2375 without TLS'"
                  echo "+++++++++++++++++++++++++++++++++++++++++++++++++"
            fi
        fi
        ((timeout--))
        sleep 1
    done

    echo ""
}

set_vars() {
    echo -e "⚙️  Enter your Lightdash settings:"
    if [ $setup_type == 'local_dbt' ]; then
        while [[ $dbt_project_dir == "" ]]
        do
            read -rp 'Absolute path to dbt project directory (e.g ~/absolute/path/to/dbt/project): ' dbt_project_dir
        done
    fi

    read -p "Port [8080]: " port
    if [[ $port == "" ]];then
      port=8080
    fi
}

bye() {  # Prints a friendly good bye message and exits the script.
    if [ "$?" -ne 0 ]; then
        set +o errexit

        echo "🔴 The containers didn't seem to start correctly. Please run the following command to check containers that may have errored out:"
        echo ""
        echo -e "docker compose -f docker-compose.yml ps -a"
        echo "Please reach us on Lightdash for support https://join.slack.com/t/lightdash-community/shared_invite/zt-2ehqnrvqt-LbCq7cUSFHAzEj_wMuxg4A"
        echo "++++++++++++++++++++++++++++++++++++++++"
        track_error $Interrupted
        track_support
        exit 0
    fi
}


echo -e "👋 Thank you for trying out Lightdash! "
echo ""


# Checking OS and assigning package manager
echo -e "Detecting your OS ..."
check_os
echo -e "\n✅ Detected OS: ${os}"

echo ""

echo -e "👉 ${RED}Please enter how you want to setup Lightdash\n"
echo -e "${RED}1) Fast install [default]\n"
echo -e "${RED}2) Custom install\n"

if [[ $CI == 'true' ]]; then
    choice_setup=1
else
    read -p "⚙️  Enter your preference (1/2):" choice_setup
fi

while [[ $choice_setup != "1"   &&  $choice_setup != "2" && $choice_setup != "" ]]
do
    echo -e "\n❌ ${CYAN}Please enter either 1 or 2"
    read -p "⚙️  Enter your preference (1/2):  " choice_setup
done

if [[ $choice_setup == "1" || $choice_setup == "" ]];then
    setup_type='default'
    echo -e "\n✅ ${CYAN}You have chosen: fast setup\n"
else
    setup_type='local_dbt'
    echo -e "\n✅ ${CYAN}You have chosen: local dbt project setup\n"
fi

# Run bye if failure happens
trap bye EXIT

track $Started
if [[ $setup_type == 'local_dbt' ]]; then
    set_vars
fi

if [[ $desired_os -eq 0 ]];then
    track_error "$OsNotSupported"
fi

# check_ports_occupied

# Check is Docker daemon is installed and available. If not, the install & start Docker for Linux machines. We cannot automatically install Docker Desktop on Mac OS
if ! is_command_present docker; then
    if [[ $package_manager == "apt-get" || $package_manager == "zypper" || $package_manager == "yum" || $package_manager == "pacman"  ]]; then
        install_docker
    else
        echo ""
        echo "+++++++++++ IMPORTANT READ ++++++++++++++++++++++"
        echo "Docker Desktop must be installed manually on Mac OS or Windows to proceed. Docker can only be installed automatically on Ubuntu / openSUSE / SLES / Redhat / Cent OS / Arch"
        echo "https://docs.docker.com/docker-for-mac/install/"
        echo "++++++++++++++++++++++++++++++++++++++++++++++++"
        track_error "$DockerNotInstalled"
        exit 1
    fi
fi

# Check for compatible Docker version
check_docker_version

start_docker

echo ""
echo -e "\n🟡 Pulling the latest container images for Lightdash.\n"
LIGHTDASH_INSTALL_ID="$INSTALLATION_ID" LIGHTDASH_INSTALL_TYPE="$LIGHTDASH_INSTALL_TYPE" docker compose --env-file ./.env.fast-install -f docker-compose.yml pull

echo ""
echo "🟡 Starting the Lightdash containers. It may take a few minutes ..."
echo
# TODO: Remove once verified that the docker compose command works as expected from user feedback
# The docker-compose command does some nasty stuff for the `--detach` functionality. So we add a `|| true` so that the
# script doesn't exit because this command looks like it failed to do it's thing.
if [[ $setup_type == 'local_dbt' ]]; then
    LIGHTDASH_INSTALL_ID="$INSTALLATION_ID" LIGHTDASH_INSTALL_TYPE="$LIGHTDASH_INSTALL_TYPE" PORT="$port" DBT_PROJECT_DIR="$dbt_project_dir" docker compose --env-file ./.env.fast-install -f docker-compose.yml up --detach --remove-orphans || true
else
    LIGHTDASH_INSTALL_ID="$INSTALLATION_ID" LIGHTDASH_INSTALL_TYPE="$LIGHTDASH_INSTALL_TYPE" docker compose --env-file ./.env.fast-install -f docker-compose.yml up --detach --remove-orphans || true
fi

wait_for_containers_start 60
echo ""

if [[ $status_code -ne 200 ]]; then
    echo "+++++++++++ ERROR ++++++++++++++++++++++"
    echo "🔴 The containers didn't seem to start correctly. Please run the following command to check containers that may have errored out:"
    echo ""
    echo -e "docker compose -f docker-compose.yml ps -a"
    echo "Please reach us on Lightdash for support https://join.slack.com/t/lightdash-community/shared_invite/zt-2ehqnrvqt-LbCq7cUSFHAzEj_wMuxg4A"
    echo "++++++++++++++++++++++++++++++++++++++++"

    track_error "$ContainersNotStarted"
    track_support
    exit 1

else
    track $Successful
    echo "++++++++++++++++++ SUCCESS ++++++++++++++++++++++"
    echo ""
    echo "🟢 Your installation is complete!"
    echo ""
    echo -e "🟢 Your frontend is running on http://localhost:$port"
    echo ""

    echo "ℹ️  To restart Lightdash: docker compose -f docker-compose.yml start"
    echo "ℹ️  To stop Lightdash: docker compose -f docker-compose.yml stop -v"
    echo "ℹ️  To bring down Lightdash and clean volumes: docker compose -f docker-compose.yml down -v"

    echo ""
    echo "+++++++++++++++++++++++++++++++++++++++++++++++++"
    echo ""
    echo "👉 Need help Getting Started?"
    echo -e "Join us on Slack https://join.slack.com/t/lightdash-community/shared_invite/zt-2ehqnrvqt-LbCq7cUSFHAzEj_wMuxg4A"
    echo ""

fi

echo -e "\n🙏 Thank you!\n"
