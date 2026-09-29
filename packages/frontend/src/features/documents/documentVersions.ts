import { type DocumentVersionSummary } from '@lightdash/common';
import dayjs from 'dayjs';

/** Display name of whoever saved a version; the user may since be deleted. */
export const getVersionAuthor = (version: DocumentVersionSummary): string =>
    version.createdBy
        ? `${version.createdBy.firstName} ${version.createdBy.lastName}`.trim() ||
          'Unknown user'
        : 'Unknown user';

/** Compact local save time, e.g. "28 Sep 2026, 11:56". */
export const formatVersionTime = (createdAt: Date): string =>
    dayjs(createdAt).format('D MMM YYYY, HH:mm');
