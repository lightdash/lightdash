#!/bin/bash

# all colors: https://en.wikipedia.org/wiki/ANSI_escape_code
NOCOLOR='\033[0m'
YELLOW='\033[0;33m'
GRAY='\033[0;37m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'

has_cmd() {
    command -v "$1" > /dev/null 2>&1
}
has_odbcinst() {
    has_cmd "odbcinst"
}

if has_odbcinst; then
    echo "Dependency ODBC exists"
else 
    echo ""
    echo -e "${YELLOW}warning:${NOCOLOR} Can't find ODBC drivers, you must install ODBC dependencies before installing ${GREEN}Lightdash CLI${NOCOLOR}"
    echo ""
    echo -e "- on Ubuntu/Debian: ${GRAY}sudo apt-get install unixodbc unixodbc-dev${NOCOLOR}"
    echo -e "- on RedHat/CentOS: ${GRAY} sudo yum install unixODBC unixODBC-devel${NOCOLOR}"
    echo -e "- on OSX using macports.org: ${GRAY}sudo port unixODBC${NOCOLOR}"
    echo -e "- on OSX using brew: ${GRAY}brew install unixODBC${NOCOLOR}"
    echo -e "- on IBM using yum: ${GRAY}i yum install unixODBC unixODBC-devel${NOCOLOR}"
    echo ""
    echo -e "More details on: ${CYAN}https://www.npmjs.com/package/@ngrey5/odbc${NOCOLOR}"
    echo "" 
fi

exit 0