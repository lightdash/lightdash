import { ContentType, FeatureFlags } from '@lightdash/common';
import { Center, SegmentedControl, Text } from '@mantine/core';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

interface OptionProps {
    label: string;
    color?: string;
}

const ContentTypeSelectOption = ({ label }: OptionProps) => (
    <Center px={'xxs'}>
        <Text fz="sm" c="ldGray.7">
            {label}
        </Text>
    </Center>
);

const ContentTypeOptions = [
    {
        value: ContentType.DOCUMENT,
        label: <ContentTypeSelectOption label="Documents" />,
    },
    {
        value: ContentType.DASHBOARD,
        label: <ContentTypeSelectOption label={'Dashboards'} />,
    },
    {
        value: ContentType.CHART,
        label: <ContentTypeSelectOption label={'Charts'} />,
    },
    {
        value: ContentType.DATA_APP,
        label: <ContentTypeSelectOption label={'Data Apps'} />,
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
    const documentsFlag = useServerFeatureFlag(FeatureFlags.Documents);
    return (
        <SegmentedControl
            size="xs"
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
                ...ContentTypeOptions.filter(
                    (option) =>
                        options?.includes(option.value) &&
                        (option.value !== ContentType.DOCUMENT ||
                            (documentsFlag.data?.enabled === true &&
                                !documentsFlag.isError)),
                ),
            ]}
        />
    );
};

export default ContentTypeFilter;
