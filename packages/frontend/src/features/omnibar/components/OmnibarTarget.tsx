import { Kbd, Text } from '@mantine/core';
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
            px="xs"
            gap="xs"
            role="search"
            aria-label="Search content and settings"
            onClick={onOpen}
            style={style}
            wrap="nowrap"
            w={{
                base: 44,
                sm: 180,
                lg: 220,
                xl: 260,
            }}
            className={classes.container}
        >
            <MantineIcon icon={IconSearch} size="sm" className={classes.icon} />

            <Text size="sm" truncate className={classes.text} visibleFrom="sm">
                {placeholder}
            </Text>

            <Kbd size="xs" visibleFrom="sm">
                {os === 'macos' || os === 'ios' ? '⌘' : 'Ctrl'}K
            </Kbd>
        </PolymorphicGroupButton>
    );
};

export default OmnibarTarget;
