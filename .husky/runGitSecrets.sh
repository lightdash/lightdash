# Section for git-secrets
if ! command -v git-secrets &> /dev/null
then
    echo "Lightdash repo requires git-secrets to be installed. Visit https://github.com/awslabs/git-secrets#installing-git-secrets to learn how to do it."
    exit 1
fi

# # Initialise git-secrets configuration
git secrets --register-aws > /dev/null

# Custom REGEX patterns Array to check for various custom secrets

# Current patterns:
# - Private key
# - Google Cloud API key
# - Google access token
# - AWS patterns

patterns="ya29\.[0-9A-Za-z_-]+ \
AIza[0-9A-Za-z_-]{35}"

# Function to add a pattern if it does not already exist
add_pattern_if_not_exists() {
    pattern="$1"
    existing_patterns=$(git secrets --list)
    echo "pattern===" $pattern
    if echo "$existing_patterns" | grep -Fqe "$pattern"; then
        echo "Pattern '$pattern' already exists. No need to add."
    else
        echo "Pattern '$pattern' not found. Adding pattern..."
        git secrets --add "$pattern"
        if [ $? -eq 0 ]; then
            echo "Pattern '$pattern' added successfully."
        else
            echo "Failed to add pattern '$pattern'."
            exit 1
        fi
    fi
}

# Add all patterns
for pattern in "${patterns[@]}"; do
    add_pattern_if_not_exists "$pattern"
done

echo "Running git-secrets..."
# Scans all files that are about to be committed.
git-secrets --pre_commit_hook -- "$@"
