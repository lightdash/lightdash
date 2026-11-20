import { describe, expect, it } from 'vitest';
import { nameFromRequest } from './useSyncStudioWorkspace';

describe('nameFromRequest', () => {
    it('names a change after what was asked, not the lines picked for it', () => {
        const picked = [
            'models/orders.yml, lines 4 to 6:',
            '```yaml',
            'description: |',
            '```',
            '',
            'rewrite this description',
        ].join('\n');
        expect(nameFromRequest(picked)).toBe('Rewrite this description');
    });

    it('falls back when nothing was asked', () => {
        expect(nameFromRequest(undefined)).toBe('Untitled');
    });
});
