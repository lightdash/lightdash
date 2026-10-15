import { IconCode } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import { CopyActionIcon } from '../../common/CopyActionIcon';

export const DevCopyChartDebugData = () => {
    const { t } = useTranslation('explorer');
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
            copyLabel={t('explorerHeader.copyDebugData')}
            copiedLabel={t('explorerHeader.copied')}
            tooltipPosition="bottom"
            variant="default"
            size="md"
        />
    );
};
