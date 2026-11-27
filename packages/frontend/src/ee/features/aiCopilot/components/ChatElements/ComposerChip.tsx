import { ActionIcon, Box } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './ComposerChip.module.css';

type Props = {
    icon: ReactNode;
    label: string;
    /** Null where the chip cannot be taken away, e.g. a file still queued. */
    remove: { label: string; onClick: () => void } | null;
    disabled: boolean;
};

/** Something attached to the next prompt, shown inside the composer. */
export const ComposerChip: FC<Props> = ({ icon, label, remove, disabled }) => (
    <Box
        className={styles.chip}
        title={label}
        data-static={remove ? undefined : true}
        data-disabled={disabled || undefined}
    >
        {icon}
        <span className={styles.label}>{label}</span>
        {remove && (
            <ActionIcon
                size="xs"
                c="dimmed"
                disabled={disabled}
                onClick={remove.onClick}
                aria-label={remove.label}
            >
                <MantineIcon icon={IconX} size={12} />
            </ActionIcon>
        )}
    </Box>
);
