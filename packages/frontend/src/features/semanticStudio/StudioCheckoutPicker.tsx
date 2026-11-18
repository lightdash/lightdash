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
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import {
    isOpenWorkspace,
    useCheckOut,
    useStudioCheckout,
} from './useStudioCheckout';
import { useStudioWorkspaces } from './useStudioWorkspaces';
import classes from './WorkbenchView.module.css';

/** Which of your changes Models and Code show, or Live. */
export const StudioCheckoutPicker: FC<{
    projectUuid: string;
    onShowChanges: (() => void) | null;
}> = ({ projectUuid, onShowChanges }) => {
    const { shown, error } = useStudioCheckout();
    const { data: workspaces } = useStudioWorkspaces(projectUuid);
    const { checkOut, createChange, isBusy, isError } =
        useCheckOut(projectUuid);
    const current = shown?.workspace ?? null;
    const label = current?.name ?? 'Live';
    const mine = (workspaces?.mine ?? []).filter(isOpenWorkspace);
    const announcement = isBusy
        ? 'Checking out'
        : isError
          ? 'Could not check out'
          : `${label} is checked out`;
    return (
        <>
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
                        leftSection={
                            current ? (
                                <MantineIcon icon={IconGitBranch} size={14} />
                            ) : (
                                <Box
                                    component="span"
                                    className={classes.liveDot}
                                />
                            )
                        }
                        rightSection={
                            <Group gap={6} wrap="nowrap">
                                {isBusy ? (
                                    <Loader size={12} color="gray" />
                                ) : error ? (
                                    <MantineIcon
                                        icon={IconAlertTriangle}
                                        size={14}
                                        color="yellow"
                                        aria-label="This change could not be loaded"
                                    />
                                ) : null}
                                <MantineIcon icon={IconChevronDown} size={12} />
                            </Group>
                        }
                    >
                        <Text span inherit truncate>
                            {label}
                        </Text>
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={
                            <Box component="span" className={classes.liveDot} />
                        }
                        rightSection={
                            current ? null : (
                                <MantineIcon icon={IconCheck} size={14} />
                            )
                        }
                        aria-current={current ? undefined : true}
                        disabled={isBusy}
                        onClick={() => checkOut(null)}
                    >
                        Live
                    </Menu.Item>
                    {mine.length > 0 ? (
                        <Menu.Label>Your changes</Menu.Label>
                    ) : null}
                    {mine.map((target) => {
                        const isCurrent =
                            target.workspaceUuid === current?.workspaceUuid;
                        return (
                            <Menu.Item
                                key={target.workspaceUuid}
                                leftSection={
                                    <MantineIcon
                                        icon={IconGitBranch}
                                        size={14}
                                    />
                                }
                                rightSection={
                                    isCurrent ? (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size={14}
                                        />
                                    ) : null
                                }
                                aria-current={isCurrent || undefined}
                                disabled={isBusy}
                                onClick={() => checkOut(target)}
                                title={target.name}
                            >
                                <Text span inherit truncate>
                                    {target.name}
                                </Text>
                            </Menu.Item>
                        );
                    })}
                    <Menu.Divider />
                    {onShowChanges ? (
                        <Menu.Item onClick={onShowChanges}>
                            All changes
                        </Menu.Item>
                    ) : null}
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPlus} size={14} />}
                        disabled={isBusy}
                        onClick={createChange}
                    >
                        New change
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            <VisuallyHidden role="status" aria-live="polite">
                {announcement}
            </VisuallyHidden>
        </>
    );
};
