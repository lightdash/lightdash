import { Group, Kbd, Text, TextInput } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { FC, MouseEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    onOpen: (e: MouseEvent<HTMLInputElement>) => void;
};

const OmnibarTarget: FC<Props> = ({ onOpen }) => {
    const os = useOs();

    return (
        <TextInput
            role="search"
            size="xs"
            w={250}
            placeholder="Search..."
            icon={<MantineIcon icon={IconSearch} color="gray.1" />}
            rightSection={
                <Group mr="xs" spacing="xxs">
                    <Kbd fw={600}>
                        {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                    </Kbd>

                    <Text color="dimmed" fw={600}>
                        +
                    </Text>

                    <Kbd fw={600}>k</Kbd>
                </Group>
            }
            rightSectionWidth="auto"
            onClick={onOpen}
        />
    );
};

export default OmnibarTarget;
