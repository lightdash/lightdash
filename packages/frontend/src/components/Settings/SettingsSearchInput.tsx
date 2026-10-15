import { ActionIcon, TextInput } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../common/MantineIcon';

type SettingsSearchInputProps = {
    value: string;
    onChange: (value: string) => void;
};

const SettingsSearchInput: FC<SettingsSearchInputProps> = ({
    value,
    onChange,
}) => {
    const { t } = useTranslation('settings');
    const hasValue = value.length > 0;

    return (
        <TextInput
            size="xs"
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            leftSection={<MantineIcon icon={IconSearch} color="dimmed" />}
            rightSectionPointerEvents={hasValue ? 'auto' : 'none'}
            rightSection={
                hasValue ? (
                    <ActionIcon
                        aria-label={t('search.clear')}
                        variant="transparent"
                        color="ldGray.5"
                        size="xs"
                        onClick={() => onChange('')}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                ) : null
            }
        />
    );
};

export default SettingsSearchInput;
