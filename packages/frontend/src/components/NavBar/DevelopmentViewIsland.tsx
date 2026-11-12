import { Box, Tooltip, UnstyledButton } from '@mantine/core';
import { useDevelopmentView } from '../../features/semanticStudio/developmentView';
import classes from './DevelopmentViewIsland.module.css';

/** Floats over every page while queries read the person's unpublished models, so a number is never mistaken for a live one. */
export const DevelopmentViewIsland = () => {
    const [, setIsOn] = useDevelopmentView();
    return (
        <Box className={classes.island} role="status">
            <Tooltip
                multiline
                w={260}
                position="top"
                label="You are viewing this project with your unpublished changes. Nobody else sees them, and charts and dashboards cannot be saved in this view."
            >
                <Box className={classes.state}>
                    <Box className={classes.pulse} />
                    Viewing my changes
                </Box>
            </Tooltip>
            <UnstyledButton
                className={classes.exit}
                onClick={() => setIsOn(false)}
            >
                Back to live
            </UnstyledButton>
        </Box>
    );
};
