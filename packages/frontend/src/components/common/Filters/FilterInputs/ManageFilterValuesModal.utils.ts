export const parseDelimitedValues = (raw: string): string[] => {
    const parsed = raw
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, ',')
        .split(/,|\n/)
        .map((s) => s.trim())
        .map((s) =>
            // Strip surrounding double quotes (standard CSV quoting)
            // and unescape doubled quotes ("" → ")
            s.length >= 2 && s.startsWith('"') && s.endsWith('"')
                ? s.slice(1, -1).replace(/""/g, '"')
                : s,
        )
        .filter((s) => s.length > 0);

    if (
        parsed.length > 1 &&
        (parsed[0].toLowerCase() === 'value' ||
            parsed[0].toLowerCase() === 'values')
    ) {
        return parsed.slice(1);
    }

    return parsed;
};
