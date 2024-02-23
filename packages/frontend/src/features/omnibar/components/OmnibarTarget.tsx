import { Badge, Group, Text } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { CSSProperties, FC, MouseEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    style: CSSProperties;
    onOpen: (e: MouseEvent<HTMLInputElement>) => void;
};

const OmnibarTarget: FC<Props> = ({ style, onOpen }) => {
    const os = useOs();

    return (
        <Group
            px="sm"
            role="search"
            h={30}
            w={350}
            onClick={onOpen}
            style={style}
            sx={(theme) => ({
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                borderRadius: theme.radius.sm,
                cursor: 'pointer',
                transition: 'all 100ms ease',
                backgroundColor: theme.colors.dark[4],
                '&:hover': { backgroundColor: theme.colors.dark[3] },
            })}
        >
            <MantineIcon icon={IconSearch} color="dark.0" />

            <Text
                style={{ flexGrow: 1, position: 'relative', top: 1 }}
                color="dark.0"
                size="xs"
            >
                Search...
            </Text>

            <Badge fw={600} color="dark.0" radius="sm">
                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                +K
            </Badge>
        </Group>
    );
};

export default OmnibarTarget;
