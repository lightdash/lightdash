import { Liquid, TokenKind } from 'liquidjs';

const templateEngine = new Liquid({
    cache: true,
    timezoneOffset: 0,
    outputDelimiterLeft: '${',
    outputDelimiterRight: '}',
    ownPropertyOnly: true,
    strictVariables: true,
    strictFilters: true,
});

export const renderTemplatedUrl = (
    templatedUrl: string,
    value: { raw: any; formatted: string },
    row: Record<string, Record<string, { raw: any; formatted: string }>>,
): string => templateEngine.parseAndRenderSync(templatedUrl, { value, row });

export const getTemplatedUrlRowDependencies = (
    templatedUrl: string,
): string[] => {
    const parts = templateEngine.parse(templatedUrl);
    return parts.reduce<string[]>((acc, part) => {
        if (part.token.kind === TokenKind.Output) {
            const referenceString = part.token.getText();
            const valueReference: undefined | string = referenceString.match(
                /value\.(raw|formatted)/,
            )?.[0];
            const rowReference: undefined | string = referenceString.match(
                /row\.([a-z\\._]+)\.([a-z\\._]+)\.(raw|formatted)/,
            )?.[0];
            if (!valueReference && !rowReference) {
                throw new Error(
                    `Found invalid reference "${referenceString}" in your url template`,
                );
            }
            if (!valueReference && rowReference) {
                const referenceParts = rowReference.split('.');
                return [...acc, `${referenceParts[1]}_${referenceParts[2]}`];
            }
        }
        return acc;
    }, []);
};
