import { describe, expect, it } from 'vitest';
import { ContentType, type DocumentContentItem } from './content';
import {
    contentToResourceViewItem,
    isResourceViewDocumentItem,
} from './resourceViewItem';
import { SpaceMemberRole } from './space';

describe('Document content presentation', () => {
    const content: DocumentContentItem = {
        contentType: ContentType.DOCUMENT,
        uuid: 'document',
        slug: 'weekly-report',
        name: 'Weekly report',
        description: null,
        createdAt: new Date('2026-09-15'),
        createdBy: null,
        lastUpdatedAt: null,
        lastUpdatedBy: null,
        project: { uuid: 'project', name: 'Project' },
        organization: { uuid: 'organization', name: 'Organization' },
        space: { uuid: 'space', name: 'Space' },
        pinnedList: null,
        views: 0,
        firstViewedAt: null,
        verification: null,
        directAccessRoles: [SpaceMemberRole.VIEWER],
    };

    it('preserves identity and direct grants without requiring a surviving creator', () => {
        const item = contentToResourceViewItem(content);
        expect(isResourceViewDocumentItem(item)).toBe(true);
        expect(item).toEqual({
            type: ContentType.DOCUMENT,
            data: {
                ...content,
                description: undefined,
                spaceUuid: 'space',
                projectUuid: 'project',
                organizationUuid: 'organization',
                createdByUserUuid: null,
                pinnedListUuid: null,
                pinnedListOrder: null,
                updatedAt: content.createdAt,
                updatedByUser: undefined,
            },
        });
    });

    it('uses the latest editor and timestamp when available', () => {
        const updatedAt = new Date('2026-09-16');
        const item = contentToResourceViewItem({
            ...content,
            lastUpdatedAt: updatedAt,
            lastUpdatedBy: {
                uuid: 'editor',
                firstName: 'Example',
                lastName: 'Editor',
            },
        });
        expect(item.data).toMatchObject({
            updatedAt,
            updatedByUser: {
                userUuid: 'editor',
                firstName: 'Example',
                lastName: 'Editor',
            },
        });
    });
});
