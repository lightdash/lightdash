import {
    getItemId,
    isFilterableItem,
    type CustomDimension,
    type Field,
    type FilterRule,
    type TableCalculation,
} from '@lightdash/common';
import { Badge, HoverCard, Stack, Text } from '@mantine-8/core';
import { IconFilter } from '@tabler/icons-react';
import { type FC } from 'react';
import { getConditionalRuleLabelFromItem } from '../common/Filters/FilterInputs/utils';
import MantineIcon from '../common/MantineIcon';
import classes from './UnderlyingDataFilterBadges.module.css';

type Props = {
    filterRules: FilterRule[];
    fields: (Field | TableCalculation | CustomDimension)[];
};

// Inline filter-count chip + hover card summarising which filters scope the
// underlying data results, mirroring the dashboard tile filter popover.
// Rendered inside the modal title (a <p>), so the target must stay inline.
const UnderlyingDataFilterBadges: FC<Props> = ({ filterRules, fields }) => {
    const labelledRules = filterRules.flatMap((filterRule) => {
        const field = fields.find(
            (f) => getItemId(f) === filterRule.target.fieldId,
        );
        if (!field || !isFilterableItem(field)) return [];
        return [
            {
                id: filterRule.id,
                labels: getConditionalRuleLabelFromItem(filterRule, field),
            },
        ];
    });

    if (labelledRules.length === 0) return null;

    return (
        <HoverCard
            withArrow
            withinPortal
            shadow="md"
            position="bottom-start"
            offset={4}
            arrowOffset={10}
        >
            <HoverCard.Target>
                <Badge
                    component="span"
                    className={classes.target}
                    variant="default"
                    c="ldDark.7"
                    radius="md"
                    size="lg"
                    fz="xs"
                    fw={500}
                    tt="none"
                    leftSection={<MantineIcon icon={IconFilter} size="sm" />}
                >
                    {labelledRules.length} filter
                    {labelledRules.length > 1 ? 's' : ''}
                </Badge>
            </HoverCard.Target>
            <HoverCard.Dropdown maw={500}>
                <Text c="ldGray.7" fw={500} fz="xs" mb="xs">
                    Underlying data is filtered to:
                </Text>
                <Stack gap="xs" align="flex-start">
                    {labelledRules.map(({ id, labels }) => (
                        <Badge
                            key={id}
                            variant="outline"
                            color="ldGray.4"
                            radius="sm"
                            size="lg"
                            fz="xs"
                            fw="normal"
                            tt="none"
                        >
                            <Text fw={600} span inherit c="foreground">
                                {labels.field}:
                            </Text>{' '}
                            <Text span inherit c="foreground">
                                {labels.operator}
                            </Text>{' '}
                            <Text fw={600} span inherit c="foreground">
                                {labels.value}
                            </Text>
                        </Badge>
                    ))}
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

export default UnderlyingDataFilterBadges;
