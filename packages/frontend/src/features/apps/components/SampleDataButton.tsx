import { ActionIcon, Tooltip } from '@mantine/core';
import { IconDatabase, IconDatabasePlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';

export const SampleDataButton: FC<{
    enabled: boolean;
    onToggle: () => void;
    disabled?: boolean;
}> = ({ enabled, onToggle, disabled }) => {
    const { t } = useTranslation('apps');
    return (
        <Tooltip
            label={
                enabled ? t('sampleDataButton.on') : t('sampleDataButton.off')
            }
            multiline
            w={260}
            position="top"
        >
            <ActionIcon
                variant={enabled ? 'light' : 'subtle'}
                color={enabled ? 'indigo' : 'gray'}
                size="md"
                radius="xl"
                onClick={onToggle}
                disabled={disabled}
                aria-label={t('resourcePicker.sampleData.include')}
                aria-pressed={enabled}
            >
                <MantineIcon
                    icon={enabled ? IconDatabase : IconDatabasePlus}
                    size={16}
                />
            </ActionIcon>
        </Tooltip>
    );
};
