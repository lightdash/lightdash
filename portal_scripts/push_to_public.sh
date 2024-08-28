#!/bin/bash
set -e

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

MODIFIED=$(git status | grep -q 'branch is ahead of' && { echo 1; } || { echo 0; })
if [ $MODIFIED = 1 ]; then
    echo "#### Add/commit your local changes before pushing to LD public."
    exit 1
fi

BRANCH_INFO=$(git status -sb)

IS_TRACKING_PUBLIC=$(echo $BRANCH_INFO | grep -q '\.\.\.upstream\/main ' && { echo 1; } || { echo 0; })
if [ $IS_TRACKING_PUBLIC != 1 ]; then
    echo "#### Branch is not tracking the public repo. Create a new branch with:"
    echo "    git checkout -b name-of-branch --track upstream/main"
    exit 1
fi

IS_MASTER_BRANCH=$(echo $BRANCH_INFO | grep -q ' master\.\.\.upstream\/main' && { echo 1; } || { echo 0; })
if [ $IS_MASTER_BRANCH = 1 ]; then
    echo "#### Do not push master branch to public LD."
    exit 1
fi

HAS_RESTRICTED_WORDS=$(echo $BRANCH_INFO | grep -iq -e 'WORKDAY' -e 'PERFTOOL' && { echo 1; } || { echo 0; })
if [ $HAS_RESTRICTED_WORDS = 1 ]; then
    echo "#### Branch name must not use restricted words: WORKDAY, PERFTOOL"
    exit 1
fi

HAS_PUBLIC_REMOTE=$(git remote get-url public | grep -q 'No such remote' && { echo 0; } || { echo 1; })
if [ $HAS_PUBLIC_REMOTE = 0 ]; then
    echo '#### Please set a remote repo named "public" where code should be pushed.'
    echo "    git remote add public https://github.com/<your.username>/lightdash.git"
    exit 1
fi

echo "#### Has the PR been approved by the team and passed all checks? (y/n)"
CODE_REVIEWED_AND_PASSED=""
while true; do
    read CODE_REVIEWED_AND_PASSED
    if [[ $CODE_REVIEWED_AND_PASSED != 'y' ]]; then
        echo "#### Please get the PR approved by the team and ensure all checks have passed."
        exit 1
    fi
    break
done

echo "#### Has the Jira been QA tested and marked with status VERIFIED? (y/n)"
QA_TESTED_AND_VERIFIED=""
while true; do
    read QA_TESTED_AND_VERIFIED
    if [[ $QA_TESTED_AND_VERIFIED != 'y' ]]; then
        echo "#### Please get QA approval."
        exit 1
    fi
    break
done

echo "vvvvvvv DIFF FROM UPSTREAM vvvvvvv"
git diff upstream/main
echo "^^^^^^^ DIFF FROM UPSTREAM ^^^^^^^"
echo "#### Push the above changes to public GitHub? (y/n)"
FINAL_OK=""
while true; do
    read FINAL_OK
    if [[ $FINAL_OK != 'y' ]]; then
        echo "#### Changes not pushed."
        exit 1
    fi
    break
done

git push -u public HEAD

echo "#### Changes pushed public. Create a pull request on GitHub."
