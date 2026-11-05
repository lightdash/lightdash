import { getKnowledgeDocumentSnapshotSlug } from './ContentAsCodeSnapshotModel';

describe('getKnowledgeDocumentSnapshotSlug', () => {
    it('keys a document by its agent and trimmed name', () => {
        expect(
            getKnowledgeDocumentSnapshotSlug('revenue-agent', '  Glossary '),
        ).toBe('revenue-agent/Glossary');
    });

    it('stays within the 255-character column for the longest allowed name', () => {
        const name = 'n'.repeat(255);
        const slug = getKnowledgeDocumentSnapshotSlug('revenue-agent', name);
        expect(slug.length).toBeLessThanOrEqual(255);
        expect(slug).toBe(
            getKnowledgeDocumentSnapshotSlug('revenue-agent', name),
        );
        expect(slug).not.toBe(
            getKnowledgeDocumentSnapshotSlug(
                'revenue-agent',
                `${name.slice(0, -1)}m`,
            ),
        );
    });
});
