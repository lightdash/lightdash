import {
    ActionIcon,
    Code,
    CopyButton,
    Group,
    Text,
    Tooltip,
    type TextProps,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from './MantineIcon';

const TextCopy: FC<{
    text: string;
    tooltipLabel?: string;
    sx?: TextProps['sx'];
    variant?: 'text' | 'code';
}> = ({ text, tooltipLabel, variant = 'text', sx }) => {
    const { hovered, ref } = useHover();

    return (
        <Group ref={ref} spacing="xs">
            {variant === 'code' ? (
                <Code sx={sx}>{text}</Code>
            ) : (
                <Text sx={sx}>{text}</Text>
            )}
            {hovered && (
                <CopyButton value={text}>
                    {({ copied, copy }) => (
                        <Tooltip
                            label={copied ? 'Copied' : tooltipLabel}
                            variant="xs"
                            withinPortal
                            position="right"
                            disabled={!tooltipLabel}
                        >
                            <ActionIcon size="xs" onClick={copy}>
                                <MantineIcon
                                    color={copied ? 'teal' : 'gray'}
                                    icon={IconCopy}
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </CopyButton>
            )}
        </Group>
    );
};

export default TextCopy;
