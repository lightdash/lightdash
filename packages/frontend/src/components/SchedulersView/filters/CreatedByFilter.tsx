import {
    Badge,
    Button,
    Checkbox,
    Popover,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { type FC } from 'react';
import classes from './FormatFilter.module.css';

type User = {
    userUuid: string;
    name: string;
};

interface CreatedByFilterProps {
    availableUsers: User[];
    selectedCreatedByUserUuids: string[];
    setSelectedCreatedByUserUuids: (userUuids: string[]) => void;
}

const CreatedByFilter: FC<CreatedByFilterProps> = ({
    availableUsers,
    selectedCreatedByUserUuids,
    setSelectedCreatedByUserUuids,
}) => {
    const hasSelectedUsers = selectedCreatedByUserUuids.length > 0;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label="Filter by user who created the scheduler"
                >
                    <Button
                        h={32}
                        c="foreground"
                        fw={500}
                        fz="sm"
                        variant="default"
                        radius="md"
                        px="sm"
                        className={
                            hasSelectedUsers
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        classNames={{
                            label: classes.buttonLabel,
                        }}
                        rightSection={
                            hasSelectedUsers ? (
                                <Badge
                                    size="xs"
                                    variant="filled"
                                    color="indigo.6"
                                    circle
                                    styles={{
                                        root: {
                                            minWidth: 18,
                                            height: 18,
                                            padding: '0 4px',
                                        },
                                    }}
                                >
                                    {selectedCreatedByUserUuids.length}
                                </Badge>
                            ) : null
                        }
                    >
                        Creator
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldGray.9" fw={600}>
                        Filter by created by:
                    </Text>

                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Stack gap="xs">
                            {availableUsers.map((user) => (
                                <Checkbox
                                    key={user.userUuid}
                                    label={user.name}
                                    checked={selectedCreatedByUserUuids.includes(
                                        user.userUuid,
                                    )}
                                    size="xs"
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={() => {
                                        if (
                                            selectedCreatedByUserUuids.includes(
                                                user.userUuid,
                                            )
                                        ) {
                                            setSelectedCreatedByUserUuids(
                                                selectedCreatedByUserUuids.filter(
                                                    (uuid) =>
                                                        uuid !== user.userUuid,
                                                ),
                                            );
                                        } else {
                                            setSelectedCreatedByUserUuids([
                                                ...selectedCreatedByUserUuids,
                                                user.userUuid,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default CreatedByFilter;
