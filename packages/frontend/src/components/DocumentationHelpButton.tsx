import { Colors, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { ComponentProps, FC } from 'react';
import './DocumentationHelpButton.css';

type Props = {
    url: string;
    iconProps?: Partial<ComponentProps<typeof Icon>>;
    tooltipProps?: Partial<ComponentProps<typeof Tooltip2>>;
    anchorProps?: Partial<
        React.DetailedHTMLProps<
            React.AnchorHTMLAttributes<HTMLAnchorElement>,
            HTMLAnchorElement
        >
    >;
};

const DocumentationHelpButton: FC<Props> = ({
    url,
    iconProps,
    tooltipProps,
    anchorProps,
}) => (
    <Tooltip2
        content="Open documentation"
        className="documentation-help-button"
        position="top"
        {...tooltipProps}
    >
        <a
            role="button"
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ color: Colors.GRAY5 }}
            {...anchorProps}
        >
            <Icon icon="help" intent="none" iconSize={15} {...iconProps} />
        </a>
    </Tooltip2>
);

export default DocumentationHelpButton;
