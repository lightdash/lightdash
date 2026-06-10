import { type ChangesetWithChangesAndDependencies } from '@lightdash/common';

const CHANGESET_EXPORT_SCHEMA_VERSION = 1;

type ChangesetExport = {
    schemaVersion: number;
    exportedAt: string;
    projectUuid: string;
    changeset: ChangesetWithChangesAndDependencies;
};

const buildChangesetExport = (
    changeset: ChangesetWithChangesAndDependencies,
): ChangesetExport => ({
    schemaVersion: CHANGESET_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projectUuid: changeset.projectUuid,
    changeset,
});

const slugifyForFileName = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'changeset';

export const downloadChangesetJson = (
    changeset: ChangesetWithChangesAndDependencies,
): void => {
    const data = JSON.stringify(buildChangesetExport(changeset), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `changeset-${slugifyForFileName(changeset.name)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
