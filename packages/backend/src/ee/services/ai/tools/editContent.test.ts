import { ParameterError, toolEditContentOutputSchema } from '@lightdash/common';
import type { EditContentFn } from '../types/aiAgentDependencies';
import { executeEditContent } from './editContent';

describe('editContent errors', () => {
    it('returns a rejected control order to the agent with the valid slugs', async () => {
        const message =
            'Unknown filter slug "missing" in controlOrder. Valid slugs are filter: orders-status; parameter: none; dateZoom: none; section: none';
        const output = await executeEditContent(
            {
                editContent: vi.fn(async () => {
                    throw new ParameterError(message);
                }),
                siteUrl: 'https://example.com',
            },
            {
                slug: 'dashboard',
                type: 'dashboard',
                patch: [
                    {
                        op: 'replace',
                        path: '/config/controlOrder/0/slug',
                        value: 'missing',
                    },
                ],
            },
        );
        expect(output.metadata.status).toBe('error');
        expect(output.result).toContain(message);
    });
});

type EditedContent = Awaited<ReturnType<EditContentFn>>;

describe('editContent with the unused input sent as null', () => {
    const patch = [{ op: 'replace', path: '/name', value: 'Orders' }];
    const documentEdit = { type: 'metadata' as const, name: 'Orders' };
    const dashboard: EditedContent = {
        type: 'dashboard',
        uuid: 'uuid',
        href: '/dashboards/uuid',
        versionUuids: { before: null, after: null },
        content: {
            name: 'Orders',
            slug: 'orders',
            spaceSlug: 'reports',
            version: 1,
            tabs: [],
            tiles: [],
        },
    };
    const document: EditedContent = {
        type: 'document',
        uuid: 'uuid',
        href: '/documents/uuid',
        versionUuid: 'version',
        content: {
            schemaVersion: 2,
            name: 'Orders',
            slug: 'orders',
            description: 'Order analysis',
            spaceSlug: 'reports',
            markdown: '# Orders',
            chart: null,
        },
    };

    it.each([
        {
            args: { type: 'dashboard' as const, patch, documentEdit: null },
            applied: { slug: 'orders', type: 'dashboard', patch },
            edited: dashboard,
        },
        {
            args: { type: 'document' as const, patch: null, documentEdit },
            applied: { slug: 'orders', type: 'document', documentEdit },
            edited: document,
        },
    ])('applies the $args.type edit', async ({ args, applied, edited }) => {
        const editContent = vi.fn<EditContentFn>().mockResolvedValue(edited);
        const output = await executeEditContent(
            {
                editContent,
                siteUrl: 'https://example.com',
                documentsEnabled: true,
            },
            { slug: 'orders', ...args },
        );
        expect(toolEditContentOutputSchema.safeParse(output).success).toBe(
            true,
        );
        expect(output.metadata.status).toBe('success');
        expect(editContent).toHaveBeenCalledWith(applied);
    });
});
