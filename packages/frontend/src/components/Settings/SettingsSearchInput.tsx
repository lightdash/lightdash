import { ActionIcon, TextInput } from '@mantine-8/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type SettingsSearchInputProps = {
    value: string;
    onChange: (value: string) => void;
};

const SettingsSearchInput: FC<SettingsSearchInputProps> = ({
    value,
    onChange,
}) => {
    const hasValue = value.length > 0;

    return (
        <TextInput
            size="xs"
            radius="md"
            placeholder="Search settings"
            aria-label="Search settings"
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            leftSection={<MantineIcon icon={IconSearch} color="ldGray.6" />}
            rightSectionPointerEvents={hasValue ? 'auto' : 'none'}
            rightSection={
                hasValue ? (
                    <ActionIcon
                        aria-label="Clear search"
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
