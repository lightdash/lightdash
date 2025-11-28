import { ContentType } from '@lightdash/common';
import { Center, SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';

interface OptionProps {
    label: string;
    color?: string;
}

const ContentTypeSelectOption = ({ label }: OptionProps) => (
    <Center px={'xxs'}>
        <Text size="sm" color="ldGray.7">
            {label}
        </Text>
    </Center>
);

const ContentTypeOptions = [
    {
        value: ContentType.DASHBOARD,
        label: <ContentTypeSelectOption label={'Dashboards'} />,
    },
    {
        value: ContentType.CHART,
        label: <ContentTypeSelectOption label={'Charts'} />,
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
