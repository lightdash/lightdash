import { Box, Loader, Tooltip } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useComposerNodeStatusLabel,
    type ComposerNodeStatus,
} from './composerNodeStatus';
import styles from './ComposerNodeStatusIndicator.module.css';

type Props = {
    status: ComposerNodeStatus;
    /** `md` is the activity-row size: a spinner while running and a quiet check when done. */
    size?: 'sm' | 'md';
};

export const NodeStatusIndicator: FC<Props> = ({ status, size = 'sm' }) => {
    const label = useComposerNodeStatusLabel()(status);
    const glyphSize = size === 'md' ? 14 : 11;
    const renderGlyph = () => {
        if (status === 'success')
            return (
                <MantineIcon icon={IconCheck} size={glyphSize} stroke={2.4} />
            );
        if (status === 'error')
            return <MantineIcon icon={IconX} size={glyphSize} stroke={2.4} />;
        if (status === 'running' && size === 'md')
            return <Loader size={12} color="var(--mantine-color-text)" />;
        return <Box className={styles.statusDot} data-status={status} />;
    };
    return (
        <Tooltip label={label} position="top">
            <Box
                className={styles.statusIndicator}
                data-status={status}
                data-size={size}
                aria-label={label}
            >
                {renderGlyph()}
            </Box>
        </Tooltip>
    );
};
