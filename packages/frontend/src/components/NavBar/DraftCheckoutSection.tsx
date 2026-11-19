import { type SemanticStudioCheckout } from '@lightdash/common';
import { Anchor, Box, Button, Group, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    describeBranchCompile,
    useCompileCheckout,
} from '../../features/semanticStudio/useSemanticLayerModel';
import { useStudioWorkspaceAction } from '../../features/semanticStudio/useStudioWorkspaces';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import classes from './ProjectSwitcher.module.css';

/** Says the whole app shows a checked-out draft, and goes back to what is published in one click. */
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
        <Box className={classes.draftSection}>
            <Group gap="xs" wrap="nowrap" align="flex-start">
                <Box className={classes.draftDot} mt={5} />
                <Box miw={0} flex={1}>
                    <Text fz="xs" fw={600}>
                        {checkout.name}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        You are on this draft. Explore and dashboards show its
                        changes, and only you see them.
                    </Text>
                    {compileState ? (
                        <Text fz="xs" c="dimmed" mt={4}>
                            {compileState}{' '}
                            {compile?.status === 'failed' ? (
                                <Anchor
                                    component="button"
                                    type="button"
                                    fz="xs"
                                    disabled={isCompiling}
                                    onClick={() => compileAgain()}
                                >
                                    Compile again
                                </Anchor>
                            ) : null}
                        </Text>
                    ) : null}
                </Box>
            </Group>
            <Button
                size="compact-xs"
                variant="default"
                mt="xs"
                ml={15}
                loading={isLoading}
                leftSection={<MantineIcon icon={IconArrowLeft} size={12} />}
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
                Back to Published
            </Button>
        </Box>
    );
};
