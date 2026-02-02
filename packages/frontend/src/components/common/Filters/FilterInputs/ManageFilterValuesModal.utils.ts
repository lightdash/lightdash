export const parseDelimitedValues = (raw: string): string[] => {
    const parsed = raw
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, ',')
        .split(/,|\n/)
        .map((s) => s.trim())
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
