#!/bin/bash
set -e

TEMP_PATCH_LOCATION="$HOME/lightdash-public-diff-patch.tmp"
EXCLUDED_FILES=(
    ":(exclude).security_config/"
    ":(exclude)portal_scripts/"
    ":(exclude)Jenkinsfile.kj-gcp-pre-release"
    ":(exclude)jenkins-agent.yml"
)
CONVENTIONAL_COMMIT_TYPE_TESTS=("feat:" "fix:" "docs:" "style:" "refactor:" "perf:" "test:" "build:" "ci:" "chore:" "revert:")

get_restricted_content () {
    ALL_CONTENT=$1
    HAS_RESTRICTED=$(echo "$ALL_CONTENT" | grep -q -e '[Ww][Oo].[Kk].[Aa][Yy]' -e '[Pp].[Rr][Ff][Tt][Oo][Oo]' && { echo 1; } || { echo 0; })
    if [[ "$HAS_RESTRICTED" -eq "1" ]]; then
        RESTRICTED_CONTENT=$(echo "$ALL_CONTENT" | (grep -e '[Ww][Oo].[Kk].[Aa][Yy]' -e '[Pp].[Rr][Ff][Tt][Oo][Oo]'))
        echo "$RESTRICTED_CONTENT"
    fi
}

save_code_diff () {
    BRANCH_EXISTS=$1
    NEW_BRANCH_NAME=$2
    if [[ "$BRANCH_EXISTS" -eq "1" ]]; then
        git diff public/$NEW_BRANCH_NAME "${EXCLUDED_FILES[@]}" > $TEMP_PATCH_LOCATION
    else
        git diff public/main "${EXCLUDED_FILES[@]}" > $TEMP_PATCH_LOCATION
    fi
    echo "$(cat $TEMP_PATCH_LOCATION)"
}

delete_code_diff () {
    rm $TEMP_PATCH_LOCATION
}

print_code_diff_no_ignore () {
    BRANCH_EXISTS=$1
    NEW_BRANCH_NAME=$2
    echo "vvvvvvv DIFF FROM YOUR PUBLIC vvvvvvv"
    if [[ "$BRANCH_EXISTS" -eq "1" ]]; then
        git --no-pager diff public/$NEW_BRANCH_NAME
    else
        git --no-pager diff public/main
    fi
    echo "^^^^^^^ DIFF FROM YOUR PUBLIC ^^^^^^^"
}

starts_with() {
    local string="$1"
    local prefixes=("${@:2}")
    for prefix in "${prefixes[@]}"; do
        if [[ "$string" == "$prefix"* ]]; then
            echo "1"
            return
        fi
    done
    echo "0"
}

sync_internal_to_official() {
    echo "#### Syncing internal repo to official public repo..."
    THIS_BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
    git fetch origin;
    git checkout master;
    git pull origin master;
    git fetch upstream main;
    git merge upstream/main;
    git push origin;
    git checkout $THIS_BRANCH_NAME;
}

if ! test -f $PWD/pnpm-lock.yaml; then
    echo "#### Script must run from the repository's root directory"
    exit 1
fi

if git remote | grep -q 'upstream'; then
    echo "#### Fetching upstream..."
    git fetch upstream
else
    echo "#### Upstream remote is not added. Running add_upstream.sh"
    $PWD/portal_scripts/add_upstream.sh
fi

HAS_ORIGIN_REMOTE=$(git remote get-url public | grep -q 'No such remote' && { echo 0; } || { echo 1; })
if [[ "$HAS_ORIGIN_REMOTE" -eq "0" ]]; then
    echo '#### Please set a remote repo named "origin" where code should be pushed.'
    echo "    > git remote add origin https://<host>.com/<dir>/lightdash-public.git"
    exit 1
fi
echo "#### Fetching origin..."
git fetch origin

HAS_PUBLIC_REMOTE=$(git remote get-url public | grep -q 'No such remote' && { echo 0; } || { echo 1; })
if [[ "$HAS_PUBLIC_REMOTE" -eq "0" ]]; then
    echo '#### Please set a remote repo named "public" where code should be pushed.'
    echo "    > git remote add public https://github.com/<your.username>/lightdash.git"
    exit 1
fi
echo "#### Fetching public..."
git fetch public

sync_internal_to_official

MODIFIED=$(git status | grep -q 'nothing to commit' && { echo 0; } || { echo 1; })
if [[ "$MODIFIED" -eq "1" ]]; then
    echo "#### Add/commit your local changes before pushing to your public LD."
    exit 1
fi

BRANCH_INFO=$(git status -sb)
IS_MASTER_BRANCH=$(echo $BRANCH_INFO | grep -q ' master\.\.\.' && { echo 1; } || { echo 0; })
if [[ "$IS_MASTER_BRANCH" -eq "1" ]]; then
    echo "#### Do not push master branch to your public LD."
    exit 1
fi

# LOCAL AND OFFICIAL LD DIVERGE
DIFFERENT_BASE_VERSION_PUBLIC_OFFICIAL=$(git diff --shortstat upstream/main -- CHANGELOG.md)
IS_PUBLIC_DEV_BEHIND=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_OFFICIAL | grep -q 'insertion' && { echo 1; } || { echo 0; })
if [[ "$IS_PUBLIC_DEV_BEHIND" -eq "1" ]]; then
    echo "#### Base LD version of local branch is ahead of official public branch."
    echo "#### This should not be possible! Contact admin."
    exit 1
fi
IS_LOCAL_BEHIND_PUBLIC_DEV=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_OFFICIAL | grep -q 'deletion' && { echo 1; } || { echo 0; })
if [[ "$IS_LOCAL_BEHIND_PUBLIC_DEV" -eq "1" ]]; then
    THIS_BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
    echo "#### Base LD version of official public branch is ahead of local branch. Rebase local branch:"
    echo "    > git checkout master"
    echo "    > git pull origin master"
    echo "    > git checkout $THIS_BRANCH_NAME"
    echo "    > git rebase origin/master"
    echo "    > git push -f origin"
    exit 1
fi

# LOCAL AND DEV'S PUBLIC DIVERGE
DIFFERENT_BASE_VERSION_PUBLIC_DEV=$(git diff --shortstat public/main -- CHANGELOG.md)
IS_PUBLIC_DEV_BEHIND=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_DEV | grep -q 'insertion' && { echo 1; } || { echo 0; })
if [[ "$IS_PUBLIC_DEV_BEHIND" -eq "1" ]]; then
    echo "#### Base LD version of local branch is ahead of your remote public main branch."
    echo "#### From https://github.com/<your.username>/lightdash click the \"Sync fork\" button."
    echo "#### ***OR*** manually rebase remote public branch:"
    echo "#### 1) If necessary, clone your remote public repo:"
    echo "        > git clone https://github.com/<your.username>/lightdash.git"
    echo "#### 2) From your local copy of the remote public repo:"
    echo "        > git checkout main"
    echo "        > git fetch upstream"
    echo "        > git merge upstream/main"
    echo "        > git push"
    exit 1
fi
IS_LOCAL_BEHIND_PUBLIC_DEV=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_DEV | grep -q 'deletion' && { echo 1; } || { echo 0; })
if [[ "$IS_LOCAL_BEHIND_PUBLIC_DEV" -eq "1" ]]; then
    echo "#### Base LD version of remote public main branch is ahead of local branch. Rebase local branch:"
    echo "    > git rebase public/main"
    exit 1
fi

# LOCAL AND INTERNAL REPO DIVERGE
DIFFERENT_BASE_VERSION_PUBLIC_INTERNAL=$(git diff --shortstat origin/master -- CHANGELOG.md)
IS_INTERNAL_PUBLIC_BEHIND=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_INTERNAL | grep -q 'insertion' && { echo 1; } || { echo 0; })
if [[ "$IS_INTERNAL_PUBLIC_BEHIND" -eq "1" ]]; then
    echo "#### Base LD version local branch is ahead of internal repo."
    echo "#### Contact admin to update it."
    exit 1;
fi
IS_LOCAL_BEHIND_PUBLIC_INTERNAL=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_INTERNAL | grep -q 'deletion' && { echo 1; } || { echo 0; })
if [[ "$IS_LOCAL_BEHIND_PUBLIC_INTERNAL" -eq "1" ]]; then
    echo "#### Base LD version of internal repo is ahead of local branch."
    echo "#### This should not happen if the local branch is updated from official LD. Contact admin."
    exit 1;
fi

read -p "#### Has the PR been approved by the team and passed all tests and checks? (y/n): " CODE_REVIEWED_AND_PASSED
if [[ $CODE_REVIEWED_AND_PASSED != [yY] ]]; then
    echo "#### Please get the PR approved by the team and ensure all checks have passed."
    exit 1
fi

read -p "#### Has the Jira been QA tested and marked with status VERIFIED? (y/n): " QA_TESTED_AND_VERIFIED
if [[ $QA_TESTED_AND_VERIFIED != [yY] ]]; then
    echo "#### Please get QA approval."
    exit 1
fi

echo "vvvvvvv Local branches vvvvvvv"
git --no-pager branch
echo "^^^^^^^ Local branches ^^^^^^^"


while true; do
    read -p "#### Enter a NEW branch name to be displayed publicly, or use an EXISTING name if this updates an existing public branch: " NEW_BRANCH_NAME
    if [[ -z "$NEW_BRANCH_NAME" ]]; then
        continue
    fi
    RESTRICTED_WORDS_IN_BRANCH_NAME=$(get_restricted_content "$NEW_BRANCH_NAME")
    if [[ ! -z "$RESTRICTED_WORDS_IN_BRANCH_NAME" ]]; then
        echo "vvvvvvv Branch name must not use restricted words vvvvvvv"
        echo "$RESTRICTED_WORDS_IN_BRANCH_NAME"
        echo "^^^^^^^ Branch name must not use restricted words ^^^^^^^"
        continue
    fi
    break
done

BRANCH_EXISTS=$(git show-ref --quiet refs/heads/$NEW_BRANCH_NAME && { echo 1; } || { echo 0; })

if [[ "$BRANCH_EXISTS" -eq "1" ]]; then
    echo "#### Using existing branch: $NEW_BRANCH_NAME"

    # LOCAL AND DEV'S PUBLIC FEATURE BRANCH DIVERGE
    DIFFERENT_BASE_VERSION_PUBLIC_FEATURE_DEV=$(git diff --shortstat public/$NEW_BRANCH_NAME -- CHANGELOG.md)
    IS_PUBLIC_DEV_FEATURE_BEHIND=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_FEATURE_DEV | grep -q 'insertion' && { echo 1; } || { echo 0; })
    if [[ "$IS_PUBLIC_DEV_FEATURE_BEHIND" -eq "1" ]]; then
        echo "#### Base LD version of local branch is ahead of your remote public feature branch. Rebase public feature branch:"
        echo "    > git checkout $NEW_BRANCH_NAME"
        echo "    > git rebase public/main"
        echo "    > git push -f public"
        exit 1
    fi
    IS_LOCAL_BEHIND_PUBLIC_DEV_FEATURE=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_FEATURE_DEV | grep -q 'deletion' && { echo 1; } || { echo 0; })
    if [[ "$IS_LOCAL_BEHIND_PUBLIC_DEV_FEATURE" -eq "1" ]]; then
        echo "#### Base LD version of remote public feature branch is ahead of local branch."
        echo "#### This should not happen if the local branch is updated from official LD. Contact admin."
        exit 1
    fi
fi

while true; do
    read -p "#### Enter commit message to be displayed publicly: " COMMIT_MESSAGE

    RESTRICTED_WORDS_IN_COMMIT_MESSAGE=$(get_restricted_content "$COMMIT_MESSAGE")
    if [[ ! -z "$RESTRICTED_WORDS_IN_COMMIT_MESSAGE" ]]; then
        echo "vvvvvvv Commit message must not use restricted words vvvvvvv"
        echo "$RESTRICTED_WORDS_IN_COMMIT_MESSAGE"
        echo "^^^^^^^ Commit message must not use restricted words ^^^^^^^"
        continue
    fi

    HAS_CONVENTIONAL_COMMIT_TYPE=$(starts_with "$COMMIT_MESSAGE" $CONVENTIONAL_COMMIT_TYPE_TESTS)
    if [[ "$HAS_CONVENTIONAL_COMMIT_TYPE" -eq "0" ]]; then
        echo "vvvvvvv Commit message must start with a conventional commit type plus a colon vvvvvvv"
        echo ${CONVENTIONAL_COMMIT_TYPE_TESTS[*]}
        echo "^^^^^^^ Commit message must start with a conventional commit type plus a colon ^^^^^^^"
        continue
    fi

    break
done

CODE_DIFF=$(save_code_diff $BRANCH_EXISTS "$NEW_BRANCH_NAME")

RESTRICTED_WORDS_IN_CODE=$(get_restricted_content "$CODE_DIFF")
if [[ ! -z "$RESTRICTED_WORDS_IN_CODE" ]]; then
    echo "vvvvvvv Code changes must not use restricted words vvvvvvv"
    echo "$RESTRICTED_WORDS_IN_CODE"
    echo "^^^^^^^ Code changes must not use restricted words ^^^^^^^"
    delete_code_diff
    exit 1
fi

if [[ "$BRANCH_EXISTS" -eq "1" ]]; then
    git checkout $NEW_BRANCH_NAME
else
    git checkout -q public/main
    git checkout -b $NEW_BRANCH_NAME
fi

git apply $TEMP_PATCH_LOCATION
git add .
git commit -m "$COMMIT_MESSAGE"

print_code_diff_no_ignore $BRANCH_EXISTS "$NEW_BRANCH_NAME"

read -p "#### Push the above changes to public GitHub? (y/n): " FINAL_OK
if [[ $FINAL_OK != [yY] ]]; then
    echo "#### Changes not pushed."
    delete_code_diff
    exit 1
fi

echo "#### Changes NOT pushed!"
echo "#### Although, changes are READY to be pushed public. Use the following command then create a pull request on GitHub."
echo "    > git push -u public HEAD"
echo "#### Remember to run tests as needed :)"

# DO NOT AUTOMATICALLY PUSH AT THIS TIME
#git push -u public HEAD
#echo "#### Changes pushed public. Create a pull request on GitHub."

delete_code_diff
