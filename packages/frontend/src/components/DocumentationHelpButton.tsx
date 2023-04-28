import { Anchor, AnchorProps, Tooltip, TooltipProps } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon, { MantineIconProps } from './common/MantineIcon';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> &
    Partial<AnchorProps> & {
        iconProps?: Partial<MantineIconProps>;
        tooltipProps?: Partial<TooltipProps>;
    };

const DocumentationHelpButton: FC<Props> = ({
    iconProps,
    tooltipProps,
    ...anchorProps
}) => (
    <Tooltip
        withArrow
        withinPortal
        label="Open documentation"
        position="top"
        width={350}
        {...tooltipProps}
    >
        <Anchor
            role="button"
            target="_blank"
            rel="noreferrer"
            color="dimmed"
            {...anchorProps}
        >
            <MantineIcon icon={IconHelpCircle} size="md" {...iconProps} />
        </Anchor>
    </Tooltip>
);

export default DocumentationHelpButton;
