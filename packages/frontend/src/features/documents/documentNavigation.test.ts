import { getDocumentReturnUrl } from './documentNavigation';

describe('Document return navigation', () => {
    test.each([
        '/projects/project-uuid/home',
        '/projects/project-slug/ai-agents/research?thread=123#findings',
        '/projects/other-project/documents',
    ])('preserves internal project return location %s', (returnTo) => {
        expect(getDocumentReturnUrl(returnTo, 'project-uuid')).toBe(returnTo);
    });

    test.each([
        null,
        '',
        'https://example.com/projects/project-uuid/home',
        '//example.com/projects/project-uuid/home',
        'javascript:alert(1)',
        'data:text/html,test',
        '/settings',
        '/projects/project-uuid/../../outside',
        '/projects/project-uuid/%2e%2e/%2e%2e/outside',
        '/projects/\\example.com',
        '/projects/project-uuid/\n/home',
        ' /projects/project-uuid/home',
    ])(
        'uses the canonical list fallback for unsafe return location %j',
        (returnTo) => {
            expect(getDocumentReturnUrl(returnTo, 'project-uuid')).toBe(
                '/projects/project-uuid/documents',
            );
        },
    );
});
