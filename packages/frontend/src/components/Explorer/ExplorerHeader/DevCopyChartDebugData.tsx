import { ActionIcon, CopyButton, Tooltip } from '@mantine-8/core';
import { IconCheck, IconCode } from '@tabler/icons-react';
import {
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import MantineIcon from '../../common/MantineIcon';

export const DevCopyChartDebugData = () => {
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);

    return (
        <CopyButton value={JSON.stringify({ unsavedChartVersion }, null, 2)}>
            {({ copied, copy }) => (
                <Tooltip
                    label={copied ? 'Copied!' : 'Copy chart debug data'}
                    withArrow
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
