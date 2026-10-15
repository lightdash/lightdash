import { SegmentedControl, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
};

export const BuilderLinkingField: FC<Props> = ({
    value,
    onChange,
    disabled,
}) => {
    const { t } = useTranslation('sync');
    return (
        <Stack gap={4}>
            <Text fz="sm" fw={500}>
                {t('externalConnections.builderLinking.label')}
            </Text>
            <SegmentedControl
                fullWidth
                disabled={disabled}
                data={[
                    {
                        value: 'admins',
                        label: t(
                            'externalConnections.builderLinking.adminsOnly',
                        ),
                    },
                    {
                        value: 'builders',
                        label: t('externalConnections.builderLinking.builders'),
                    },
                ]}
                value={value ? 'builders' : 'admins'}
                onChange={(nextValue) => onChange(nextValue === 'builders')}
            />
        </Stack>
    );
};
