import { deriveCurrentVersion, type MigrationVersion } from './currentVersion';

const migrationVersions: MigrationVersion[] = [
    { migration: '001_first', version: '1.0.0' },
    { migration: '002_second', version: '1.1.0' },
    { migration: '003_third', version: '1.1.0' },
    { migration: '004_fourth', version: '1.2.0' },
];

describe('deriveCurrentVersion', () => {
    it('derives an exact released version from the applied set', () => {
        expect(
            deriveCurrentVersion(
                ['001_first', '002_second', '003_third'],
                migrationVersions,
                null,
            ),
        ).toEqual({
            status: 'matched',
            observedVersion: '1.1.0',
            selectedVersion: '1.1.0',
            suppliedVersion: null,
            message: null,
        });
    });

    it('reports a partially applied release instead of guessing', () => {
        const result = deriveCurrentVersion(
            ['001_first', '002_second'],
            migrationVersions,
            null,
        );

        expect(result.status).toBe('partial');
        expect(result.selectedVersion).toBeNull();
        expect(result.message).toContain('matches no released version');
    });

    it('prefers the observed version when --from disagrees', () => {
        const result = deriveCurrentVersion(
            ['001_first', '002_second', '003_third'],
            migrationVersions,
            '1.0.0',
        );

        expect(result.status).toBe('matched');
        expect(result.selectedVersion).toBe('1.1.0');
        expect(result.message).toContain(
            '--from 1.0.0 disagrees with the applied migrations',
        );
    });

    it('reports an empty knex_migrations table explicitly', () => {
        expect(deriveCurrentVersion([], migrationVersions, '1.0.0')).toEqual({
            status: 'empty',
            observedVersion: null,
            selectedVersion: null,
            suppliedVersion: '1.0.0',
            message:
                'knex_migrations is empty, so the current Lightdash version cannot be derived',
        });
    });
});
