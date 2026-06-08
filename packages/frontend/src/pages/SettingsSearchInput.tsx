import { ActionIcon, Kbd, TextInput } from '@mantine-8/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { forwardRef } from 'react';
import MantineIcon from '../components/common/MantineIcon';

type SettingsSearchInputProps = {
    value: string;
    onChange: (value: string) => void;
};

const SettingsSearchInput = forwardRef<
    HTMLInputElement,
    SettingsSearchInputProps
>(({ value, onChange }, ref) => {
    const hasValue = value.length > 0;

    return (
        <TextInput
            ref={ref}
            size="xs"
            radius="md"
            placeholder="Search settings"
            aria-label="Search settings"
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && hasValue) {
                    event.preventDefault();
                    onChange('');
                }
            }}
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
                ) : (
                    <Kbd size="xs">/</Kbd>
                )
            }
        />
    );
});

SettingsSearchInput.displayName = 'SettingsSearchInput';

export default SettingsSearchInput;
