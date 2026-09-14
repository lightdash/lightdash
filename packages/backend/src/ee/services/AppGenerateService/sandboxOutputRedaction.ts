export const redactSandboxEnvSecrets = (
    text: string,
    env: Record<string, string>,
    secretEnvKeys: readonly string[],
): string => {
    const secretValues = [
        ...new Set(
            secretEnvKeys
                .map((key) => env[key])
                .filter((value): value is string => Boolean(value)),
        ),
    ].sort((left, right) => right.length - left.length);

    return secretValues.reduce(
        (redacted, value) => redacted.split(value).join('[redacted]'),
        text,
    );
};
