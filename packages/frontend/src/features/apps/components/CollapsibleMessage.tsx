import { Box, UnstyledButton } from '@mantine/core';
import { useState, type FC, type ReactNode } from 'react';
import { collapseMarkdown } from '../utils/collapseMarkdown';
import classes from './BuildCards.module.css';

/** Long completion notes start collapsed to their opening blocks so the
 *  version card stays in view; cut at a block boundary, never mid-line. */
const CollapsibleMessage: FC<{
    text: string;
    render: (text: string) => ReactNode;
}> = ({ text, render }) => {
    const [expanded, setExpanded] = useState(false);
    const preview = collapseMarkdown(text);
    return (
        <Box className={classes.message}>
            {render(expanded || preview === null ? text : preview)}
            {preview !== null && (
                <UnstyledButton
                    className={classes.messageToggle}
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                >
                    {expanded ? 'Show less' : 'Show more'}
                </UnstyledButton>
            )}
        </Box>
    );
};

export default CollapsibleMessage;
