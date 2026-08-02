import { Text } from '@mantine-8/core';
import { type FC } from 'react';
import { type DataAppVizBuildState } from '../hooks/useDataAppVizBuild';

type Props = {
    build: DataAppVizBuildState;
    /** Ticking `0:12` while the build runs. */
    elapsed: string | null;
};

/**
 * What the dock's resting bar reports while a build is in flight, in place of
 * the provenance line: what was asked for, and how long it has been going.
 */
const DataAppVizBuildStatus: FC<Props> = ({ build, elapsed }) => (
    <>
        <Text size="xs" fw={500}>
            {build.claimedVersion === null
                ? 'Building'
                : `Building v${build.claimedVersion}`}
        </Text>
        <Text size="xs" c="dimmed" truncate="end">
            {build.pendingPrompt}
        </Text>
        {elapsed && (
            <Text size="xs" c="dimmed" fw={500}>
                {`· ${elapsed}`}
            </Text>
        )}
    </>
);

export default DataAppVizBuildStatus;
