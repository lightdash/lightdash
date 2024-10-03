#!/bin/bash
set -e

TEMP_PATCH_LOCATION="$HOME/lightdash-public-diff-patch.tmp"

get_restricted_content () {
    ALL_CONTENT=$1
    HAS_RESTRICTED=$(echo "$ALL_CONTENT" | grep -iq -e 'RK.AY' -e 'P.RFTO' && { echo 1; } || { echo 0; })
    if [ $HAS_RESTRICTED = 1 ]; then
        RESTRICTED_CONTENT=$(echo "$ALL_CONTENT" | (grep -i -e 'RK.AY' -e 'P.RFTO'))
        echo "$RESTRICTED_CONTENT"
    fi
}

save_code_diff () {
  git diff public/main ':(exclude).security_config/' ':(exclude)portal_scripts/' > $TEMP_PATCH_LOCATION
  echo "$(cat $TEMP_PATCH_LOCATION)"
}

delete_code_diff () {
  rm $TEMP_PATCH_LOCATION
}

print_code_diff_no_ignore () {
  echo "vvvvvvv DIFF FROM PUBLIC vvvvvvv"
  git --no-pager diff public/main
  echo "^^^^^^^ DIFF FROM PUBLIC ^^^^^^^"
}

if ! test -f $PWD/yarn.lock; then
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

HAS_PUBLIC_REMOTE=$(git remote get-url public | grep -q 'No such remote' && { echo 0; } || { echo 1; })
if [ $HAS_PUBLIC_REMOTE = 0 ]; then
    echo '#### Please set a remote repo named "public" where code should be pushed.'
    echo "    > git remote add public https://github.com/<your.username>/lightdash.git"
    exit 1
fi

git fetch public

MODIFIED=$(git status | grep -q 'nothing to commit' && { echo 0; } || { echo 1; })
if [ $MODIFIED = 1 ]; then
    echo "#### Add/commit your local changes before pushing to your public LD."
    exit 1
fi

BRANCH_INFO=$(git status -sb)
IS_MASTER_BRANCH=$(echo $BRANCH_INFO | grep -q ' master\.\.\.' && { echo 1; } || { echo 0; })
if [ $IS_MASTER_BRANCH = 1 ]; then
    echo "#### Do not push master branch to your public LD."
    exit 1
fi

# LOCAL AND OFFICIAL LD DIVERGE
DIFFERENT_BASE_VERSION_PUBLIC_OFFICIAL=$(git diff --shortstat upstream/main -- CHANGELOG.md)
IS_PUBLIC_DEV_BEHIND=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_OFFICIAL | grep -q 'insertion' && { echo 1; } || { echo 0; })
if [ $IS_PUBLIC_DEV_BEHIND = 1 ]; then
    echo "#### Base LD version of local branch is ahead of official public branch."
    echo "#### This should not be possible! Contact admin."
    exit 1
fi
IS_LOCAL_BEHIND_PUBLIC_DEV=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_OFFICIAL | grep -q 'deletion' && { echo 1; } || { echo 0; })
if [ $IS_LOCAL_BEHIND_PUBLIC_DEV = 1 ]; then
    THIS_BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
    echo "#### Base LD version of official public branch is ahead of local branch. Rebase local branch:"
    echo "    > git rebase upstream/main"
    exit 1
fi

# LOCAL AND DEV'S PUBLIC DIVERGE
DIFFERENT_BASE_VERSION_PUBLIC_DEV=$(git diff --shortstat public/main -- CHANGELOG.md)
IS_PUBLIC_DEV_BEHIND=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_DEV | grep -q 'insertion' && { echo 1; } || { echo 0; })
if [ $IS_PUBLIC_DEV_BEHIND = 1 ]; then
    echo "#### Base LD version of local branch is ahead of your remote public branch."
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
if [ $IS_LOCAL_BEHIND_PUBLIC_DEV = 1 ]; then
    echo "#### Base LD version of remote public branch is ahead of local branch. Rebase local branch:"
    echo "    > git rebase public/main"
    exit 1
fi

# LOCAL AND INTERNAL REPO DIVERGE
DIFFERENT_BASE_VERSION_PUBLIC_INTERNAL=$(git diff --shortstat origin/master -- CHANGELOG.md)
IS_INTERNAL_PUBLIC_BEHIND=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_INTERNAL | grep -q 'insertion' && { echo 1; } || { echo 0; })
if [ $IS_INTERNAL_PUBLIC_BEHIND = 1 ]; then
    echo "#### Base LD version local branch is ahead of internal repo."
    echo "#### Contact admin to update it."
    exit 1;
fi
IS_LOCAL_BEHIND_PUBLIC_INTERNAL=$(echo $DIFFERENT_BASE_VERSION_PUBLIC_INTERNAL | grep -q 'deletion' && { echo 1; } || { echo 0; })
if [ $IS_LOCAL_BEHIND_PUBLIC_INTERNAL = 1 ]; then
    echo "#### Base LD version of internal repo is ahead of local branch."
    echo "#### This should not happen if the local branch is updated from official LD. Contact admin."
    exit 1;
fi

echo "#### Has the PR been approved by the team and passed all checks? (y/n)"
CODE_REVIEWED_AND_PASSED=""
while true; do
    read CODE_REVIEWED_AND_PASSED
    if [[ $CODE_REVIEWED_AND_PASSED != [yY] ]]; then
        echo "#### Please get the PR approved by the team and ensure all checks have passed."
        exit 1
    fi
    break
done

echo "#### Has the Jira been QA tested and marked with status VERIFIED? (y/n)"
QA_TESTED_AND_VERIFIED=""
while true; do
    read QA_TESTED_AND_VERIFIED
    if [[ $QA_TESTED_AND_VERIFIED != [yY] ]]; then
        echo "#### Please get QA approval."
        exit 1
    fi
    break
done

CODE_DIFF=$(save_code_diff)
RESTRICTED_WORDS_IN_CODE=$(get_restricted_content "$CODE_DIFF")
if [[ $RESTRICTED_WORDS_IN_CODE ]]; then
    echo "vvvvvvv Code changes must not use restricted words vvvvvvv"
    echo "$RESTRICTED_WORDS_IN_CODE"
    echo "^^^^^^^ Code changes must not use restricted words ^^^^^^^"
    delete_code_diff
    exit 1
fi

read -p "Enter branch name to be displayed publicly: " NEW_BRANCH_NAME
RESTRICTED_WORDS_IN_BRANCH_NAME=$(get_restricted_content "$NEW_BRANCH_NAME")
if [[ $RESTRICTED_WORDS_IN_BRANCH_NAME ]]; then
    echo "vvvvvvv Branch name must not use restricted words vvvvvvv"
    echo "$RESTRICTED_WORDS_IN_BRANCH_NAME"
    echo "^^^^^^^ Branch name must not use restricted words ^^^^^^^"
    exit 1
fi

read -p "Enter commit message to be displayed publicly: " COMMIT_MESSAGE
RESTRICTED_WORDS_IN_COMMIT_MESSAGE=$(get_restricted_content "$COMMIT_MESSAGE")
if [[ $RESTRICTED_WORDS_IN_COMMIT_MESSAGE ]]; then
    echo "vvvvvvv Commit message must not use restricted words vvvvvvv"
    echo "$RESTRICTED_WORDS_IN_COMMIT_MESSAGE"
    echo "^^^^^^^ Commit message must not use restricted words ^^^^^^^"
    exit 1
fi

git checkout -q public/main
git checkout -b $NEW_BRANCH_NAME
git apply $TEMP_PATCH_LOCATION
git add .
git commit -m "$COMMIT_MESSAGE"

print_code_diff_no_ignore

echo "#### Push the above changes to public GitHub? (y/n)"
FINAL_OK=""
while true; do
    read FINAL_OK
    if [[ $FINAL_OK != [yY] ]]; then
        echo "#### Changes not pushed."
        delete_code_diff
        exit 1
    fi
    break
done

echo "#### Changes NOT pushed!"
echo "#### Although, changes READY to be pushed public. Use the following command then create a pull request on GitHub."
echo "    > git push -u public HEAD"

# DO NOT AUTOMATICALLY PUSH AT THIS TIME
#git push -u public HEAD
#echo "#### Changes pushed public. Create a pull request on GitHub."

delete_code_diff
