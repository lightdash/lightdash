import { Liquid } from 'liquidjs';

const templateEngine = new Liquid({
    cache: true,
    timezoneOffset: 0,
    outputDelimiterLeft: '${',
    outputDelimiterRight: '}',
    ownPropertyOnly: true,
    strictVariables: true,
    strictFilters: true,
});

// eslint-disable-next-line import/prefer-default-export
export const renderTemplatedUrl = (
    templatedUrl: string,
    value: { raw: any; formatted: string },
    row: Record<string, Record<string, { raw: any; formatted: string }>>,
): string => templateEngine.parseAndRenderSync(templatedUrl, { value, row });
