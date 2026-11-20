import type { EmbeddedUsageAttribution } from '@lightdash/common';
import type { CompactedStreamColumn } from './types';

export const embeddedUsageColumns: CompactedStreamColumn[] = [
    { name: 'external_user_id', type: 'VARCHAR' },
    { name: 'embed_token_fingerprint', type: 'VARCHAR' },
    { name: 'embed_tenant_attribute', type: 'VARCHAR' },
    { name: 'embed_tenant_id', type: 'VARCHAR' },
];

export const embeddedUsageFields = (usage?: EmbeddedUsageAttribution) => ({
    external_user_id: usage?.externalUserId ?? null,
    embed_token_fingerprint: usage?.tokenFingerprint ?? null,
    embed_tenant_attribute: usage?.tenantAttribute ?? null,
    embed_tenant_id: usage?.tenantId ?? null,
});
