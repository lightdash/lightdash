import { Text, Tooltip } from '@mantine/core';
import { type FC } from 'react';

/**
 * A footer cell whose total is the column's own query collapsed to one row,
 * rather than an aggregate over the merged rows.
 */
const TotalFromSourceCell: FC<{ value: string; sourceLabel: string }> = ({
    value,
    sourceLabel,
}) => {
    const explanation = `Total of the ${sourceLabel} query. The merge keeps every ${sourceLabel} row, so it is the total of the rows shown.`;
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
