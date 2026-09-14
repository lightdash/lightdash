import type { BreakingChangeDeclaration } from './release-safety-declarations';
import type { ConfigSurface } from './release-safety-config-diff';
import type { MigrationDetail } from './release-safety-migrations';

export type TriState = boolean | 'unknown';

export interface ApiSurface {
    checked: boolean;
    breaking: TriState;
    changes: string[];
    breakingCount: number;
    advisories: string[];
    advisoryCount: number;
}

export interface ReleaseSafetyMarker {
    schemaVersion: '2';
    version: string;
    previousVersion: string | null;
    releaseDate: string;
    migrations: {
        present: TriState;
        count: number;
        coreCount: number;
        eeCount: number;
        files: MigrationDetail[];
    };
    compatibility: {
        rollingUpdateSafe: TriState;
        recommendedStrategy: 'Recreate' | 'RollingUpdate';
    };
    api: {
        rest: ApiSurface;
        mcp: ApiSurface;
    };
    config: ConfigSurface;
    upgrade: {
        minPreviousVersion: string | null;
        requiredStops: string[];
    };
    declaredBreaks: BreakingChangeDeclaration[];
}
