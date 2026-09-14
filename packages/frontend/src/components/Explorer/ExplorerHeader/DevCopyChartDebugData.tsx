import { IconCode } from '@tabler/icons-react';
import {
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import { CopyActionIcon } from '../../common/CopyActionIcon';

export const DevCopyChartDebugData = () => {
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const echartsOptions = useEchartsCartesianConfig();

    return (
        <CopyActionIcon
            value={JSON.stringify(
                { unsavedChartVersion, echartsOptions },
                null,
                2,
            )}
            icon={IconCode}
            copyLabel="Copy chart debug data"
            copiedLabel="Copied!"
            tooltipPosition="bottom"
            variant="default"
            size="md"
        />
    );
};
