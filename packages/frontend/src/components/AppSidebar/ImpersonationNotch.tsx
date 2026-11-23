import { ActionIcon, Box, Text, Tooltip } from '@mantine/core';
import { IconEye, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { useStopImpersonation } from '../../hooks/user/useImpersonation';
import MantineIcon from '../common/MantineIcon';
import classes from './ImpersonationNotch.module.css';

/**
 * Impersonation can run alongside any other notice, so it has its own mark:
 * a tab on the page's top edge, with the page outlined in the same color.
 */
export const ImpersonationNotch: FC = () => {
    const { mutate: stopImpersonating, isLoading } = useStopImpersonation();

    return (
        <Box
            id="impersonation-banner"
            className={classes.notch}
            role="status"
            aria-label="You are impersonating another user"
        >
            <MantineIcon icon={IconEye} size={14} />
            <Text fz="xs" fw={600}>
                Impersonating
            </Text>
            <Tooltip label="Stop impersonating">
                <ActionIcon
                    size="xs"
                    radius="xl"
                    variant="transparent"
                    aria-label="Stop impersonating"
                    className={classes.stop}
                    loading={isLoading}
                    onClick={() => stopImpersonating()}
                >
                    <MantineIcon icon={IconX} size={12} />
                </ActionIcon>
            </Tooltip>
        </Box>
    );
};
