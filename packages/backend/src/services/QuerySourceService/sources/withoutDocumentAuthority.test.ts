import { describe, expect, it } from 'vitest';
import type { ComposerRunBinding } from '../../ComposerChartService/ComposerRunBinding';
import type { DocumentQueryContext } from '../../DocumentService/DocumentQueryContext';
import { withoutDocumentAuthority } from './withoutDocumentAuthority';

describe('withoutDocumentAuthority', () => {
    it('runs a SQL-kind node under a Document as the caller', () => {
        expect(
            withoutDocumentAuthority({
                kind: 'document',
                context: {} as DocumentQueryContext,
            }),
        ).toEqual({ kind: 'request' });
    });

    it('keeps a composer binding', () => {
        const binding = {} as ComposerRunBinding;
        expect(withoutDocumentAuthority({ kind: 'composer', binding })).toEqual(
            { kind: 'composer', binding },
        );
    });
});
