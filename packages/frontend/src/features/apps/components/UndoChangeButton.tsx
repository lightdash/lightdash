import { Button, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowBackUp } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './BuildCards.module.css';

type Props = {
    /** The version undo returns to (restored as a new version). */
    previousVersion: number;
    loading: boolean;
    onUndo: () => void;
};

/** Quiet one-click undo under the latest finished turn. */
const UndoChangeButton: FC<Props> = ({ previousVersion, loading, onUndo }) => (
    <Group gap={2} className={classes.turnActions}>
        {loading ? (
            <Text size="xs" fw={500} className={classes.turnActionPending}>
                <span data-shimmer>Undoing…</span>
            </Text>
        ) : (
            <Tooltip label={`Back to v${previousVersion}`} openDelay={200}>
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    className={classes.turnAction}
                    leftSection={
                        <MantineIcon icon={IconArrowBackUp} size={14} />
                    }
                    aria-label="Undo this change"
                    onClick={onUndo}
                >
                    Undo
                </Button>
            </Tooltip>
        )}
    </Group>
);

export default UndoChangeButton;
