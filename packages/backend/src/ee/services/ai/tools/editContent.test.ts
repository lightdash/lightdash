import { ParameterError } from '@lightdash/common';
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
