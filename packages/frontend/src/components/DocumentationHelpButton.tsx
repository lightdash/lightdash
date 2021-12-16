import { Colors, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { ComponentProps, FC } from 'react';
import './DocumentationHelpButton.css';

type Props = {
    url: string;
    iconProps?: Partial<ComponentProps<typeof Icon>>;
};

const DocumentationHelpButton: FC<Props> = ({ url, iconProps }) => (
    <Tooltip2
        content="Open documentation"
        className="documentation-help-button"
        position="top"
    >
        <a
            role="button"
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ color: Colors.GRAY5 }}
        >
            <Icon icon="help" intent="none" iconSize={15} {...iconProps} />
        </a>
    </Tooltip2>
);

export default DocumentationHelpButton;
