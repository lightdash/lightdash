import { describe, expect, it } from 'vitest';
import { getDataAppConsumerAccess } from './consumerAccess';
import { extractDataAppDataReferences } from './dataReferences';

const references = (source: string) =>
    extractDataAppDataReferences([
        {
            path: 'src/App.tsx',
            content: `import { query } from '@lightdash/query-sdk';\n${source}`,
        },
    ]);

const RESOLVED =
    "query('orders').dimensions(['status']).metrics(['total_order_amount']);";
const DYNAMIC_SORT =
    "export const Table = ({ sortField }) => query('payments').dimensions(['payment_method']).sorts([{ fieldId: sortField, descending: true }]);";

describe('getDataAppConsumerAccess', () => {
    it('is unavailable for a version with no saved references', () => {
        expect(getDataAppConsumerAccess(null)).toEqual({
            status: 'unavailable',
            queryCount: 0,
            issues: [],
        });
    });

    it('is available when every query is fully read', () => {
        expect(getDataAppConsumerAccess(references(RESOLVED))).toEqual({
            status: 'available',
            queryCount: 1,
            issues: [],
        });
    });

    it('is available for an app with no queries', () => {
        expect(
            getDataAppConsumerAccess(references('export const App = null;')),
        ).toMatchObject({ status: 'available', queryCount: 0 });
    });

    it('reports a query with a part it could not read, and where it is', () => {
        const access = getDataAppConsumerAccess(
            references(`${RESOLVED}\n${DYNAMIC_SORT}`),
        );
        expect(access.status).toBe('limited');
        expect(access.queryCount).toBe(2);
        expect(access.issues).toEqual([
            {
                kind: 'query',
                explore: 'payments',
                unresolved: ['sorts'],
                location: expect.objectContaining({
                    path: 'src/App.tsx',
                    line: 3,
                }),
            },
        ]);
    });

    it('is unavailable when no query can be fully read', () => {
        expect(getDataAppConsumerAccess(references(DYNAMIC_SORT)).status).toBe(
            'unavailable',
        );
    });

    it('reports a filter whose field it could not read', () => {
        const access = getDataAppConsumerAccess(
            references(
                `${RESOLVED}
                import { useGlobalFilters } from '@/lib/filters';
                function Menu({ field, explore, value }) {
                    const { addFilter } = useGlobalFilters();
                    return () => addFilter({ field, operator: 'equals', value, explore });
                }`,
            ),
        );
        expect(access.status).toBe('limited');
        expect(access.issues).toEqual([
            expect.objectContaining({
                kind: 'globalFilter',
                explore: null,
                unresolved: ['explore', 'field'],
            }),
        ]);
    });
});
