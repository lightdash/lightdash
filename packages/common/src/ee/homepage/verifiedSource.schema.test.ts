import { describe, expect, it } from 'vitest';
import { parseHomepageConfig } from './schema';

describe('verified collection source', () => {
    it('accepts verified as a collection source', () => {
        const config = {
            version: 1 as const,
            rows: [
                {
                    id: 'row-1',
                    blocks: [
                        {
                            id: 'b1',
                            type: 'collection' as const,
                            config: {
                                title: 'Verified',
                                items: [],
                                source: 'verified' as const,
                            },
                        },
                    ],
                },
            ],
        };

        expect(parseHomepageConfig(config)).toEqual(config);
    });
});
