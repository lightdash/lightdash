import { Badge, Text } from '@mantine-8/core';
import { useOs } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { type CSSProperties, type FC, type MouseEvent } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../components/common/PolymorphicGroupButton';
import classes from './OmnibarTarget.module.css';

type Props = {
    placeholder: string;
    style: CSSProperties;
    onOpen: (e: MouseEvent<HTMLInputElement>) => void;
};

const OmnibarTarget: FC<Props> = ({ placeholder, style, onOpen }) => {
    const os = useOs();

    return (
        <PolymorphicGroupButton
            px="sm"
            gap="sm"
            role="search"
            h={30}
            onClick={onOpen}
            style={style}
            wrap="nowrap"
            w={{
                xs: 150,
                sm: 200,
                md: 250,
                lg: 300,
                xl: 350,
            }}
            className={classes.container}
        >
            <MantineIcon icon={IconSearch} className={classes.icon} />

            <Text c="ldDark.9" size="xs" truncate className={classes.text}>
                {placeholder}
            </Text>

            <Badge fw={600} radius="sm" className={classes.badge}>
                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                +K
            </Badge>
        </PolymorphicGroupButton>
    );
};

export default OmnibarTarget;
