import { rolePresets } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getRolePresetScopes } from './rolePresetUtils';

describe('getRolePresetScopes', () => {
    it('expands and deduplicates scope dependencies', () => {
        expect(getRolePresetScopes(rolePresets[1], 'project')).toEqual([
            'manage:SqlRunner',
            'view:Project',
            'create:Job',
            'manage:CompileProject',
        ]);
    });
});
