const parseSlackTimestamp = (value: string) => {
    const match = /^(\d+)\.(\d+)$/.exec(value);
    if (!match) return null;
    return {
        seconds: match[1]!.replace(/^0+(?=\d)/, ''),
        fraction: match[2]!,
    };
};

export const compareSlackTimestamps = (left: string, right: string): number => {
    const parsedLeft = parseSlackTimestamp(left);
    const parsedRight = parseSlackTimestamp(right);
    if (!parsedLeft || !parsedRight) return 0;
    if (parsedLeft.seconds.length !== parsedRight.seconds.length) {
        return parsedLeft.seconds.length < parsedRight.seconds.length ? -1 : 1;
    }
    if (parsedLeft.seconds !== parsedRight.seconds) {
        return parsedLeft.seconds < parsedRight.seconds ? -1 : 1;
    }
    const width = Math.max(
        parsedLeft.fraction.length,
        parsedRight.fraction.length,
    );
    const leftFraction = parsedLeft.fraction.padEnd(width, '0');
    const rightFraction = parsedRight.fraction.padEnd(width, '0');
    if (leftFraction === rightFraction) return 0;
    return leftFraction < rightFraction ? -1 : 1;
};

export const slackTimestampToDate = (value: string): Date | null => {
    const parsed = parseSlackTimestamp(value);
    if (!parsed) return null;
    const milliseconds =
        Number(parsed.seconds) * 1_000 + Number(`0.${parsed.fraction}`) * 1_000;
    return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
};
