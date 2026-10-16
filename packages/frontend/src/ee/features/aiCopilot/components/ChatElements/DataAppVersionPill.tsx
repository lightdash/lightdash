import { Box, Button, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowBackUp, IconRestore } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './DataAppVersionPill.module.css';

type Props = {
    version: number;
    onReturnToLatest: () => void;
    /** Offered only where the user can manage the app; disabled iff a reason. */
    restore: null | {
        onClick: () => void;
        disabledReason: string | null;
    };
};

/** Floats over the preview while it shows a version older than latest ready. */
export const DataAppVersionPill: FC<Props> = ({
    version,
    onReturnToLatest,
    restore,
}) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Group gap="xs" wrap="nowrap" className={classes.pill}>
            <Text size="xs" fw={500} className={classes.versionLabel}>
                {t('versionPill.viewing', { version })}
            </Text>
            <Button
                size="compact-sm"
                leftSection={<MantineIcon icon={IconArrowBackUp} size="sm" />}
                onClick={onReturnToLatest}
            >
                {t('versionPill.returnToLatest')}
            </Button>
            {restore && (
                <Tooltip
                    label={restore.disabledReason}
                    disabled={restore.disabledReason === null}
                >
                    <Box>
                        <Button
                            size="compact-sm"
                            variant="default"
                            leftSection={
                                <MantineIcon icon={IconRestore} size="sm" />
                            }
                            disabled={restore.disabledReason !== null}
                            onClick={restore.onClick}
                        >
                            {t('versionPill.restore')}
                        </Button>
                    </Box>
                </Tooltip>
            )}
        </Group>
    );
};
