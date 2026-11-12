import { Box, Tooltip, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';
import { useDevelopmentView } from '../../features/semanticStudio/developmentView';
import classes from './DevelopmentViewIsland.module.css';

/** Floats over every page while queries read the person's unpublished models, so a number is never mistaken for a live one. */
export const DevelopmentViewIsland = () => {
    const [, setIsOn] = useDevelopmentView();
    const { pathname } = window.location;
    const project = /\/projects\/([^/]+)/.exec(pathname)?.[1];
    // Studio is where the changes are listed; no link to it from itself.
    const studioPath =
        project && !pathname.includes('/semantic-layer')
            ? `/projects/${project}/semantic-layer`
            : null;
    return (
        <Box className={classes.island}>
            <Box className={classes.state} role="status">
                <Box className={classes.pulse} />
                Viewing my changes
            </Box>
            {studioPath ? (
                <UnstyledButton
                    component={Link}
                    to={studioPath}
                    className={classes.link}
                >
                    See changes
                </UnstyledButton>
            ) : null}
            <Tooltip
                multiline
                w={260}
                position="top"
                label="You are viewing this project with your unpublished changes. Nobody else sees them, and charts and dashboards cannot be saved in this view."
            >
                <UnstyledButton
                    className={classes.exit}
                    onClick={() => setIsOn(false)}
                >
                    Switch to live
                </UnstyledButton>
            </Tooltip>
        </Box>
    );
};
