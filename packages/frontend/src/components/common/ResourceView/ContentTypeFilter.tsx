import { ContentType } from '@lightdash/common';
import { Box, Center, SegmentedControl, Text } from '@mantine/core';
import {
    IconChartBar,
    IconLayoutDashboard,
    type Icon,
} from '@tabler/icons-react';
import React, { type FC } from 'react';
import MantineIcon from '../MantineIcon';

interface OptionProps {
    label: string;
    color?: string;
    icon?: Icon;
}

const ContentTypeSelectOption = ({ label, icon, color }: OptionProps) => (
    <Center px={'xxs'}>
        {icon && (
            <Box mr={'xxs'}>
                <MantineIcon
                    icon={icon}
                    fillOpacity={0.1}
                    fill={color}
                    color={color}
                />
            </Box>
        )}
        <Text size="sm" color="gray.7">
            {label}
        </Text>
    </Center>
);

const ContentTypeOptions = [
    {
        value: ContentType.DASHBOARD,
        label: (
            <ContentTypeSelectOption
                label={'Dashboards'}
                color={'green.8'}
                icon={IconLayoutDashboard}
            />
        ),
    },
    {
        value: ContentType.CHART,
        label: (
            <ContentTypeSelectOption
                label={'Charts'}
                color={'blue.8'}
                icon={IconChartBar}
            />
        ),
    },
];
type ContentTypeFilterProps = {
    value: ContentType | undefined;
    onChange: (value: ContentType | undefined) => void;
    options: ContentType[];
};

const ContentTypeFilter: FC<ContentTypeFilterProps> = ({
    value,
    onChange,
    options,
}) => {
    return (
        <SegmentedControl
            size="xs"
            radius="md"
            value={value ?? 'all'}
            onChange={(newValue) =>
                onChange(
                    newValue === 'all' ? undefined : (newValue as ContentType),
                )
            }
            data={[
                {
                    value: 'all',
                    label: <ContentTypeSelectOption label={'All'} />,
                },
                ...ContentTypeOptions.filter((option) =>
                    options?.includes(option.value),
                ),
            ]}
        />
    );
};

export default ContentTypeFilter;
