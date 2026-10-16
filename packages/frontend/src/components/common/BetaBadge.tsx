import { Badge, Tooltip } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
    tooltipLabel?: string;
};

/**
 * A badge that displays a beta label and a tooltip when hovered.
 * @param tooltipLabel - The label to display in the tooltip
 * @returns A badge that displays a beta label and a tooltip when hovered.
 */
export const BetaBadge: FC<Props> = ({ tooltipLabel }) => {
    const { t } = useTranslation('commonUi');
    return (
        <Tooltip label={tooltipLabel ?? t('betaBadge.tooltip')}>
            <Badge color="indigo" size="xs" fz="xs">
                {t('betaBadge.label')}
            </Badge>
        </Tooltip>
    );
};
