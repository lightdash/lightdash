export const validateDbtSelector = (selector: string): boolean =>
    // eslint-disable-next-line no-useless-escape
    /^@?[a-zA-Z0-9\s\*\-\.\+:_\/]+$/.test(selector);
