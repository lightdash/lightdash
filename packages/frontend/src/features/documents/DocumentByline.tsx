import { type Document } from '@lightdash/common';
import { Badge, Group, Text, Tooltip } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LightdashUserAvatar } from '../../components/Avatar';
import MantineIcon from '../../components/common/MantineIcon';
import { UpdatedInfo } from '../../components/common/PageHeader/UpdatedInfo';

/** Original creator and assigned owner beside an independent last-edited time; never attributes the edit to the creator. */
const DocumentByline = ({
    document,
    status,
}: {
    document: Document;
    /** A short marker shown after the timestamp, e.g. the editing state. */
    status?: ReactNode;
}) => {
    const { t } = useTranslation('documents');
    const creatorName = document.createdBy
        ? `${document.createdBy.firstName} ${document.createdBy.lastName}`.trim() ||
          t('byline.unknownUser')
        : null;
    const ownerName = document.owner
        ? `${document.owner.firstName} ${document.owner.lastName}`.trim() ||
          document.owner.email ||
          t('byline.unknownUser')
        : null;
    return (
        <Group
            gap="xs"
            wrap="nowrap"
            // Walkthrough: read a document, a look before the jump. See
            // scripts/scope-tours.
            data-tour-scope="view:Document"
            data-tour-look="1"
            data-tour-after='[data-tour-anchor="document-row"][data-tour-value="Monthly orders review"]'
            data-tour-label="See who wrote it and when"
            data-tour-docs="explore/documents.mdx#read-a-document:3"
        >
            {document.spaceUuid === null && (
                <Tooltip label={t('byline.personalTooltip')}>
                    <Badge
                        size="sm"
                        leftSection={<MantineIcon icon={IconLock} size={12} />}
                    >
                        {t('byline.personal')}
                    </Badge>
                </Tooltip>
            )}
            {document.createdBy && (
                <>
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        role="group"
                        aria-label={t('byline.createdBy')}
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
            {ownerName && (
                <>
                    <Text fz="xs" c="dimmed">
                        {t('byline.ownedBy', { name: ownerName })}
                    </Text>
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
