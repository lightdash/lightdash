import { ParameterError } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { consumeMergeResultMetadata } from './mergeQueryResults';

const fields = {
    value: { type: 'number' },
    __merge_row_present: { type: 'boolean' },
    __merge_truncated: { type: 'boolean' },
} as never;

describe('consumeMergeResultMetadata', () => {
    it('leaves ordinary query batches untouched', () => {
        const rows = [{ value: 1 }];
        expect(consumeMergeResultMetadata(rows, {})).toEqual({
            rows,
            fields: {},
            removedRows: 0,
        });
    });

    it('strips merge metadata from data rows', () => {
        expect(
            consumeMergeResultMetadata(
                [
                    {
                        value: 1,
                        __merge_row_present: true,
                        __merge_truncated: false,
                    },
                ],
                fields,
            ),
        ).toEqual({
            rows: [{ value: 1 }],
            fields: { value: { type: 'number' } },
            removedRows: 0,
        });
    });

    it('removes the synthetic row for an empty merge', () => {
        expect(
            consumeMergeResultMetadata(
                [
                    {
                        value: null,
                        __merge_row_present: null,
                        __merge_truncated: false,
                    },
                ],
                fields,
            ),
        ).toMatchObject({ rows: [], removedRows: 1 });
    });

    it('refuses a capped source even when the merge has no data rows', () => {
        expect(() =>
            consumeMergeResultMetadata(
                [
                    {
                        __merge_row_present: null,
                        __merge_truncated: true,
                    },
                ],
                fields,
            ),
        ).toThrow(ParameterError);
    });
});
