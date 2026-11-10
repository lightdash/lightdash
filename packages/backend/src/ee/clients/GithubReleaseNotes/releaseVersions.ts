export const isReleaseVersion = (version: string): boolean =>
    /^\d+\.\d+\.\d+$/.test(version);

export const compareReleaseVersions = (left: string, right: string): number => {
    const leftParts = left.split('.').map(BigInt);
    const rightParts = right.split('.').map(BigInt);
    for (let index = 0; index < 3; index += 1) {
        if (leftParts[index] < rightParts[index]) return -1;
        if (leftParts[index] > rightParts[index]) return 1;
    }
    return 0;
};
