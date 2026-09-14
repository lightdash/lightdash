export const isGithubToken = (value: string) =>
    /^(github_pat_|ghp_|gho_|ghs_|ghu_)/.test(value);

export const validateGithubToken = (
    value: string,
): [boolean, string | undefined] => {
    if (value === '') {
        return [true, undefined];
    }
    if (!isGithubToken(value)) {
        return [
            false,
            `GitHub token should start with "github_pat_", "ghp_", "gho_", "ghs_", or "ghu_"`,
        ];
    }
    return [true, undefined];
};
