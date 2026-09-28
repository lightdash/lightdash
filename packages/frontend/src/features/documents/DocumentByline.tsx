import { type Document } from '@lightdash/common';
import { Group, Text } from '@mantine/core';
import { type ReactNode } from 'react';
import { LightdashUserAvatar } from '../../components/Avatar';
import { UpdatedInfo } from '../../components/common/PageHeader/UpdatedInfo';

/** Original creator beside an independent last-edited time; never attributes the edit to the creator. */
const DocumentByline = ({
    document,
    status,
}: {
    document: Document;
    /** A short marker shown after the timestamp, e.g. the editing state. */
    status?: ReactNode;
}) => {
    const creatorName = document.createdBy
        ? `${document.createdBy.firstName} ${document.createdBy.lastName}`.trim() ||
          'Unknown user'
        : null;
    return (
        <Group gap="xs" wrap="nowrap">
            {document.createdBy && (
                <>
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        role="group"
                        aria-label="Created by"
                    >
                        <LightdashUserAvatar
                            userUuid={document.createdBy.userUuid}
                            avatarUrl={document.createdBy.avatarUrl}
                            avatarGradient={document.createdBy.avatarGradient}
                            name={creatorName ?? undefined}
                            size="sm"
                            aria-hidden
                        />
                        <Text fz="xs" fw={500} c="dimmed">
                            {creatorName}
                        </Text>
                    </Group>
                    <Text fz="xs" c="dimmed" aria-hidden>
                        ·
                    </Text>
                </>
            )}
            <UpdatedInfo
                updatedAt={document.updatedAt}
                user={null}
                partiallyBold={false}
            />
            {status && (
                <>
                    <Text fz="xs" c="dimmed" aria-hidden>
                        ·
                    </Text>
                    {status}
                </>
            )}
        </Group>
    );
};

export default DocumentByline;
