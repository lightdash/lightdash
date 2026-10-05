export const parseEgressIps = (staticIp: string | undefined): string[] =>
    (staticIp ?? '')
        .split(/[\s,]+/)
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);
