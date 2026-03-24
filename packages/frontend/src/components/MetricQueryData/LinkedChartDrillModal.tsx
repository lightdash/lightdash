import { type FC } from 'react';
import { type DrillStep } from '@lightdash/common';
import ChartDrillModal from './ChartDrillModal';

type Props = {
    opened: boolean;
    onClose: () => void;
    sourceChartUuid: string;
    linkedChartUuid: string;
    drillSteps: DrillStep[];
    filterSummary: string;
};

/**
 * Thin wrapper around ChartDrillModal for linked chart drill-through.
 * Used by Explorer's SeriesContextMenu for backward compatibility.
 */
const LinkedChartDrillModal: FC<Props> = (props) => (
    <ChartDrillModal
        {...props}
        mode="linkedChart"
        linkedChartUuid={props.linkedChartUuid}
    />
);

export default LinkedChartDrillModal;
