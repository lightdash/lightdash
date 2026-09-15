import { ContentType, FeatureFlags } from '@lightdash/common';
import {
    Center,
    SegmentedControl,
    Select,
    Text,
    useMatches,
} from '@mantine/core';
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
        label: 'Documents',
    },
    {
        value: ContentType.DASHBOARD,
        label: 'Dashboards',
    },
    {
        value: ContentType.CHART,
        label: 'Charts',
    },
    {
        value: ContentType.DATA_APP,
        label: 'Data Apps',
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
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    const data = [
        { value: 'all', label: 'All' },
        ...ContentTypeOptions.filter(
            (option) =>
                options.includes(option.value) &&
                (option.value !== ContentType.DOCUMENT ||
                    (documentsFlag.data?.enabled === true &&
                        !documentsFlag.isError)),
        ),
    ];
    const handleChange = (next: string) =>
        onChange(next === 'all' ? undefined : (next as ContentType));
    if (compact) {
        return (
            <Select
                aria-label="Content type"
                w="100%"
                value={value ?? 'all'}
                data={data}
                allowDeselect={false}
                onChange={(next) => next && handleChange(next)}
            />
        );
    }
    return (
        <SegmentedControl
            size="xs"
            value={value ?? 'all'}
            onChange={handleChange}
            data={data.map((option) => ({
                ...option,
                label: <ContentTypeSelectOption label={option.label} />,
            }))}
        />
    );
};

export default ContentTypeFilter;
