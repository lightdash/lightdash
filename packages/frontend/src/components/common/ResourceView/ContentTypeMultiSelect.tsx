import { ContentType } from '@lightdash/common';
import { Group, MultiSelect, Text } from '@mantine/core';
import {
    IconChartBar,
    IconLayoutDashboard,
    type Icon,
} from '@tabler/icons-react';
import React, { forwardRef, type FC } from 'react';
import MantineIcon from '../MantineIcon';

const ContentTypeOptions = [
    {
        value: ContentType.DASHBOARD,
        label: 'Dashboard',
        color: 'green.8',
        icon: IconLayoutDashboard,
    },
    {
        value: ContentType.CHART,
        label: 'Chart',
        color: 'blue.8',
        icon: IconChartBar,
    },
];

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    color: string;
    icon: Icon;
}

const ContentTypeSelectOption = forwardRef<HTMLDivElement, ItemProps>(
    ({ label, icon, color, ...others }: ItemProps, ref) => (
        <div ref={ref} {...others}>
            <Group spacing={'xs'}>
                <MantineIcon
                    icon={icon}
                    fillOpacity={0.1}
                    fill={color}
                    color={color}
                />
                <Text size="sm">{label}</Text>
            </Group>
        </div>
    ),
);

type ContentTypeMultiSelectProps = {
    value: ContentType[];
    onChange: (value: ContentType[]) => void;
    optionsContentTypes?: ContentType[];
};

const ContentTypeMultiSelect: FC<ContentTypeMultiSelectProps> = ({
    value,
    onChange,
    optionsContentTypes,
}) => {
    return (
        <MultiSelect
            size="xs"
            radius="md"
            variant="default"
            placeholder="Filter by types"
            value={value}
            styles={(inputTheme) => ({
                input: {
                    height: 32,
                    minWidth: 200,
                    fontSize: inputTheme.fontSizes.sm,
                    boxShadow: inputTheme.shadows.subtle,
                    border: `1px solid ${inputTheme.colors.gray[3]}`,
                    '&:hover': {
                        border: `1px solid ${inputTheme.colors.gray[4]}`,
                    },
                    '&:focus': {
                        border: `1px solid ${inputTheme.colors.blue[5]}`,
                    },
                },
                values: {
                    height: '100%',
                    fontSize: inputTheme.fontSizes.sm,
                },
            })}
            onChange={onChange}
            itemComponent={ContentTypeSelectOption}
            data={ContentTypeOptions.filter((option) =>
                optionsContentTypes?.includes(option.value),
            )}
        />
    );
};

export default ContentTypeMultiSelect;
