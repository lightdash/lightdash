import { ActionIcon, CopyButton, Tooltip } from '@mantine/core';
import { IconCheck, IconCode } from '@tabler/icons-react';
import {
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import useEchartsCartesianConfig from '../../../hooks/echarts/useEchartsCartesianConfig';
import MantineIcon from '../../common/MantineIcon';

export const DevCopyChartDebugData = () => {
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const echartsOptions = useEchartsCartesianConfig();

    return (
        <CopyButton
            value={JSON.stringify(
                { unsavedChartVersion, echartsOptions },
                null,
                2,
            )}
        >
            {({ copied, copy }) => (
                <Tooltip
                    label={copied ? 'Copied!' : 'Copy chart debug data'}
                    position="bottom"
                >
                    <ActionIcon onClick={copy} variant="default" size="md">
                        <MantineIcon icon={copied ? IconCheck : IconCode} />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    );
};
