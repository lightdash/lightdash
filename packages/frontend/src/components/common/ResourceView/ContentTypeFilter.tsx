import { ContentType, FeatureFlags } from '@lightdash/common';
import {
    Center,
    SegmentedControl,
    Select,
    Text,
    useMatches,
} from '@mantine/core';
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

const getContentTypeOptions = (t: TFunction<'resourceView'>) => [
    {
        value: ContentType.DOCUMENT,
        label: t('contentTypeFilter.documents'),
    },
    {
        value: ContentType.DASHBOARD,
        label: t('contentTypeFilter.dashboards'),
    },
    {
        value: ContentType.CHART,
        label: t('contentTypeFilter.charts'),
    },
    {
        value: ContentType.DATA_APP,
        label: t('contentTypeFilter.dataApps'),
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
    const { t } = useTranslation('resourceView');
    const documentsFlag = useServerFeatureFlag(FeatureFlags.Documents);
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    const data = [
        { value: 'all', label: t('contentTypeFilter.all') },
        ...getContentTypeOptions(t).filter(
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
                aria-label={t('contentTypeFilter.ariaLabel')}
                miw={112}
                maw={160}
                flex="1 1 112px"
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
