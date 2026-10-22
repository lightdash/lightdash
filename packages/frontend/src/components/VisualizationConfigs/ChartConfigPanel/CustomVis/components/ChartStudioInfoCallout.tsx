import { Anchor, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import useIsEmbedded from '../../../../../ee/providers/Embed/useIsEmbedded';
import {
    CHART_STUDIO_DOCS_URL,
    CHART_STUDIO_SELF_HOSTING_DOCS_URL,
} from '../../../../../features/chartTypes/utils/chartStudioDocs';
import Callout from '../../../../common/Callout';

type Props = {
    /** Null when Chart Studio cannot run here, which swaps the link for the setup guide. */
    onOpenChartStudio: (() => void) | null;
};

/** Quiet, permanent pointer from the Vega editor to Chart Studio. */
export const ChartStudioInfoCallout: FC<Props> = ({ onOpenChartStudio }) => {
    const isEmbedded = useIsEmbedded();
    // A Chart Studio pitch with docs links is branding, so it has no place in an embed.
    if (isEmbedded) return null;

    return (
        <Callout variant="neutral" hideIcon p="xs">
            <Text fz="xs">
                Looking for more flexible custom charts? Chart Studio builds
                reusable chart types you can use like built-in charts.
                {onOpenChartStudio === null &&
                    ' It needs an enterprise licence and a configured app runtime.'}
            </Text>
            <Group gap="sm" mt={4}>
                {onOpenChartStudio ? (
                    <Anchor
                        fz="xs"
                        component="button"
                        onClick={onOpenChartStudio}
                    >
                        Open Chart Studio
                    </Anchor>
                ) : (
                    <Anchor
                        fz="xs"
                        href={CHART_STUDIO_SELF_HOSTING_DOCS_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Setup guide
                    </Anchor>
                )}
                <Anchor
                    fz="xs"
                    href={CHART_STUDIO_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                >
                    Chart Studio docs
                </Anchor>
            </Group>
        </Callout>
    );
};
