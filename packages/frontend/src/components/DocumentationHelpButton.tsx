import { ActionIcon, AnchorProps, Tooltip, TooltipProps } from '@mantine/core';
import { IconHelp } from '@tabler/icons-react';
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
        withinPortal
        label="Open documentation"
        position="top"
        maw={350}
        {...tooltipProps}
    >
        <ActionIcon
            component="a"
            target="_blank"
            rel="noreferrer"
            {...anchorProps}
        >
            <MantineIcon
                icon={IconHelp}
                size="md"
                display="inline"
                {...iconProps}
            />
        </ActionIcon>
    </Tooltip>
);

export default DocumentationHelpButton;
