import yaml from 'js-yaml';

export const dumpContentAsCodeDocument = (
    document: Record<string, unknown> | null,
): string => {
    if (!document) {
        return '';
    }

    return yaml.dump(document, {
        quotingType: '"',
        sortKeys: true,
    });
};
