import { Colors, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { FC } from 'react';
import './DocumentationHelpButton.css';

type Props = {
    url: string;
};

const DocumentationHelpButton: FC<Props> = ({ url }) => (
    <Tooltip2
        content="Open documentation"
        className="documentation-help-button"
    >
        <a
            role="button"
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ color: Colors.GRAY3 }}
        >
            <Icon icon="help" intent="none" iconSize={15} />
        </a>
    </Tooltip2>
);

export default DocumentationHelpButton;
