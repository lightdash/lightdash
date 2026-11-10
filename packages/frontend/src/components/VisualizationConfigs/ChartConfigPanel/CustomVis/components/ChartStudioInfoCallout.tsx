import { Anchor, Text } from '@mantine/core';
import { type FC } from 'react';
import useIsEmbedded from '../../../../../ee/providers/Embed/useIsEmbedded';
import { CHART_STUDIO_DOCS_URL } from '../../../../../features/chartTypes/utils/chartStudioDocs';
import Callout from '../../../../common/Callout';

type Props = {
    /** Null when Chart Studio cannot run here, which swaps the link for the docs. */
    onOpenChartStudio: (() => void) | null;
};

/** Quiet, permanent pointer from the Vega editor to Chart Studio. */
export const ChartStudioInfoCallout: FC<Props> = ({ onOpenChartStudio }) => {
    const isEmbedded = useIsEmbedded();
    // A Chart Studio pitch with docs links is branding, so it has no place in an embed.
    if (isEmbedded) return null;

    return (
        <Callout variant="neutral" hideIcon p="xs">
            {onOpenChartStudio ? (
                <Text fz="xs">
                    Looking for more flexible custom charts? Chart Studio builds
                    reusable chart types you can use like built-in charts.{' '}
                    <Anchor
                        inherit
                        component="button"
                        onClick={onOpenChartStudio}
                    >
                        Open Chart Studio
                    </Anchor>
                    .
                </Text>
            ) : (
                <Text fz="xs">
                    Want to build more complete custom charts? Chart Studio
                    turns a description into a reusable chart type you can use
                    like a built-in chart.{' '}
                    <Anchor
                        inherit
                        href={CHART_STUDIO_DOCS_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Read the docs on Chart Studio here
                    </Anchor>
                    .
                </Text>
            )}
        </Callout>
    );
};
