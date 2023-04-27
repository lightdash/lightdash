import { Colors, Icon } from '@blueprintjs/core';
import { Anchor, Tooltip, TooltipProps } from '@mantine/core';
import { ComponentProps, FC } from 'react';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    iconProps?: Partial<ComponentProps<typeof Icon>>;
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
            style={{ color: Colors.GRAY5 }}
            {...anchorProps}
        >
            <Icon icon="help" intent="none" iconSize={15} {...iconProps} />
        </Anchor>
    </Tooltip>
);

export default DocumentationHelpButton;
