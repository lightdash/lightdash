// RE2, the regex syntax Google's APIs filter with
// (https://github.com/google/re2/wiki/Syntax)
export const escapeRe2 = (value: string) =>
    value.replace(/[\\.+*?()|[\]{}^$]/g, '\\$&');
