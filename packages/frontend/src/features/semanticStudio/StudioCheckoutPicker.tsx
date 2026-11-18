import {
    Box,
    Button,
    Group,
    Loader,
    Menu,
    Text,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconChevronDown,
    IconGitBranch,
    IconPlus,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import {
    isOpenWorkspace,
    useCheckOut,
    useStudioCheckout,
} from './useStudioCheckout';
import { useStudioWorkspaces } from './useStudioWorkspaces';
import classes from './WorkbenchView.module.css';

type PickerDraft = { id: string; name: string; isCurrent: boolean };

/** The one menu that says where you are, Published or a draft, and takes you to another. */
export const DraftPickerMenu: FC<{
    /** The draft shown, or null on Published. */
    currentName: string | null;
    drafts: PickerDraft[];
    isBusy: boolean;
    /** What the trigger shows beside its label: a count, or a warning. */
    status: ReactNode;
    /** How the checked-out draft is doing, above the list. */
    header: ReactNode;
    onPublished: () => void;
    onPick: (id: string) => void;
    onNew: () => void;
    onShowAll: (() => void) | null;
}> = ({
    currentName,
    drafts,
    isBusy,
    status,
    header,
    onPublished,
    onPick,
    onNew,
    onShowAll,
}) => (
    <Menu
        position="bottom-start"
        width={260}
        classNames={{ itemLabel: classes.pickerLabel }}
    >
        <Menu.Target>
            <Button
                size="xs"
                variant="subtle"
                color="gray"
                flex="0 1 auto"
                miw={0}
                maw={420}
                className={classes.pickerTitle}
                aria-busy={isBusy}
                aria-label={
                    currentName === null ? 'Published' : `Draft: ${currentName}`
                }
                leftSection={
                    currentName === null ? (
                        <Box component="span" className={classes.liveDot} />
                    ) : (
                        <MantineIcon icon={IconGitBranch} size={14} />
                    )
                }
                rightSection={
                    <Group gap={6} wrap="nowrap">
                        {isBusy ? <Loader size={12} color="gray" /> : status}
                        <MantineIcon icon={IconChevronDown} size={12} />
                    </Group>
                }
            >
                <Text span inherit truncate>
                    {currentName ?? 'Published'}
                </Text>
            </Button>
        </Menu.Target>
        <Menu.Dropdown>
            {header ? (
                <>
                    {header}
                    <Menu.Divider />
                </>
            ) : null}
            <Menu.Item
                leftSection={
                    <Box component="span" className={classes.liveDot} />
                }
                rightSection={
                    currentName === null ? (
                        <MantineIcon icon={IconCheck} size={14} />
                    ) : null
                }
                aria-current={currentName === null ? true : undefined}
                disabled={isBusy}
                onClick={onPublished}
            >
                Published
            </Menu.Item>
            {drafts.length > 0 ? <Menu.Label>Your drafts</Menu.Label> : null}
            {drafts.map((draft) => (
                <Menu.Item
                    key={draft.id}
                    leftSection={<MantineIcon icon={IconGitBranch} size={14} />}
                    rightSection={
                        draft.isCurrent ? (
                            <MantineIcon icon={IconCheck} size={14} />
                        ) : null
                    }
                    aria-current={draft.isCurrent || undefined}
                    disabled={isBusy}
                    onClick={() => onPick(draft.id)}
                    title={draft.name}
                >
                    <Text span inherit truncate>
                        {draft.name}
                    </Text>
                </Menu.Item>
            ))}
            <Menu.Divider />
            {onShowAll ? (
                <Menu.Item onClick={onShowAll}>All drafts</Menu.Item>
            ) : null}
            <Menu.Item
                leftSection={<MantineIcon icon={IconPlus} size={14} />}
                disabled={isBusy}
                onClick={onNew}
            >
                New draft
            </Menu.Item>
        </Menu.Dropdown>
    </Menu>
);

/** Which of your drafts Models and Code show, or Published. */
export const StudioCheckoutPicker: FC<{
    projectUuid: string;
    onShowChanges: (() => void) | null;
}> = ({ projectUuid, onShowChanges }) => {
    const { shown, error } = useStudioCheckout();
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const { checkOut, createChange, isBusy, isError } =
        useCheckOut(projectUuid);
    const current = shown?.workspace ?? null;
    const mine = (workspaces?.mine ?? []).filter(isOpenWorkspace);
    const announcement = isBusy
        ? 'Checking out'
        : isError
          ? 'Could not check out'
          : `${current ? `Draft: ${current.name}` : 'Published'} is checked out`;
    return (
        <>
            <DraftPickerMenu
                currentName={current?.name ?? null}
                drafts={mine.map((target) => ({
                    id: target.workspaceUuid,
                    name: target.name,
                    isCurrent: target.workspaceUuid === current?.workspaceUuid,
                }))}
                isBusy={isBusy}
                status={
                    error ? (
                        <MantineIcon
                            icon={IconAlertTriangle}
                            size={14}
                            color="yellow"
                            aria-label="This draft could not be loaded"
                        />
                    ) : null
                }
                header={null}
                onPublished={() => checkOut(null)}
                onPick={(id) => {
                    const target = mine.find(
                        ({ workspaceUuid }) => workspaceUuid === id,
                    );
                    if (target) checkOut(target);
                }}
                onNew={createChange}
                onShowAll={onShowChanges}
            />
            <VisuallyHidden role="status" aria-live="polite">
                {announcement}
            </VisuallyHidden>
        </>
    );
};
