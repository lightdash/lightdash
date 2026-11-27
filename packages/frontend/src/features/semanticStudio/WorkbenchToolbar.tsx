import {
    isOpenWorkspace,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import { Box, Group, Menu, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useContext, type FC, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import MantineIcon from '../../components/common/MantineIcon';
import { ProtoSlotsContext } from './protoFlag';
import { DraftDevelopmentBar } from './SemanticLayerDraft';
import {
    type StudioPendingChange,
    type StudioPullRequest,
} from './studioChange';
import { DraftPickerMenu, StudioCheckoutPicker } from './StudioCheckoutPicker';
import { type StudioStage } from './studioStage';
import { StudioStageLine } from './StudioStageLine';
import { type DbtToolbarSelection } from './useDbtChangeSelection';
import {
    describeBranchCompile,
    useCompileCheckout,
} from './useSemanticLayerModel';
import { useCheckoutCompile } from './useStudioCheckout';
import classes from './WorkbenchView.module.css';
import { type Pane } from './workbenchWorkflows';

export type ToolbarProps = {
    projectUuid: string;
    pane: Pane;
    stage: StudioStage | null;
    changeUrl: string | null;
    canEditModels: boolean;
    development: StudioPullRequest | null;
    saving: StudioPendingChange | null;
    shownWorkspace: SemanticStudioWorkspace | null;
    myWorkspaces: SemanticStudioWorkspace[];
    changeName: string | undefined;
    changeLinks: ReactNode;
    /** The saving and review bars of a change made by pull request. */
    changeActions: ReactNode;
    onShowChanges: (() => void) | null;
    startNewThread: () => void;
    /** Read by the dbt toolbar only. */
    dbt: DbtToolbarSelection;
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
}> = ({ picker, stage, changeUrl, actions, children }) => {
    const slots = useContext(ProtoSlotsContext);
    const status = (
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
        </>
    );
    const end = (
        <Group gap="xs" wrap="nowrap" miw={0} ml="auto">
            {actions}
            {children}
        </Group>
    );
    // Prototype: with the bar gone, its halves render where the sidebar offers them
    if (slots) {
        return (
            <>
                {slots.status ? createPortal(status, slots.status) : null}
                {slots.actions ? createPortal(end, slots.actions) : null}
            </>
        );
    }
    return (
        <>
            {status}
            {end}
        </>
    );
};

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
            // Nothing is published before the first model, so there is nothing to switch between
            canEditModels && pane !== 'buildFirst' ? (
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
    development,
    saving,
    shownWorkspace,
    myWorkspaces,
    changeName,
    changeLinks,
    changeActions,
    onShowChanges,
    dbt: {
        isChangeInSources,
        isOnMyChange,
        sourcesPrUrl,
        sourcesChangeName,
        startNewChange,
        pickLive,
        pickChange,
    },
    children,
}) => {
    const compileAgain = useCompileCheckout(projectUuid);
    const myOpenChanges = myWorkspaces.filter(isOpenWorkspace);
    // The compile belongs to the server checkout, so it shows only on that draft.
    const branchCompile = useCheckoutCompile(
        projectUuid,
        isOnMyChange ? (shownWorkspace?.pullRequest?.url ?? null) : null,
    );
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
