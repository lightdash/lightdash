import { getAppDisplayName } from '@lightdash/common';
import { Anchor, Group, Text } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { Link, useLocation } from 'react-router';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import { useDataAppVisualization } from '../../features/chartTypes/hooks/useDataAppVisualization';
import { chartTypeBuilderPath } from '../../features/chartTypes/utils/chartTypeBuilderPath';
import { parseChartStudioOriginFromSearchParams } from '../../features/chartTypes/utils/chartTypeInExplorerDestination';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import Callout from '../common/Callout';

type Props = {
    /** The chart is not on screen (fullscreen, or a chart-only view), so
     *  neither is this. Kept mounted so a dismissal survives the toggle. */
    hidden: boolean;
};

/**
 * Shown when Chart Studio sent the author here to try the chart type they just
 * built. The marker lives in the url, so a dismissal lasts for this visit only.
 */
const ChartStudioReturnBanner: FC<Props> = ({ hidden }) => {
    const projectUuid = useProjectUuid();
    const { search } = useLocation();
    const { embedToken } = useEmbed();
    const [isDismissed, setIsDismissed] = useState(false);
    // The host owns the embed's url, so the marker is not this author's.
    const dataAppVizUuid = useMemo(
        () =>
            embedToken ? null : parseChartStudioOriginFromSearchParams(search),
        [embedToken, search],
    );
    const { data: dataAppViz } = useDataAppVisualization(
        projectUuid,
        dataAppVizUuid,
        null,
    );

    // Named or not at all: the banner is about one chart type by name.
    if (
        hidden ||
        !projectUuid ||
        dataAppVizUuid === null ||
        isDismissed ||
        !dataAppViz
    ) {
        return null;
    }

    return (
        <Callout
            variant="success"
            withCloseButton
            closeButtonLabel="Dismiss"
            onClose={() => setIsDismissed(true)}
        >
            <Group gap="md" wrap="nowrap" justify="space-between">
                <Text fz="sm">
                    <Text span fw={600} inherit>
                        {getAppDisplayName(
                            dataAppViz.name,
                            dataAppViz.dataAppVizUuid,
                        )}
                    </Text>{' '}
                    is ready to use in this project. This chart keeps the query
                    you built it on.
                </Text>
                <Anchor
                    component={Link}
                    to={chartTypeBuilderPath(projectUuid, dataAppVizUuid)}
                    fz="xs"
                    fw={500}
                    flex="0 0 auto"
                >
                    Back to Chart Studio
                </Anchor>
            </Group>
        </Callout>
    );
};

export default ChartStudioReturnBanner;
