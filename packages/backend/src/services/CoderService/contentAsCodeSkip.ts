type SnapshotContentType = 'chart' | 'dashboard';

/**
 * 3-way compare for content-as-code upload.
 * lastApplied / incoming / instance are hashes of the canonical as-code
 * document (timestamps stripped, keys sorted).
 *
 * Missing last-applied or missing instance → apply (first baseline / create).
 * instance == incoming → existing no-changes path (do not skip).
 * instance == lastApplied → apply git.
 * instance != lastApplied && instance != incoming → skip.
 */
export const shouldSkipInstanceAheadUpload = ({
    lastAppliedHash,
    incomingHash,
    instanceHash,
}: {
    lastAppliedHash: string | undefined;
    incomingHash: string;
    instanceHash: string | undefined;
}): boolean => {
    if (lastAppliedHash === undefined || instanceHash === undefined) {
        return false;
    }
    if (instanceHash === incomingHash) {
        return false;
    }
    if (instanceHash === lastAppliedHash) {
        return false;
    }
    return true;
};

export const getInstanceAheadSkipWarning = (
    contentType: SnapshotContentType,
    slug: string,
): string =>
    `${contentType} "${slug}" has instance changes since the last apply and was not overwritten. Re-upload with --force to overwrite.`;
