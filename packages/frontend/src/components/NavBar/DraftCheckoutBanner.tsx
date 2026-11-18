import {
    assertUnreachable,
    type SemanticStudioBranchCompile,
    type SemanticStudioCheckout,
} from '@lightdash/common';
import { Anchor, Center, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconGitBranch } from '@tabler/icons-react';
import { type FC } from 'react';
import { useCompileCheckout } from '../../features/semanticStudio/useSemanticLayerModel';
import { useStudioWorkspaceAction } from '../../features/semanticStudio/useStudioWorkspaces';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './PreviewBanner.module.css';

const CompileState: FC<{
    projectUuid: string;
    compile: SemanticStudioBranchCompile;
}> = ({ projectUuid, compile }) => {
    const { mutate: compileAgain, isLoading } = useCompileCheckout(projectUuid);
    const { showToastApiError } = useToaster();
    switch (compile.status) {
        case 'ready':
            return null;
        case 'compiling':
            return (
                <Text c="white" fz="xs" truncate>
                    {compile.hasExplores
                        ? 'Compiling the latest edit.'
                        : 'Compiling. Published models show until it is ready.'}
                </Text>
            );
        case 'failed':
            return (
                <Group gap={6} wrap="nowrap" miw={0}>
                    <Tooltip
                        multiline
                        maw={480}
                        label={compile.error ?? 'The compile failed.'}
                    >
                        <Text c="white" fz="xs" truncate>
                            The latest compile failed.
                        </Text>
                    </Tooltip>
                    <Anchor
                        component="button"
                        type="button"
                        c="white"
                        fz="xs"
                        fw={600}
                        underline="always"
                        disabled={isLoading}
                        onClick={() =>
                            compileAgain(undefined, {
                                onError: ({ error }) =>
                                    showToastApiError({
                                        title: 'Could not compile again',
                                        apiError: error,
                                    }),
                            })
                        }
                        className={classes.backLink}
                    >
                        Compile again
                    </Anchor>
                </Group>
            );
        default:
            return assertUnreachable(compile.status, 'Unknown compile status');
    }
};

/** Says the whole app shows a checked-out draft, and goes back to what is published in one click. */
export const DraftCheckoutBanner: FC<{
    projectUuid: string;
    checkout: SemanticStudioCheckout;
}> = ({ projectUuid, checkout }) => {
    const { mutate, isLoading } = useStudioWorkspaceAction(projectUuid);
    const { showToastApiError } = useToaster();
    return (
        <Center
            id="draft-checkout-banner"
            pos="fixed"
            top={0}
            w="100%"
            h={BANNER_HEIGHT}
            bg="violet.7"
            className={classes.banner}
            px="md"
        >
            <Group gap="xs" wrap="nowrap" miw={0}>
                <MantineIcon icon={IconGitBranch} color="white" size="sm" />
                <Text c="white" fw={500} fz="xs" truncate>
                    Draft: {checkout.name}. Explore and dashboards show its
                    changes.
                </Text>
                {checkout.branchCompile ? (
                    <CompileState
                        projectUuid={projectUuid}
                        compile={checkout.branchCompile}
                    />
                ) : null}
                <Anchor
                    component="button"
                    type="button"
                    c="white"
                    fz="xs"
                    fw={600}
                    underline="always"
                    disabled={isLoading}
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
                    className={classes.backLink}
                >
                    <MantineIcon icon={IconArrowLeft} size="sm" />
                    Back to Published
                </Anchor>
            </Group>
        </Center>
    );
};
