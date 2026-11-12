import { Box, Tooltip, UnstyledButton } from '@mantine/core';
import { useClickOutside, useDisclosure } from '@mantine/hooks';
import {
    IconArrowUpRight,
    IconChevronUp,
    IconTable,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { useStudioPullRequest } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useStudioPullRequest';
import { useDevelopmentView } from '../../features/semanticStudio/developmentView';
import { useModelsInDevelopment } from '../../features/semanticStudio/useModelsInDevelopment';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import MantineIcon from '../common/MantineIcon';
import classes from './DevelopmentViewIsland.module.css';

/** How many changed models the panel lists before it says how many are left. */
const LISTED = 6;

/** What the person's changes touch, each a way into Explore, and the way back to where they are reviewed. */
const ChangesPanel: FC<{
    projectUuid: string;
    /** The project as the address bar names it. */
    project: string;
    isInStudio: boolean;
    onNavigate: () => void;
}> = ({ projectUuid, project, isInStudio, onNavigate }) => {
    const drafted = useModelsInDevelopment(projectUuid);
    const pullRequest = useStudioPullRequest(projectUuid);
    const openPullRequest = pullRequest?.isOpen ? pullRequest : null;
    const models = openPullRequest
        ? openPullRequest.changedModels
        : [...drafted].sort();
    const number = /\/(\d+)\/?$/.exec(openPullRequest?.prUrl ?? '')?.[1];
    return (
        <>
            <Box className={classes.heading}>
                {openPullRequest
                    ? `In pull request${number ? ` #${number}` : ''}`
                    : 'In your draft'}
            </Box>
            {models.slice(0, LISTED).map((model) => (
                <UnstyledButton
                    key={model}
                    component={Link}
                    to={`/projects/${project}/tables/${encodeURIComponent(model)}`}
                    className={classes.row}
                    onClick={onNavigate}
                >
                    <MantineIcon icon={IconTable} size={14} />
                    <Box className={classes.rowLabel}>{model}</Box>
                    <Box className={classes.rowHint}>Explore</Box>
                </UnstyledButton>
            ))}
            {models.length > LISTED ? (
                <Box className={classes.heading}>
                    and {models.length - LISTED} more
                </Box>
            ) : null}
            {models.length === 0 ? (
                <Box className={classes.heading}>No changed models found</Box>
            ) : null}
            {isInStudio ? null : (
                <UnstyledButton
                    component={Link}
                    to={`/projects/${project}/semantic-layer`}
                    className={classes.row}
                    data-footer
                    onClick={onNavigate}
                >
                    <MantineIcon icon={IconArrowUpRight} size={14} />
                    <Box className={classes.rowLabel}>Review changes</Box>
                </UnstyledButton>
            )}
        </>
    );
};

/** Floats over every page while queries read the person's unpublished models, so a number is never mistaken for a live one; opens upward to show what changed. */
export const DevelopmentViewIsland = () => {
    const [, setIsOn] = useDevelopmentView();
    const projectRoute = useOptionalProjectRoute();
    const [isOpen, { toggle, close }] = useDisclosure(false);
    const ref = useClickOutside(close);
    const { pathname } = window.location;
    const project = /\/projects\/([^/]+)/.exec(pathname)?.[1];
    const projectUuid = projectRoute?.projectUuid;
    return (
        <Box
            ref={ref}
            className={classes.island}
            data-open={isOpen || undefined}
            onKeyDown={(event) => {
                if (event.key === 'Escape') close();
            }}
        >
            <Box className={classes.panel} id="my-changes-panel">
                <Box className={classes.panelInner} inert={!isOpen}>
                    {project && projectUuid ? (
                        <ChangesPanel
                            projectUuid={projectUuid}
                            project={project}
                            isInStudio={pathname.includes('/semantic-layer')}
                            onNavigate={close}
                        />
                    ) : null}
                </Box>
            </Box>
            <Box className={classes.bar}>
                <UnstyledButton
                    className={classes.state}
                    aria-expanded={isOpen}
                    aria-controls="my-changes-panel"
                    onClick={toggle}
                >
                    <Box className={classes.pulse} />
                    Viewing my changes
                    <MantineIcon
                        icon={IconChevronUp}
                        size={12}
                        className={classes.chevron}
                    />
                </UnstyledButton>
                <Tooltip
                    multiline
                    w={260}
                    position="top"
                    disabled={isOpen}
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
        </Box>
    );
};
