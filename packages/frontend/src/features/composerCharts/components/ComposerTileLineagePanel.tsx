import {
    interpolateUiString,
    type ComposerChartPipeline,
    type ComposerChartRunResults,
} from '@lightdash/common';
import { Drawer } from '@mantine/core';
import { type FC } from 'react';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import { ComposerTileLineage } from './ComposerTileLineage';
import styles from './ComposerTileLineagePanel.module.css';

type Props = {
    opened: boolean;
    onClose: () => void;
    chartTitle: string;
    projectUuid: string;
    pipeline: ComposerChartPipeline;
    run: ComposerChartRunResults | null;
};

/** The tile's lineage in a side sheet, so the dashboard stays in view beside it. */
export const ComposerTileLineagePanel: FC<Props> = ({
    opened,
    onClose,
    chartTitle,
    ...lineageProps
}) => {
    const getUiString = useUiStrings();
    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="xl"
            title={interpolateUiString(
                getUiString('tile.composerChart.lineageTitle'),
                { chart: chartTitle },
            )}
            classNames={{ content: styles.content, body: styles.body }}
        >
            <ComposerTileLineage {...lineageProps} />
        </Drawer>
    );
};
