# Section for git-secrets
if ! command -v git-secrets &> /dev/null
then
    echo "git-secrets is not installed. Visit https://github.com/awslabs/git-secrets#installing-git-secrets to learn how to install it."
    exit 1
fi

# # Initialise git-secrets configuration
git-secrets --register-aws > /dev/null

# Custom REGEX patterns Array to check for various custom secrets
patterns="password:\s*([^{\"\s][^}]*|\"[^{].*[^}]\") \
pass:\s*([^{\"\s][^}]*|\"[^{].*[^}]\") \
api_key:\s*([^{\"\s][^}]*|\"[^{].*[^}]\") \
token:\s*([^{\"\s][^}]*|\"[^{].*[^}]\") \
account:\s*([^{\"\s][^}]*|\"[^{].*[^}]\")"

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