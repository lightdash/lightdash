import { type AnyType, type BigNumberSpec } from '@lightdash/common';
import { Box, LoadingOverlay } from '@mantine-8/core';
import { type SerializedError } from '@reduxjs/toolkit';
import { IconAlertCircle } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { BigNumberDisplay } from '../../common/BigNumber/BigNumberDisplay';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';

type Props = {
    /**
     * Every chart model returns its spec through one loosely typed channel, so
     * the big number shape is recovered here rather than at each call site.
     */
    spec: Record<string, AnyType> | undefined;
    isLoading: boolean;
    error?: SerializedError | null;
    hasValueField: boolean;
};

const BigNumberView: FC<Props> = memo(
    ({ spec: rawSpec, isLoading, error, hasValueField }) => {
        const spec = rawSpec as BigNumberSpec | undefined;

        if (!hasValueField) {
            return (
                <SuboptimalState
                    title="Incomplete chart configuration"
                    description="You're missing a value field"
                    icon={IconAlertCircle}
                    mt="xl"
                />
            );
        }

        if (error && !isLoading) {
            return (
                <SuboptimalState
                    title="Error generating chart"
                    description={error.message}
                    icon={IconAlertCircle}
                    mt="xl"
                />
            );
        }

        return (
            <Box
                h="100%"
                w="100%"
                pos="relative"
                data-testid="chart-view-big_number"
                className="sentry-block ph-no-capture"
            >
                <LoadingOverlay
                    visible={isLoading}
                    loaderProps={{ color: 'gray' }}
                />

                {spec && (
                    <BigNumberDisplay
                        value={spec.formattedValue}
                        label={spec.label}
                        showLabel={spec.showLabel}
                        flipColors={spec.flipColors}
                        comparison={spec.comparison}
                    />
                )}
            </Box>
        );
    },
);

export default BigNumberView;
