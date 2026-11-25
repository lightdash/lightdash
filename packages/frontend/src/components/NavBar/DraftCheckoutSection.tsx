import { type SemanticStudioCheckout } from '@lightdash/common';
import { Button, Group, Menu, Text, Tooltip } from '@mantine/core';
import { IconArrowRight, IconGitBranch } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { getSemanticStudioUrl } from '../../features/semanticStudio/urls';
import {
    describeBranchCompile,
    useCompileCheckout,
} from '../../features/semanticStudio/useSemanticLayerModel';
import { useStudioWorkspaceAction } from '../../features/semanticStudio/useStudioWorkspaces';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import classes from './ProjectSwitcher.module.css';

/** The checked-out draft: click to open it in Semantic Layer, or leave it for Published. */
export const DraftCheckoutSection: FC<{
    projectUuid: string;
    checkout: SemanticStudioCheckout;
}> = ({ projectUuid, checkout }) => {
    const { mutate, isLoading } = useStudioWorkspaceAction(projectUuid);
    const { mutate: compileAgain, isLoading: isCompiling } =
        useCompileCheckout(projectUuid);
    const { showToastApiError } = useToaster();
    const compile = checkout.branchCompile;
    const compileState = compile ? describeBranchCompile(compile) : null;
    return (
        <Group className={classes.draftSection} gap={4} wrap="nowrap">
            <Menu.Item
                component={Link}
                to={getSemanticStudioUrl(projectUuid, { ref: null })}
                title={`View ${checkout.name}`}
                leftSection={
                    <MantineIcon icon={IconGitBranch} color="yellow.5" />
                }
                rightSection={
                    <MantineIcon
                        icon={IconArrowRight}
                        className={classes.draftOpenArrow}
                    />
                }
                flex={1}
                miw={0}
            >
                <Text fz="xs" fw={500} truncate>
                    {checkout.name}
                </Text>
                {compileState ? (
                    <Text fz={11} c="dimmed" truncate>
                        {compileState}
                    </Text>
                ) : null}
            </Menu.Item>
            {compile?.status === 'failed' ? (
                <Button
                    size="compact-xs"
                    variant="subtle"
                    flex="none"
                    loading={isCompiling}
                    onClick={() => compileAgain()}
                >
                    Retry
                </Button>
            ) : null}
            <Tooltip label="Back to Published" withinPortal={false}>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    flex="none"
                    loading={isLoading}
                    onClick={() =>
                        mutate(
                            { kind: 'leave' },
                            {
                                onError: ({ error }) =>
                                    showToastApiError({
                                        title: 'Could not go back to Published',
                                        apiError: error,
                                    }),
                            },
                        )
                    }
                >
                    Leave
                </Button>
            </Tooltip>
        </Group>
    );
};
