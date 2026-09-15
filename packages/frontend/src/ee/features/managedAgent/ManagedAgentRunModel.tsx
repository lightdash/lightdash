import { type ManagedAgentRun } from '@lightdash/common';
import { Box, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

export const ManagedAgentRunModel: FC<{
    run: Pick<ManagedAgentRun, 'modelName' | 'modelProvider'>;
}> = ({ run }) => {
    if (!run.modelName) return null;
    const label = [run.modelProvider, run.modelName]
        .filter(Boolean)
        .join(' · ');
    return (
        <Tooltip label={label} withinPortal>
            <Box component="span" aria-label={`Model: ${label}`} display="flex">
                <MantineIcon icon={IconHelpCircle} size={12} color="dimmed" />
            </Box>
        </Tooltip>
    );
};
