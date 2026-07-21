import { type FC } from 'react';
import { useChartAsCode } from '../hooks/useChartAsCode';
import ContentAsCodeModal from './ContentAsCodeModal';

type ChartAsCodeModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    chartUuid: string;
    hasUnsavedChanges: boolean;
};

const ChartAsCodeModal: FC<ChartAsCodeModalProps> = ({
    opened,
    onClose,
    projectUuid,
    chartUuid,
    hasUnsavedChanges,
}) => {
    const chartAsCode = useChartAsCode({
        projectUuid,
        chartUuid,
        enabled: opened,
    });

    return (
        <ContentAsCodeModal
            opened={opened}
            onClose={onClose}
            resourceLabel="chart"
            contentAsCode={chartAsCode}
            warning={
                hasUnsavedChanges
                    ? 'This YAML contains the last saved version. Save the chart to include your current changes.'
                    : undefined
            }
        />
    );
};

export default ChartAsCodeModal;
