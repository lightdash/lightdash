import { type DataAppVizField } from '@lightdash/common';
import { Badge } from '@mantine-8/core';
import { type FC } from 'react';
import { LD_FIELD_COLORS } from '../../../mantineTheme';

// Match the field-type colors used everywhere else (field icons, sidebar tree,
// AI-copilot field badges) via the canonical LD_FIELD_COLORS tokens. `series`
// has no Lightdash field-type equivalent, so it falls back to the neutral
// default. Keyed off the union type so a new field type breaks the build here.
const FIELD_TYPE_COLORS: Record<
    DataAppVizField['type'],
    { bg: string; color: string }
> = {
    dimension: LD_FIELD_COLORS.dimension,
    metric: LD_FIELD_COLORS.metric,
    series: LD_FIELD_COLORS.DEFAULT,
};

const DataAppVizFieldTypeBadge: FC<{ type: DataAppVizField['type'] }> = ({
    type,
}) => {
    const colors = FIELD_TYPE_COLORS[type];
    return (
        <Badge size="xs" radius="sm" bg={colors.bg} c={colors.color}>
            {type}
        </Badge>
    );
};

export default DataAppVizFieldTypeBadge;
