import type { Account, EmbeddedUsageAttribution } from '@lightdash/common';
import { createHash } from 'node:crypto';

const asIdentifier = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() && value.length <= 254
        ? value
        : null;

export const getEmbeddedUsageAttribution = ({
    authentication,
    organization,
}: Pick<Account, 'authentication' | 'organization'>):
    | EmbeddedUsageAttribution
    | undefined => {
    if (
        authentication.type !== 'jwt' ||
        !authentication.source ||
        !organization.organizationUuid
    )
        return;
    const { data, source } = authentication;
    if ('isPreview' in data.content && data.content.isPreview) return;

    const externalUserId = asIdentifier(data.user?.externalId);
    const selected = asIdentifier(data.usageAnalytics?.tenantAttribute);
    const attributes = data.userAttributes;
    const value: unknown =
        selected &&
        attributes &&
        typeof attributes === 'object' &&
        !Array.isArray(attributes) &&
        Object.hasOwn(attributes, selected)
            ? attributes[selected]
            : null;
    const tenantId = asIdentifier(
        Array.isArray(value) && value.length === 1 ? value[0] : value,
    );

    return {
        externalUserId,
        tokenFingerprint: externalUserId
            ? null
            : createHash('sha256')
                  .update('usage-analytics:embed-token:v1\0')
                  .update(organization.organizationUuid)
                  .update('\0')
                  .update(source)
                  .digest('hex'),
        tenantAttribute: tenantId === null ? null : selected,
        tenantId,
    };
};
