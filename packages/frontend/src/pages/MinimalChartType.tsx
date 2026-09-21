import { Box } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { validate as isUuidString } from 'uuid';
import ScreenshotReadyIndicator from '../components/common/ScreenshotReadyIndicator';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import ChartTypeSamplePreview from '../features/chartTypes/components/ChartTypeSamplePreview';
import { useProjectUuid } from '../hooks/useProjectUuid';

export default function MinimalChartType() {
    const { dataAppVizUuid: appUuidOrSlug } = useParams();
    const projectUuid = useProjectUuid();
    const isUuid = isUuidString(appUuidOrSlug ?? '');
    const appQuery = useGetApp(projectUuid, isUuid ? undefined : appUuidOrSlug);
    const dataAppVizUuid = isUuid
        ? appUuidOrSlug
        : appQuery.data?.pages[0]?.appUuid;

    const [loadEpoch, setLoadEpoch] = useState(0);
    const [sdkAvailable, setSdkAvailable] = useState(false);
    // An iframe load alone may be about:blank or an error document. Wait for
    // the SDK and allow sample-context delivery and animations to settle.
    const [settledLoadEpoch] = useDebouncedValue(
        sdkAvailable ? loadEpoch : 0,
        1_500,
    );
    const handleIframeLoad = useCallback(() => {
        setLoadEpoch((epoch) => epoch + 1);
    }, []);

    if (!projectUuid || !dataAppVizUuid) return null;

    return (
        <Box h="100vh" p="lg" bg="white">
            <ChartTypeSamplePreview
                projectUuid={projectUuid}
                dataAppVizUuid={dataAppVizUuid}
                icon={null}
                onIframeLoad={handleIframeLoad}
                onScreenshotAvailabilityChange={setSdkAvailable}
            />
            {sdkAvailable &&
                loadEpoch > 0 &&
                settledLoadEpoch === loadEpoch && (
                    <ScreenshotReadyIndicator
                        tilesTotal={1}
                        tilesReady={1}
                        tilesErrored={0}
                    />
                )}
        </Box>
    );
}
