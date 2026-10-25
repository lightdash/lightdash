export const parseMissingDbtNodeReferences = (
    output: string,
): { model: string; packageName: string | null; version: string | null }[] => [
    ...new Map(
        Array.from(
            output.matchAll(
                /depends on a node named '([^']+)'(?: with version '([^']*)')?(?: in package or project '([^']+)'(?: with version '([^']*)')?)? which was not found/g,
            ),
            ([, model, modelVersion, packageName, projectVersion]) => ({
                model,
                packageName: packageName ?? null,
                version: modelVersion ?? projectVersion ?? null,
            }),
        ).map((ref) => [
            `${ref.packageName}.${ref.model}.${ref.version ?? ''}`,
            ref,
        ]),
    ).values(),
];

export const CROSS_SOURCE_MODEL_HINT =
    'Check that the model (or version) is present in the provider project and has access: public.';

export const withCrossSourceDbtCliHint = (message: string): string => {
    if (
        !parseMissingDbtNodeReferences(message).some(
            (ref) => ref.packageName !== null,
        ) ||
        message.includes(CROSS_SOURCE_MODEL_HINT)
    ) {
        return message;
    }
    return `${message} ${CROSS_SOURCE_MODEL_HINT} Local dbt commands must resolve cross-project refs before deployment.`;
};
