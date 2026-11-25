import { describe, expect, it } from 'vitest';
import { deploysWithCli } from './studioBlocker';

describe('deploysWithCli', () => {
    it('offers the CLI only where a deploy would land for this person', () => {
        expect(deploysWithCli(null)).toBe(true);
        expect(deploysWithCli('models_from_outside')).toBe(true);
        expect(deploysWithCli('no_access')).toBe(false);
        expect(deploysWithCli('preview_project')).toBe(false);
        expect(deploysWithCli('unsupported_connection')).toBe(false);
        expect(deploysWithCli('no_repository_access')).toBe(false);
        expect(deploysWithCli('github_app_missing')).toBe(false);
    });
});
