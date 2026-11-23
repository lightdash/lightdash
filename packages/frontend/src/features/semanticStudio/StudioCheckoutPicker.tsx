import {
    Box,
    Button,
    Group,
    Loader,
    Menu,
    Text,
    UnstyledButton,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconChevronDown,
    IconPlus,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import {
    isOpenWorkspace,
    useCheckOut,
    useStudioCheckout,
} from './useStudioCheckout';
import { useStudioWorkspaces } from './useStudioWorkspaces';
import classes from './WorkbenchView.module.css';

dayjs.extend(relativeTime);

type PickerDraft = {
    id: string;
    name: string;
    isCurrent: boolean;
    /** When it was last changed, as a date. */
    updatedAt: Date;
};

/** One line of the menu: a dot for what it is, its name, and when a draft last changed. */
const PickerRow: FC<{
    kind: 'published' | 'draft';
    name: string;
    updatedAt: Date | null;
}> = ({ kind, name, updatedAt }) => (
    <Group gap="sm" wrap="nowrap">
        <Box component="span" className={classes.pickerDot} data-kind={kind} />
        <Text fz="xs" truncate flex={1} miw={0}>
            {name}
        </Text>
        {updatedAt ? (
            <Text fz="xs" c="dimmed" flex="none">
                {dayjs(updatedAt).fromNow(true)}
            </Text>
        ) : null}
    </Group>
);

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
    /** A merged or closed draft is no longer a draft, so the trigger drops its draft dot. */
    isEnded?: boolean;
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
    isEnded = false,
    onPublished,
    onPick,
    onNew,
    onShowAll,
}) => {
    // The trigger already says where you are, so the menu lists only where you can go.
    const others = drafts.filter(({ isCurrent }) => !isCurrent);
    return (
        <Menu
            position="bottom-start"
            width={300}
            classNames={{
                item: classes.pickerItem,
                itemLabel: classes.pickerLabel,
            }}
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
                        currentName === null
                            ? 'Published'
                            : `Draft: ${currentName}`
                    }
                    leftSection={
                        isEnded ? null : (
                            <Box
                                component="span"
                                className={classes.pickerDot}
                                data-kind={
                                    currentName === null ? 'published' : 'draft'
                                }
                            />
                        )
                    }
                    rightSection={
                        <Group gap={6} wrap="nowrap">
                            {isBusy ? (
                                <Loader size={12} color="gray" />
                            ) : (
                                status
                            )}
                            <MantineIcon icon={IconChevronDown} size={12} />
                        </Group>
                    }
                >
                    <Text span inherit truncate lh={1.4}>
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
                {currentName === null ? null : (
                    <Menu.Item disabled={isBusy} onClick={onPublished}>
                        <PickerRow
                            kind="published"
                            name="Back to Published"
                            updatedAt={null}
                        />
                    </Menu.Item>
                )}
                {others.length > 0 ? (
                    <Group
                        justify="space-between"
                        wrap="nowrap"
                        className={classes.pickerSection}
                    >
                        <Text fz="xs" c="dimmed">
                            Your drafts
                        </Text>
                        {onShowAll ? (
                            <UnstyledButton
                                className={classes.pickerLink}
                                onClick={onShowAll}
                            >
                                View all
                            </UnstyledButton>
                        ) : null}
                    </Group>
                ) : null}
                {others.map((draft) => (
                    <Menu.Item
                        key={draft.id}
                        disabled={isBusy}
                        onClick={() => onPick(draft.id)}
                        title={draft.name}
                    >
                        <PickerRow
                            kind="draft"
                            name={draft.name}
                            updatedAt={draft.updatedAt}
                        />
                    </Menu.Item>
                ))}
                {currentName !== null || others.length > 0 ? (
                    <Menu.Divider />
                ) : null}
                <Menu.Item
                    fz="xs"
                    leftSection={<MantineIcon icon={IconPlus} size={14} />}
                    disabled={isBusy}
                    onClick={onNew}
                >
                    New draft
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

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
                    updatedAt: target.updatedAt,
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
