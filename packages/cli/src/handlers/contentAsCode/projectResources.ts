import {
    ContentAsCodeType,
    parseVersionedContentAsCodeDocument,
    type AgentAsCode,
    type AlertAsCode,
    type GoogleSheetsSyncAsCode,
    type ScheduledDeliveryAsCode,
    type VirtualViewAsCode,
} from '@lightdash/common';
import type { CodeResourceDefinition } from './resource';

export const VIRTUAL_VIEW_CODE_RESOURCE: CodeResourceDefinition<VirtualViewAsCode> =
    {
        kind: ContentAsCodeType.VIRTUAL_VIEW,
        displayLabel: 'virtual view',
        identityLabel: 'slug',
        scope: 'project',
        folderName: 'virtual-views',
        acceptedExtensions: ['.yml', '.yaml'],
        fileName: {
            strategy: 'uriEncodedIdentity',
            fallbackPrefix: 'virtual-view',
            extension: '.yml',
        },
        dependencies: [],
        identity: ({ slug }) => slug,
        displayName: ({ name }) => name,
        parse: (input, source) =>
            parseVersionedContentAsCodeDocument<VirtualViewAsCode>({
                input,
                source,
                resourceLabel: 'virtual view',
                contentType: ContentAsCodeType.VIRTUAL_VIEW,
            }),
        sort: (left, right) => left.slug.localeCompare(right.slug),
    };

export const AI_AGENT_CODE_RESOURCE: CodeResourceDefinition<AgentAsCode> = {
    kind: ContentAsCodeType.AI_AGENT,
    displayLabel: 'AI agent',
    identityLabel: 'slug',
    scope: 'project',
    folderName: 'ai-agents',
    acceptedExtensions: ['.yml', '.yaml'],
    fileName: {
        strategy: 'identity',
        fallbackPrefix: 'ai-agent',
        extension: '.yml',
    },
    dependencies: [],
    recursive: true,
    identity: ({ slug }) => slug,
    displayName: ({ name }) => name,
    parse: (input, source) =>
        parseVersionedContentAsCodeDocument<AgentAsCode>({
            input,
            source,
            resourceLabel: 'AI agent',
            contentType: ContentAsCodeType.AI_AGENT,
        }),
    serialize: ({ updatedAt, downloadedAt, ...agent }) => agent,
    sort: (left, right) => left.slug.localeCompare(right.slug),
};

const scheduledResource = <Document extends { slug: string; name: string }>({
    contentType,
    folderName,
    label,
}: {
    contentType:
        | ContentAsCodeType.SCHEDULED_DELIVERY
        | ContentAsCodeType.ALERT
        | ContentAsCodeType.GOOGLE_SHEETS_SYNC;
    folderName: string;
    label: string;
}): CodeResourceDefinition<Document> => ({
    kind: contentType,
    displayLabel: label,
    identityLabel: 'slug',
    scope: 'project',
    folderName,
    acceptedExtensions: ['.yml', '.yaml'],
    fileName: {
        strategy: 'scheduledResource',
        fallbackPrefix: contentType,
        extension: '.yml',
    },
    dependencies: ['chart', 'dashboard'],
    recursive: true,
    identity: ({ slug }) => slug,
    displayName: ({ name }) => name,
    matches: (input) =>
        typeof input === 'object' &&
        input !== null &&
        'contentType' in input &&
        input.contentType === contentType,
    parse: (input, source) =>
        parseVersionedContentAsCodeDocument<Document>({
            input,
            source,
            resourceLabel: label,
            contentType,
        }),
    sort: (left, right) => left.slug.localeCompare(right.slug),
});

export const SCHEDULED_DELIVERY_CODE_RESOURCE =
    scheduledResource<ScheduledDeliveryAsCode>({
        contentType: ContentAsCodeType.SCHEDULED_DELIVERY,
        folderName: 'scheduled-deliveries',
        label: 'scheduled delivery',
    });

export const ALERT_CODE_RESOURCE = scheduledResource<AlertAsCode>({
    contentType: ContentAsCodeType.ALERT,
    folderName: 'alerts',
    label: 'alert',
});

export const GOOGLE_SHEETS_CODE_RESOURCE =
    scheduledResource<GoogleSheetsSyncAsCode>({
        contentType: ContentAsCodeType.GOOGLE_SHEETS_SYNC,
        folderName: 'google-sheets',
        label: 'Google Sheets sync',
    });
