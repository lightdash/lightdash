import { ActionIcon, Badge, Button, Group, Text, Tooltip } from '@mantine/core';
import {
    IconArrowsUpDown,
    IconStack2,
    IconStackFront,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../common/MantineIcon';
import styles from './seriesDrawOrder.module.css';

export type SeriesDrawOrderControl = {
    isFront: boolean;
    onBringToFront: () => void;
};

type SeriesDrawOrderBarProps = {
    canReorder: boolean;
    onReverse: () => void;
};

export const SeriesDrawOrderBar: FC<SeriesDrawOrderBarProps> = ({
    canReorder,
    onReverse,
}) => {
    const { t } = useTranslation('vizConfig');
    return (
        <Group className={styles.orderBar} px="xs" py="two" wrap="nowrap">
            <MantineIcon icon={IconStack2} color="dimmed" />
            <Text size="xs" c="dimmed">
                {t('series.drawOrder.label')}{' '}
                <Text span inherit fw={600}>
                    {t('series.drawOrder.back')}
                </Text>
                {' → '}
                <Text span inherit fw={600}>
                    {t('series.drawOrder.front')}
                </Text>
            </Text>
            {canReorder && (
                <Tooltip
                    label={t('series.drawOrder.reverseTooltip')}
                    position="top"
                    openDelay={300}
                >
                    <Button
                        ml="auto"
                        variant="subtle"
                        color="gray"
                        size="compact-xs"
                        leftSection={<MantineIcon icon={IconArrowsUpDown} />}
                        onClick={onReverse}
                    >
                        {t('series.drawOrder.reverse')}
                    </Button>
                </Tooltip>
            )}
        </Group>
    );
};

type SeriesDepthControlProps = {
    control: SeriesDrawOrderControl;
};

// Fixed-width slot so revealing the action on hover can't resize the series name field.
export const SeriesDepthControl: FC<SeriesDepthControlProps> = ({
    control,
}) => {
    const { t } = useTranslation('vizConfig');
    return (
        <Group className={styles.depthSlot} justify="flex-end" wrap="nowrap">
            {control.isFront ? (
                <Badge size="xs">{t('series.drawOrder.front')}</Badge>
            ) : (
                <Tooltip
                    label={t('series.drawOrder.bringToFront')}
                    position="top"
                    openDelay={300}
                >
                    <ActionIcon
                        className={styles.frontAction}
                        size="sm"
                        aria-label={t('series.drawOrder.bringToFront')}
                        onClick={control.onBringToFront}
                    >
                        <MantineIcon icon={IconStackFront} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};
