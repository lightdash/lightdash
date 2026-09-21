import { assertUnreachable } from '@lightdash/common';
import { Badge, Group, Text } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import classes from './PreviewDataStrip.module.css';
import { type PreviewDataSource } from './previewDataTypes';

const LiveDataLabel: FC<{
    exploreLabel: string;
    rowCount: number;
    ranAt: Date;
}> = ({ exploreLabel, rowCount, ranAt }) => {
    const ranAgo = useTimeAgo(ranAt);

    return (
        <Text fz="xs" c="dimmed">
            {`${exploreLabel}, ${rowCount} rows from ${ranAgo}. Not re-run until you refresh.`}
        </Text>
    );
};

const SourceLabel: FC<{ source: PreviewDataSource }> = ({ source }) => {
    switch (source.kind) {
        case 'sample':
            return (
                <>
                    <Badge size="xs" variant="light" color="yellow">
                        Sample data
                    </Badge>
                    <Text fz="xs" c="dimmed">
                        Made-up rows.
                    </Text>
                </>
            );
        case 'live':
            return (
                <>
                    <Badge size="xs" variant="light" color="green">
                        Live data
                    </Badge>
                    <LiveDataLabel
                        exploreLabel={source.exploreLabel}
                        rowCount={source.rowCount}
                        ranAt={source.ranAt}
                    />
                </>
            );
        case 'mismatch':
            return (
                <Text fz="xs" c="dimmed">
                    {`${source.issueCount} input${
                        source.issueCount === 1 ? '' : 's'
                    } to fix`}
                </Text>
            );
        case 'unavailable':
            return (
                <Text fz="xs" c="dimmed" lineClamp={1}>
                    {source.message}
                </Text>
            );
        default:
            return assertUnreachable(source, 'Unknown preview data source');
    }
};

/** Says what the chart below is drawn from, every time it is drawn — and, when
 *  there is no chart, why not. */
const PreviewDataStrip: FC<{
    source: PreviewDataSource;
    /** Run status and the strip's own control. */
    extra: ReactNode;
}> = ({ source, extra }) => (
    <Group className={classes.strip} gap="xs" wrap="nowrap">
        <SourceLabel source={source} />
        {extra}
    </Group>
);

export default PreviewDataStrip;
