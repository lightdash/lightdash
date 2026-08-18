import { Box, Stack, Text } from '@mantine/core';
import { IconPuzzle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useResolvedColorPalette } from '../../../hooks/appearance/useResolvedColorPalette';
import { useResizeObserver } from '../../../hooks/useResizeObserver';
import AppIframePreview from '../../apps/AppIframePreview';
import { usePreviewOrigin } from '../../apps/previewOrigin';
import {
    useDataAppVizPreviewToken,
    useDataAppVizRenderMetadata,
} from '../hooks/useDataAppVizRender';
import { buildSampleVizContext } from '../utils/sampleVizContext';
import classes from './ChartTypeSamplePreview.module.css';

const RENDER_TARGET = { isEmbedded: false, savedChartUuid: undefined };

// Width the app is laid out at before being scaled down to fit the host box,
// so the miniature keeps realistic proportions.
const PREVIEW_NATURAL_WIDTH_PX = 800;

const PreviewPlaceholder: FC<{ message: string }> = ({ message }) => (
    <Stack align="center" justify="center" gap="xs" h="100%" w="100%">
        <MantineIcon icon={IconPuzzle} size="xl" color="ldGray.5" />
        <Text c="dimmed" size="xs" ta="center">
            {message}
        </Text>
    </Stack>
);

type Props = {
    projectUuid: string;
    dataAppVizUuid: string;
};

/**
 * Non-interactive render of a chart type's current version, fed sample data
 * synthesized from its declared schema.
 */
const ChartTypeSamplePreview: FC<Props> = ({ projectUuid, dataAppVizUuid }) => {
    const previewOrigin = usePreviewOrigin();
    const { data: metadata, error: metadataError } =
        useDataAppVizRenderMetadata(projectUuid, dataAppVizUuid, RENDER_TARGET);
    const readyMetadata = metadata?.state === 'ready' ? metadata : undefined;
    const { data: token } = useDataAppVizPreviewToken(
        projectUuid,
        dataAppVizUuid,
        readyMetadata?.version,
        RENDER_TARGET,
    );

    const previewBaseUrl =
        readyMetadata && token
            ? `${previewOrigin}/api/apps/${dataAppVizUuid}/versions/${readyMetadata.version}/t/${token}/`
            : undefined;

    const colorPalette = useResolvedColorPalette(projectUuid);
    const sampleContext = useMemo(
        () =>
            readyMetadata
                ? buildSampleVizContext(readyMetadata.schema, colorPalette)
                : undefined,
        [readyMetadata, colorPalette],
    );

    // @mantine/hooks' useElementSize never observes an element mounted after
    // the loading placeholders; the in-repo hook tracks ref attachment.
    const [measureRef, { width, height }] = useResizeObserver<HTMLDivElement>();
    const scale = width > 0 ? Math.min(1, width / PREVIEW_NATURAL_WIDTH_PX) : 0;

    // Keep rendering cached metadata through transient refetch errors;
    // only fall back when there is nothing to show.
    if (!metadata) {
        return metadataError ? (
            <PreviewPlaceholder message="Preview unavailable" />
        ) : (
            <PreviewPlaceholder message="Loading preview…" />
        );
    }
    if (metadata.state === 'building') {
        return <PreviewPlaceholder message="Still generating…" />;
    }
    if (metadata.state === 'unavailable') {
        return <PreviewPlaceholder message="Preview unavailable" />;
    }
    if (metadata.state === 'failed') {
        return <PreviewPlaceholder message="No finished version yet" />;
    }
    if (!token || !previewBaseUrl) {
        return <PreviewPlaceholder message="Loading preview…" />;
    }

    const previewUrl = `${previewBaseUrl}?r=0#transport=postMessage&projectUuid=${projectUuid}`;

    return (
        <Box ref={measureRef} className={classes.root}>
            {scale > 0 && (
                <Box
                    className={classes.scaled}
                    __vars={{
                        '--preview-scale': String(scale),
                        '--preview-natural-width': `${Math.round(
                            width / scale,
                        )}px`,
                        '--preview-natural-height': `${Math.round(
                            height / scale,
                        )}px`,
                    }}
                >
                    <AppIframePreview
                        src={previewUrl}
                        previewToken={token}
                        expectedPreviewOrigin={previewOrigin}
                        projectUuid={projectUuid}
                        appUuid={dataAppVizUuid}
                        identityKey={dataAppVizUuid}
                        dataAppVizContext={sampleContext}
                    />
                </Box>
            )}
        </Box>
    );
};

export default ChartTypeSamplePreview;
