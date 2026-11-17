import {
    interpolateUiString,
    type ComposerChartPipeline,
    type ComposerChartRunResults,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconHierarchy2 } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { ComposerTileLineage } from './ComposerTileLineage';

type Props = {
    opened: boolean;
    onClose: () => void;
    chartTitle: string;
    projectUuid: string;
    pipeline: ComposerChartPipeline;
    run: ComposerChartRunResults | null;
};

/** The tile's lineage in a near full-screen modal, giving the graph and steps the most room. */
export const ComposerTileLineagePanel: FC<Props> = ({
    opened,
    onClose,
    chartTitle,
    ...lineageProps
}) => {
    const getUiString = useUiStrings();
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            fullScreen
            icon={IconHierarchy2}
            title={interpolateUiString(
                getUiString('tile.composerChart.lineageTitle'),
                { chart: chartTitle },
            )}
            modalBodyProps={{ px: 0, py: 0 }}
        >
            <Box flex={1} mih={0}>
                <ComposerTileLineage {...lineageProps} />
            </Box>
        </MantineModal>
    );
};
