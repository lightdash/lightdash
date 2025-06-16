#!/bin/sh

ORIGINAL_COMMAND="./scripts/start.sh"

PIPE=/tmp/stderr_pipe_headless_browser
mkfifo "$PIPE"
trap "rm -f $PIPE" EXIT

# Start a background process to read from the pipe and re-route the logs.
while IFS= read -r line; do
  # Attempt to extract the logger string from the second field of the line.
  # The awk command does two things:
  # 1. '$2 ~ /.../' checks if the second field ($2) matches the browserless format.
  # 2. If it matches, '{print $2; exit}' prints that field and stops.
  LOGGER_PART=$(echo "$line" | awk '$2 ~ /browserless\.io:.*:.*/ {print $2; exit}')

  # Check if the LOGGER_PART variable is non-empty (meaning awk found a match).
  if [ -n "$LOGGER_PART" ]; then
    # It's a standard browserless log line.
    LEVEL=$(echo "$LOGGER_PART" | rev | cut -d':' -f1 | rev)

    case "$LEVEL" in
      "trace"|"debug"|"info")
        # This is an informational log. Route to stdout.
        echo "$line"
        ;;
      *)
        # This is a warn, error, or fatal log. Route to stderr.
        echo "$line" >&2
        ;;
    esac
  else
    # This line does NOT match the format (e.g., a crash message).
    # Treat it as an information log by default and route to stdout.
    echo "$line"
  fi

done < "$PIPE" &

# Execute the main application.
# Redirect its stderr (2) to our named pipe, which the background loop reads.
# Its stdout (1) will pass through this script untouched.
exec $ORIGINAL_COMMAND "$@" 2>"$PIPE"