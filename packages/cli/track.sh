#!/bin/bash
# Send anonymous tracking events to rudderstack so we can monitor installations and errors

INSTALLATION_ID=$(curl -s 'https://www.uuidgenerator.net/api/version4')

os=""

is_mac() {
    [[ $OSTYPE == darwin* ]]
}

is_windows() {
    [[ $OSTYPE == msys* ]]
}

check_os() {
    if is_mac; then
        os="Mac"
        return
    fi

    if is_windows; then
        os="Windows"
        return
    fi

    os_name="$(cat /etc/*-release | awk -F= '$1 == "NAME" { gsub(/"/, ""); print $2; exit }')"

    case "$os_name" in
        Ubuntu*)
            os="ubuntu"
            ;;
        Amazon\ Linux*)
            os="amazon linux"
            ;;
        Debian*)
            os="debian"
            ;;
        Linux\ Mint*)
            os="linux mint"
            ;;
        Red\ Hat*)
            os="red hat"
            ;;
        CentOS*)
            os="centos"
            ;;
        SLES*)
            os="sles"
            ;;
        openSUSE*)
            os="opensuse"
            ;;
        *)
            os="Not Found: $os_name"
    esac
}

# Check whether the given command exists.
has_cmd() {
    command -v "$1" > /dev/null 2>&1
}
# Check whether 'wget' command exists.
has_wget() {
    has_cmd wget
}

# Check whether 'curl' command exists.
has_curl() {
    has_cmd curl
}

inform_macos_xcrun_requirement() {
    # Check if xcrun is installed
    if ! command -v xcrun >/dev/null 2>&1; then
        echo "⚠️  macOS users: Before installing the Lightdash CLI, make sure you have 'xcrun' installed."
        echo "    You can install it by running the following command:"
        echo "    xcode-select --install"
        echo "    After installing 'xcrun', you can proceed with the Lightdash CLI installation."
        echo ""
    fi
}

if  [[ $NODE_ENV == "development" || "$CI" == "true" ]]; then 
    echo "Do not send tracking on NODE_ENV=$NODE_ENV or CI=$CI mode" 
    exit 0 
fi

if is_mac; then
    inform_macos_xcrun_requirement
fi

track() {

  check_os
  
  DATA='{
    "anonymousId":"'"$INSTALLATION_ID"'",
    "event": "lightdash_cli.install.'"$1"'",
    "properties": { "os": "'"$os"'"}
  }'
  echo $DATA
  URL="https://analytics.lightdash.com/v1/track"
  HEADER='Content-Type: application/json'
  HEADER_AUTH='Authorization: Basic MXZxa1NsV01WdFlPbDcwcmszUVNFMHYxZnFZOg=='

  if has_curl; then
      curl -sfL -d "$DATA" --header "$HEADER" --header "$HEADER_AUTH" "$URL" > /dev/null 2>&1
  elif has_wget; then
      wget -q --post-data="$DATA" --header="$HEADER" --header "$HEADER_AUTH" "$URL" > /dev/null 2>&1
  fi
}

track $1

exit 0