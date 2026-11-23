import {
    isOpenWorkspace,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { Box, Group, Menu, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { DraftDevelopmentBar } from './SemanticLayerDraft';
import {
    type StudioPendingChange,
    type StudioPullRequest,
} from './studioChange';
import { DraftPickerMenu, StudioCheckoutPicker } from './StudioCheckoutPicker';
import { type StudioStage } from './studioStage';
import { StudioStageLine } from './StudioStageLine';
import {
    describeBranchCompile,
    useCompileCheckout,
    useDraftCheckout,
} from './useSemanticLayerModel';
import classes from './WorkbenchView.module.css';
import { type Pane } from './workbenchWorkflows';

export type ToolbarProps = {
    projectUuid: string;
    pane: Pane;
    stage: StudioStage | null;
    changeUrl: string | null;
    canEditModels: boolean;
    isChangeInSources: boolean;
    isOnMyChange: boolean;
    development: StudioPullRequest | null;
    saving: StudioPendingChange | null;
    shownWorkspace: SemanticStudioWorkspace | null;
    myWorkspaces: SemanticStudioWorkspace[];
    sourcesPrUrl: string | null;
    sourcesChangeName: string | null;
    changeName: string | undefined;
    changeLinks: ReactNode;
    /** The saving and review bars of a change made by pull request. */
    changeActions: ReactNode;
    onShowChanges: (() => void) | null;
    startNewThread: () => void;
    startNewChange: () => void;
    pickLive: () => void;
    pickChange: (workspace: SemanticStudioWorkspace) => void;
    /** The bar's own buttons, after the change's. */
    children: ReactNode;
};

const ToolbarLayout: FC<{
    picker: ReactNode;
    /** The stage beside the picker, when the workflow shows it there. */
    stage: StudioStage | null;
    changeUrl: string | null;
    actions: ReactNode;
    children: ReactNode;
}> = ({ picker, stage, changeUrl, actions, children }) => (
    <>
        {picker ? (
            <Group
                gap="xs"
                wrap="nowrap"
                miw={0}
                className={classes.toolbarChange}
            >
                {picker}
                {stage ? (
                    <StudioStageLine stage={stage} href={changeUrl} />
                ) : null}
            </Group>
        ) : null}
        <Group gap="xs" wrap="nowrap" miw={0} ml="auto">
            {actions}
            {children}
        </Group>
    </>
);

export const DraftToolbar: FC<ToolbarProps> = ({
    projectUuid,
    pane,
    stage,
    changeUrl,
    canEditModels,
    changeLinks,
    onShowChanges,
    startNewThread,
    children,
}) => (
    <ToolbarLayout
        picker={
            canEditModels ? (
                <StudioCheckoutPicker
                    projectUuid={projectUuid}
                    onShowChanges={onShowChanges}
                />
            ) : null
        }
        // The bar says how an open draft is doing, so the pill shows only once it ends.
        stage={stage && stage.step !== 'proposed' ? stage : null}
        changeUrl={changeUrl}
        actions={
            // A checked-out draft keeps its actions on every tab; a draft's own page carries them in its header.
            pane !== 'changeSummary' && pane !== 'workspaces' ? (
                <>
                    {changeLinks}
                    <Group gap="xs" wrap="nowrap" miw={0} ml="auto">
                        <DraftDevelopmentBar
                            projectUuid={projectUuid}
                            onDiscarded={startNewThread}
                        />
                    </Group>
                </>
            ) : null
        }
    >
        {children}
    </ToolbarLayout>
);

export const DbtToolbar: FC<ToolbarProps> = ({
    projectUuid,
    pane,
    stage,
    changeUrl,
    isChangeInSources,
    isOnMyChange,
    development,
    saving,
    shownWorkspace,
    myWorkspaces,
    sourcesPrUrl,
    sourcesChangeName,
    changeName,
    changeLinks,
    changeActions,
    onShowChanges,
    startNewChange,
    pickLive,
    pickChange,
    children,
}) => {
    const { data: draftCheckout } = useDraftCheckout(projectUuid);
    const compileAgain = useCompileCheckout(projectUuid);
    const myOpenChanges = myWorkspaces.filter(isOpenWorkspace);
    // The compile belongs to the server checkout, so it shows only on that draft.
    const branchCompile =
        isOnMyChange &&
        draftCheckout?.workspaceUuid === shownWorkspace?.workspaceUuid
            ? (draftCheckout?.branchCompile ?? null)
            : null;
    const compileDescription = branchCompile
        ? describeBranchCompile(branchCompile)
        : null;
    const showsChangeActions =
        isChangeInSources ||
        (pane !== 'changes' &&
            pane !== 'workspaces' &&
            isOnMyChange &&
            (!!development || !!saving));
    return (
        <ToolbarLayout
            picker={
                <DraftPickerMenu
                    currentName={
                        sourcesChangeName ??
                        (isOnMyChange ? (changeName ?? 'New draft') : null)
                    }
                    drafts={myOpenChanges.map((target) => ({
                        id: target.workspaceUuid,
                        name: target.name,
                        isCurrent:
                            !!sourcesPrUrl &&
                            sourcesPrUrl === target.pullRequest?.url,
                        updatedAt: target.updatedAt,
                    }))}
                    isBusy={false}
                    isEnded={stage?.step === 'live' || stage?.step === 'closed'}
                    status={null}
                    header={
                        branchCompile && compileDescription ? (
                            <>
                                <Box px="sm" py={6}>
                                    <Text fz="xs" fw={500}>
                                        {compileDescription}
                                    </Text>
                                    {branchCompile.error ? (
                                        <Text
                                            fz="xs"
                                            c="dimmed"
                                            lineClamp={3}
                                            title={branchCompile.error}
                                        >
                                            {branchCompile.error}
                                        </Text>
                                    ) : null}
                                </Box>
                                {branchCompile.status === 'failed' ? (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconRefresh}
                                                size={14}
                                            />
                                        }
                                        disabled={compileAgain.isLoading}
                                        onClick={() => compileAgain.mutate()}
                                    >
                                        Compile again
                                    </Menu.Item>
                                ) : null}
                            </>
                        ) : null
                    }
                    onPublished={pickLive}
                    onPick={(id) => {
                        const target = myOpenChanges.find(
                            ({ workspaceUuid }) => workspaceUuid === id,
                        );
                        if (target) pickChange(target);
                    }}
                    onNew={startNewChange}
                    onShowAll={onShowChanges}
                />
            }
            stage={
                stage &&
                isChangeInSources &&
                stage.step !== 'in_review' &&
                stage.step !== 'saving'
                    ? stage
                    : null
            }
            changeUrl={changeUrl}
            actions={
                showsChangeActions ? (
                    <>
                        {changeLinks}
                        {changeActions}
                    </>
                ) : null
            }
        >
            {children}
        </ToolbarLayout>
    );
};
