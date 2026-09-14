import { type ApiAppVersionSummary } from '@lightdash/common';

/** A ready version, newest-first fixtures override what they care about. */
export const appVersion = (
    overrides: Partial<ApiAppVersionSummary> = {},
): ApiAppVersionSummary =>
    ({
        version: 1,
        prompt: 'a donut of orders by status',
        status: 'ready',
        createdAt: new Date('2026-05-15T10:00:00Z'),
        statusUpdatedAt: new Date('2026-05-15T10:00:52Z'),
        createdByUser: {
            userUuid: 'u1',
            firstName: 'Katie',
            lastName: 'Jones',
        },
        resources: null,
        ...overrides,
    }) as ApiAppVersionSummary;
