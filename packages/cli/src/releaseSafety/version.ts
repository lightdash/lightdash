const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function isReleaseVersion(version: string): boolean {
    return RELEASE_VERSION_PATTERN.test(version);
}

export function compareVersions(left: string, right: string): number {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);
    for (let partIndex = 0; partIndex < 3; partIndex += 1) {
        const difference = leftParts[partIndex] - rightParts[partIndex];
        if (difference !== 0) {
            return difference > 0 ? 1 : -1;
        }
    }
    return 0;
}
