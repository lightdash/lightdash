import {
    Anchor,
    Group,
    HoverCard,
    Stack,
    Text,
    type AnchorProps,
    type TooltipProps,
} from '@mantine/core';
import { IconExternalLink, IconHelpCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import useIsEmbedded from '../ee/providers/Embed/useIsEmbedded';
import MantineIcon, { type MantineIconProps } from './common/MantineIcon';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> &
    Partial<AnchorProps> & {
        iconProps?: Partial<MantineIconProps>;
        tooltipProps?: Partial<TooltipProps>;
    };

const DocumentationHelpButton: FC<Props> = ({
    iconProps,
    tooltipProps,
    ...anchorProps
}) => {
    const isEmbedded = useIsEmbedded();
    if (isEmbedded) return null;

    return (
        <HoverCard
            position={tooltipProps?.position ?? 'top'}
            width={260}
            shadow="md"
            openDelay={150}
            closeDelay={150}
            withinPortal
        >
            <HoverCard.Target>
                <Anchor
                    role="button"
                    target="_blank"
                    rel="noreferrer"
                    c="dimmed"
                    {...anchorProps}
                >
                    <MantineIcon
                        icon={IconHelpCircle}
                        size="md"
                        display="inline"
                        {...iconProps}
                    />
                </Anchor>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Stack gap="xs">
                    <Text size="sm">
                        {tooltipProps?.label ?? 'Step-by-step setup guide.'}
                    </Text>
                    <Anchor
                        href={anchorProps.href}
                        target="_blank"
                        rel="noreferrer"
                        size="sm"
                        fw={500}
                    >
                        <Group gap={4} wrap="nowrap">
                            Open docs
                            <MantineIcon icon={IconExternalLink} size="sm" />
                        </Group>
                    </Anchor>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

export default DocumentationHelpButton;
