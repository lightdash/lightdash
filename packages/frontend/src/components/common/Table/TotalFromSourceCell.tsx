import { Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A footer cell whose total is the column's own query collapsed to one row,
 * rather than an aggregate over the merged rows.
 */
const TotalFromSourceCell: FC<{ value: string; sourceLabel: string }> = ({
    value,
    sourceLabel,
}) => {
    const { t } = useTranslation('table');
    const explanation = t('totals.fromSourceExplanation', { sourceLabel });
    return (
        <Tooltip maw={360} multiline label={explanation}>
            <Text
                component="span"
                fz="inherit"
                fw="inherit"
                aria-label={`${value}, ${explanation}`}
                style={{
                    textDecoration: 'underline dotted',
                    textUnderlineOffset: 3,
                    cursor: 'help',
                }}
            >
                {value}
            </Text>
        </Tooltip>
    );
};

export default TotalFromSourceCell;
