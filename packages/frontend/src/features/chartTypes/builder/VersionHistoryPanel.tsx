import {
    diffDataAppVizSchema,
    hasDataAppVizSchemaChanges,
    summarizeDataAppVizSchemaChanges,
    type ApiAppVersionSummary,
    type DataAppVizSchema,
    type DataAppVizSchemaChanges,
} from '@lightdash/common';
import { useState, type FC } from 'react';
import AppVersionHistoryPanel from '../../apps/components/AppVersionHistoryPanel';
import VersionHistoryDisclosure from '../../apps/components/VersionHistoryDisclosure';
import VizSchemaChangesList from '../components/VizSchemaChangesList';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';
import RestoreVersionModal from './RestoreVersionModal';

type Props = {
    projectUuid: string;
    appUuid: string;
    /** Newest first, as `useAppVersionHistory` returns them. */
    versions: ApiAppVersionSummary[];
    latestReadyVersion: number | null;
    /** The pinned (viewed) version; null when following the current one. */
    viewedVersion: number | null;
    onView: (version: number | null) => void;
    onClose: () => void;
    build: DataAppVizBuildState;
    hasEarlier: boolean;
    isFetchingEarlier: boolean;
    fetchEarlier: () => void;
};

const VersionChanges: FC<{
    version: number;
    changes: DataAppVizSchemaChanges;
}> = ({ version, changes }) => (
    <VersionHistoryDisclosure
        label="What changed"
        ariaLabel={`What changed in v${version}`}
        summary={summarizeDataAppVizSchemaChanges(changes).join(' · ')}
    >
        <VizSchemaChangesList changes={changes} compact />
    </VersionHistoryDisclosure>
);

const schemaOf = (version: ApiAppVersionSummary): DataAppVizSchema | null =>
    version.status === 'ready' ? (version.resources?.vizSchema ?? null) : null;

/**
 * Diff each ready version against the nearest earlier one that declared a
 * schema. The oldest entry on the page has nothing to compare with until
 * earlier versions are loaded.
 */
const getVersionSchemaChanges = (
    newestFirst: ApiAppVersionSummary[],
): Map<number, DataAppVizSchemaChanges> => {
    const changes = new Map<number, DataAppVizSchemaChanges>();
    newestFirst.forEach((version, index) => {
        const schema = schemaOf(version);
        if (!schema) return;
        const previous = newestFirst
            .slice(index + 1)
            .map(schemaOf)
            .find((candidate) => candidate !== null);
        if (!previous) return;
        const diff = diffDataAppVizSchema(previous, schema);
        if (hasDataAppVizSchemaChanges(diff))
            changes.set(version.version, diff);
    });
    return changes;
};

/**
 * The chart type builder's side panel: the shared version history plus the
 * viz schema changes per version and the chart type restore flow.
 */
const VersionHistoryPanel: FC<Props> = ({
    projectUuid,
    appUuid,
    versions,
    latestReadyVersion,
    viewedVersion,
    onView,
    onClose,
    build,
    hasEarlier,
    isFetchingEarlier,
    fetchEarlier,
}) => {
    const [restoreTarget, setRestoreTarget] = useState<number | null>(null);

    const ordered = [...versions].sort((a, b) => b.version - a.version);
    const schemaChanges = getVersionSchemaChanges(ordered);
    // The build writes its own entry until the version it claimed reaches
    // history, where it shows up as an in-progress version of its own.
    const isClaimedInHistory =
        build.claimedVersion !== null &&
        versions.some((v) => v.version === build.claimedVersion);
    const liveBuild =
        build.isBuilding && !isClaimedInHistory
            ? {
                  claimedVersion: build.claimedVersion,
                  pendingPrompt: build.pendingPrompt,
              }
            : null;

    return (
        <>
            <AppVersionHistoryPanel
                versions={versions}
                latestReadyVersion={latestReadyVersion}
                viewedVersion={viewedVersion}
                onView={onView}
                onRestore={setRestoreTarget}
                onClose={onClose}
                onBack={null}
                liveBuild={liveBuild}
                hasEarlier={hasEarlier}
                isFetchingEarlier={isFetchingEarlier}
                fetchEarlier={fetchEarlier}
                emptyPromptLabel="Uploaded from source"
                olderVersionTime="absolute"
                showPreviewButton={false}
                currentThreadNumber={null}
                renderEntryExtras={(version) => {
                    const changes = schemaChanges.get(version.version);
                    return changes ? (
                        <VersionChanges
                            version={version.version}
                            changes={changes}
                        />
                    ) : null;
                }}
            />
            {restoreTarget !== null && (
                <RestoreVersionModal
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    version={restoreTarget}
                    onClose={() => setRestoreTarget(null)}
                />
            )}
        </>
    );
};

export default VersionHistoryPanel;
