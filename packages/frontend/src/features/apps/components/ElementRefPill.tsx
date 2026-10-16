import { ActionIcon, Box, Text, Tooltip } from '@mantine/core';
import { IconClick, IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import { elementRefChipLabel, type ElementRef } from '../utils/elementRefs';
import classes from './ElementRefPill.module.css';

/**
 * An element reference picked from a preview. Removable in the composer;
 * without `onRemove` it renders read-only, e.g. in a sent message.
 */
export const ElementRefPill: FC<{
    elementRef: ElementRef;
    onRemove?: () => void;
}> = ({ elementRef, onRemove }) => {
    const { t } = useTranslation('apps');
    const label = elementRefChipLabel(elementRef);
    return (
        <Tooltip
            position="top-start"
            disabled={!elementRef.loc}
            label={t('elementRef.source', { loc: elementRef.loc })}
        >
            <Box
                className={clsx(classes.pill, !onRemove && classes.pillStatic)}
            >
                <MantineIcon icon={IconClick} size={12} color="violet.6" />
                <Text fw={500} truncate className={classes.label}>
                    {label}
                </Text>
                {onRemove && (
                    <ActionIcon
                        size="xs"
                        radius="xl"
                        onClick={onRemove}
                        aria-label={t('common.removeNamed', { name: label })}
                    >
                        <MantineIcon icon={IconX} size={10} />
                    </ActionIcon>
                )}
            </Box>
        </Tooltip>
    );
};
