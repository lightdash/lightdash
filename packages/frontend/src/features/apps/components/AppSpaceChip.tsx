import { Badge, Tooltip } from '@mantine-8/core';
import { IconFolder, IconFolderPlus, IconUser } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useCanEditDataApp } from '../hooks/useCanEditDataApp';
import classes from './AppSpaceChip.module.css';
import {
    MoveAppToSpaceModal,
    type DataAppMoveTarget,
} from './MoveAppToSpaceModal';

type Props = {
    projectUuid: string;
    app: DataAppMoveTarget;
    spaceName: string | null;
};

const MAX_CHIP_WIDTH_PX = 180;

/**
 * Header chip telling you which space a data app lives in. When the app is
 * filed it links to that space; when it's personal (no space) it offers
 * editors "Add to space" and shows read-only viewers a quiet "Personal" label.
 * Shared by the builder and the viewer via {@link AppHeader}.
 */
const AppSpaceChip: FC<Props> = ({ projectUuid, app, spaceName }) => {
    const canEdit = useCanEditDataApp(projectUuid, {
        spaceUuid: app.spaceUuid,
        createdByUserUuid: app.createdByUserUuid,
    });
    const [moveModalOpen, setMoveModalOpen] = useState(false);

    // Filed in a space → a chip linking to that space.
    if (app.spaceUuid) {
        return (
            <Tooltip
                withinPortal
                position="bottom"
                label={`Space: ${spaceName ?? 'Unknown'}`}
            >
                <Badge
                    component={Link}
                    to={`/projects/${projectUuid}/spaces/${app.spaceUuid}`}
                    variant="light"
                    color="gray"
                    size="md"
                    tt="none"
                    maw={MAX_CHIP_WIDTH_PX}
                    className={`${classes.chip} ${classes.clickable}`}
                    leftSection={<MantineIcon icon={IconFolder} size={12} />}
                >
                    {spaceName ?? 'Space'}
                </Badge>
            </Tooltip>
        );
    }

    // Personal (no space) + read-only viewer → quiet, non-interactive label.
    if (!canEdit) {
        return (
            <Tooltip
                withinPortal
                position="bottom"
                label="This app isn't in a space"
            >
                <Badge
                    variant="light"
                    color="gray"
                    size="md"
                    tt="none"
                    className={classes.chip}
                    leftSection={<MantineIcon icon={IconUser} size={12} />}
                >
                    Personal
                </Badge>
            </Tooltip>
        );
    }

    // Personal (no space) + editor → CTA to file it.
    return (
        <>
            <Tooltip
                withinPortal
                multiline
                maw={260}
                position="bottom"
                label="Add the data app to a space to share it with others."
            >
                <Badge
                    component="button"
                    type="button"
                    variant="light"
                    color="gray"
                    size="md"
                    tt="none"
                    className={`${classes.chip} ${classes.clickable}`}
                    leftSection={
                        <MantineIcon icon={IconFolderPlus} size={12} />
                    }
                    onClick={() => setMoveModalOpen(true)}
                >
                    Add to space
                </Badge>
            </Tooltip>
            {moveModalOpen && (
                <MoveAppToSpaceModal
                    projectUuid={projectUuid}
                    app={app}
                    opened
                    onClose={() => setMoveModalOpen(false)}
                />
            )}
        </>
    );
};

export default AppSpaceChip;
