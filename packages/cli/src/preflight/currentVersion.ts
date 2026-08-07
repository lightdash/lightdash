import { compareVersions } from '@lightdash/common';

export interface MigrationVersion {
    migration: string;
    version: string;
}

export type CurrentVersionResult =
    | {
          status: 'matched';
          observedVersion: string;
          selectedVersion: string;
          suppliedVersion: string | null;
          message: string | null;
      }
    | {
          status: 'partial';
          observedVersion: null;
          selectedVersion: null;
          suppliedVersion: string | null;
          message: string;
      }
    | {
          status: 'empty';
          observedVersion: null;
          selectedVersion: null;
          suppliedVersion: string | null;
          message: string;
      };

export const deriveCurrentVersion = (
    appliedMigrations: string[],
    migrationVersions: MigrationVersion[],
    suppliedVersion: string | null,
): CurrentVersionResult => {
    if (appliedMigrations.length === 0) {
        return {
            status: 'empty',
            observedVersion: null,
            selectedVersion: null,
            suppliedVersion,
            message:
                'knex_migrations is empty, so the current Lightdash version cannot be derived',
        };
    }

    const versionByMigration = new Map<string, string>();
    for (const entry of migrationVersions) {
        if (versionByMigration.has(entry.migration)) {
            throw new Error(
                `Migration version lookup contains duplicate migration "${entry.migration}"`,
            );
        }
        versionByMigration.set(entry.migration, entry.version);
    }

    const applied = new Set(appliedMigrations);
    const versions = [
        ...new Set(migrationVersions.map((entry) => entry.version)),
    ].sort(compareVersions);
    const observedVersion = versions.find((candidate) =>
        migrationVersions.every(
            ({ migration, version }) =>
                applied.has(migration) ===
                compareVersions(version, candidate) <= 0,
        ),
    );
    const unexpectedMigrations = appliedMigrations.filter(
        (migration) => !versionByMigration.has(migration),
    );

    if (observedVersion === undefined || unexpectedMigrations.length > 0) {
        return {
            status: 'partial',
            observedVersion: null,
            selectedVersion: null,
            suppliedVersion,
            message:
                'The applied migration set matches no released version; the instance may be partially migrated, so preflight will not guess a current version',
        };
    }

    const message =
        suppliedVersion !== null && suppliedVersion !== observedVersion
            ? `--from ${suppliedVersion} disagrees with the applied migrations (${observedVersion}); using the observed version ${observedVersion}`
            : null;
    return {
        status: 'matched',
        observedVersion,
        selectedVersion: observedVersion,
        suppliedVersion,
        message,
    };
};
