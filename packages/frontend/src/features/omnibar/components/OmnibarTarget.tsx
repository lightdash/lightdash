import { Badge, em, getBreakpointValue, Group, Text } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { type CSSProperties, type FC, type MouseEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    placeholder: string;
    style: CSSProperties;
    onOpen: (e: MouseEvent<HTMLInputElement>) => void;
};

const OmnibarTarget: FC<Props> = ({ placeholder, style, onOpen }) => {
    const os = useOs();

    return (
        <Group
            px="sm"
            spacing="sm"
            role="search"
            h={30}
            onClick={onOpen}
            style={style}
            noWrap
            w={{
                xs: 150,
                sm: 200,
                md: 250,
                lg: 300,
                xl: 350,
            }}
            sx={(theme) => ({
                [`@media (min-width: ${em(
                    getBreakpointValue(theme.breakpoints.lg),
                )})`]: {
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                },
                flexShrink: 0,
                borderRadius: theme.radius.sm,
                cursor: 'pointer',
                transition: 'all 100ms ease',
                backgroundColor: theme.colors.dark[4],
                '&:hover': { backgroundColor: theme.colors.dark[3] },
                overflow: 'hidden',
            })}
        >
            <MantineIcon
                icon={IconSearch}
                color="dark.0"
                style={{ flexShrink: 0 }}
            />

            <Text
                style={{
                    flexGrow: 1,
                    position: 'relative',
                    top: 1,
                    userSelect: 'none',
                }}
                color="dark.0"
                size="xs"
                truncate
            >
                {placeholder}
            </Text>

            <Badge
                fw={600}
                color="dark.0"
                radius="sm"
                style={{ flexShrink: 0, userSelect: 'none' }}
            >
                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                +K
            </Badge>
        </Group>
    );
};

export default OmnibarTarget;
