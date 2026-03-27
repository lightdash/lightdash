import { type DrillFilterDetail, type DrillStep } from '@lightdash/common';
import { type FC } from 'react';
import ChartDrillModal from './ChartDrillModal';

type Props = {
    opened: boolean;
    onClose: () => void;
    sourceChartUuid: string | undefined;
    linkedChartUuid: string;
    drillSteps: DrillStep[];
    filterSummary: string;
    filterDetails: DrillFilterDetail[];
};

/**
 * Thin wrapper around ChartDrillModal for linked chart drill-through.
 * Used by Explorer's SeriesContextMenu for backward compatibility.
 */
const DrillThroughModal: FC<Props> = (props) => (
    <ChartDrillModal
        {...props}
        mode="linkedChart"
        linkedChartUuid={props.linkedChartUuid}
    />
);

export default DrillThroughModal;
