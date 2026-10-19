import { Box, Tooltip } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useComposerNodeStatusLabel,
    type ComposerNodeStatus,
} from './composerNodeStatus';
import styles from './ComposerNodeStatusIndicator.module.css';

export const NodeStatusIndicator: FC<{ status: ComposerNodeStatus }> = ({
    status,
}) => {
    const label = useComposerNodeStatusLabel()(status);
    return (
        <Tooltip label={label} position="top">
            <Box
                className={styles.statusIndicator}
                data-status={status}
                aria-label={label}
            >
                {status === 'success' ? (
                    <MantineIcon icon={IconCheck} size={11} stroke={2.4} />
                ) : status === 'error' ? (
                    <MantineIcon icon={IconX} size={11} stroke={2.4} />
                ) : (
                    <Box className={styles.statusDot} data-status={status} />
                )}
            </Box>
        </Tooltip>
    );
};
