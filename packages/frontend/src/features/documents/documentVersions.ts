import { type DocumentVersionSummary } from '@lightdash/common';
import dayjs from 'dayjs';
import i18n from '../../i18n/i18n';

/** Display name of whoever saved a version; the user may since be deleted. */
export const getVersionAuthor = (version: DocumentVersionSummary): string =>
    version.createdBy
        ? `${version.createdBy.firstName} ${version.createdBy.lastName}`.trim() ||
          i18n.t('byline.unknownUser', { ns: 'documents' })
        : i18n.t('byline.unknownUser', { ns: 'documents' });

/** Compact local save time, e.g. "28 Sep 2026, 11:56". */
export const formatVersionTime = (createdAt: Date): string =>
    dayjs(createdAt).format('D MMM YYYY, HH:mm');
