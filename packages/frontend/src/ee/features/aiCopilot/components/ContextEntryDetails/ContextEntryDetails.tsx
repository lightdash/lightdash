import {
    assertUnreachable,
    type AiProjectContextEntry,
    type AiProjectContextTypedObjectRef,
} from '@lightdash/common';
import {
    Accordion,
    Anchor,
    Badge,
    Box,
    Divider,
    Group,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconExternalLink,
    IconFileDescription,
    IconHistory,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import Callout from '../../../../../components/common/Callout';
import MantineModal from '../../../../../components/common/MantineModal';
import { getContextEntryTitle } from '../../utils/contextEntry';
import styles from './ContextEntryDetails.module.css';

type ContextEntryDetailsProps = {
    entry: AiProjectContextEntry;
    projectUuid: string;
};

const getKindLabel = (kind: AiProjectContextEntry['kind']) => {
    switch (kind) {
        case 'definition':
            return 'Definition';
        case 'context':
            return 'Context';
        default:
            return assertUnreachable(kind, 'Unknown context entry kind');
    }
};

const getObjectLabel = (object: AiProjectContextTypedObjectRef) =>
    object.type === 'explore' ? object.name : object.fieldId;

const getObjectExplore = (object: AiProjectContextTypedObjectRef) =>
    object.type === 'explore' ? object.name : object.explore;

const RailRow: FC<{ label: ReactNode; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group className={styles.railRow} wrap="nowrap" gap="sm">
        <Box className={styles.railLabel}>{label}</Box>
        <Box className={styles.railValue}>{children}</Box>
    </Group>
);

const ContextEntryDetails: FC<ContextEntryDetailsProps> = ({
    entry,
    projectUuid,
}) => (
    <Box className={styles.layout}>
        <Stack className={styles.main} gap={0}>
            {entry.status === 'removed' ? (
                <Callout
                    mb="xl"
                    color="gray"
                    variant="info"
                    title="This entry is no longer in the project context"
                    icon={<IconHistory size={17} />}
                    classNames={{
                        title: styles.statusCalloutText,
                        message: styles.statusCalloutText,
                    }}
                >
                    It has since been edited or removed from the project context
                    file.
                </Callout>
            ) : null}

            <Stack gap="md">
                <Text className={styles.sectionLabel}>
                    {getKindLabel(entry.kind)}
                </Text>
                <AiMarkdown className={styles.content}>
                    {entry.content}
                </AiMarkdown>
            </Stack>

            {entry.apply ? (
                <Accordion
                    multiple
                    defaultValue={[]}
                    className={styles.disclosures}
                    classNames={{
                        item: styles.disclosureItem,
                        control: styles.disclosureControl,
                        label: styles.disclosureLabel,
                        chevron: styles.disclosureChevron,
                        content: styles.disclosureContent,
                    }}
                >
                    <Accordion.Item value="apply">
                        <Accordion.Control>
                            <Box>
                                <Text className={styles.disclosureTitle}>
                                    Apply
                                </Text>
                                <Text className={styles.disclosureDescription}>
                                    When and how to use it
                                </Text>
                            </Box>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <AiMarkdown className={styles.disclosureMarkdown}>
                                {entry.apply}
                            </AiMarkdown>
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            ) : null}
        </Stack>

        <Divider orientation="vertical" className={styles.divider} />

        <Stack className={styles.rail} gap={0}>
            <RailRow label="Status">
                <Group gap={6} wrap="nowrap">
                    <Box
                        className={styles.statusDot}
                        data-status={entry.status}
                    />
                    <Text className={styles.railText}>{entry.status}</Text>
                </Group>
            </RailRow>
            <RailRow label="Added">
                <Text className={styles.railText}>
                    {new Date(entry.generatedAt).toLocaleDateString()}
                </Text>
            </RailRow>
            <RailRow label="Citations">
                <Text className={styles.railText}>
                    {entry.citedCount.toLocaleString()}
                </Text>
            </RailRow>
            <RailRow label="Slug">
                <Text className={styles.slug} lineClamp={2}>
                    {entry.slug}
                </Text>
            </RailRow>

            <Stack gap="sm" className={styles.railSection}>
                <Text className={styles.sectionLabel}>Terms</Text>
                {entry.terms.length > 0 ? (
                    <Group gap={6}>
                        {entry.terms.map((term) => (
                            <Badge
                                key={term}
                                variant="light"
                                color="gray"
                                tt="none"
                                size="sm"
                            >
                                {term}
                            </Badge>
                        ))}
                    </Group>
                ) : (
                    <Text size="xs" c="dimmed">
                        No retrieval terms
                    </Text>
                )}
            </Stack>

            <Stack gap="sm" className={styles.railSection}>
                <Text className={styles.sectionLabel}>Catalog objects</Text>
                {entry.objects.length > 0 ? (
                    <Stack gap={8}>
                        {entry.objects.map((object) =>
                            typeof object === 'string' ? (
                                <Text
                                    key={`ref-${object}`}
                                    size="xs"
                                    fw={550}
                                    lineClamp={1}
                                >
                                    {object}
                                </Text>
                            ) : (
                                <Anchor
                                    key={`${object.type}-${getObjectExplore(object)}-${getObjectLabel(object)}`}
                                    component={Link}
                                    to={`/projects/${projectUuid}/tables/${encodeURIComponent(getObjectExplore(object))}`}
                                    className={styles.objectLink}
                                >
                                    <Box miw={0}>
                                        <Text size="xs" fw={550} lineClamp={1}>
                                            {getObjectLabel(object)}
                                        </Text>
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            lineClamp={1}
                                        >
                                            {object.type === 'field'
                                                ? `Field in ${getObjectExplore(object)}`
                                                : 'Explore'}
                                        </Text>
                                    </Box>
                                    <IconExternalLink
                                        size={13}
                                        className={styles.objectLinkIcon}
                                    />
                                </Anchor>
                            ),
                        )}
                    </Stack>
                ) : (
                    <Text size="xs" c="dimmed">
                        No catalog objects
                    </Text>
                )}
            </Stack>
        </Stack>
    </Box>
);

type ContextEntryDetailsModalProps = ContextEntryDetailsProps & {
    opened: boolean;
    onClose: () => void;
};

export const ContextEntryDetailsModal: FC<ContextEntryDetailsModalProps> = ({
    opened,
    onClose,
    entry,
    projectUuid,
}) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        size="72rem"
        icon={IconFileDescription}
        title={getContextEntryTitle(entry)}
        cancelLabel={false}
        modalBodyProps={{ px: 0, py: 0 }}
        bodyScrollAreaMaxHeight="calc(85vh - 120px)"
    >
        <ContextEntryDetails entry={entry} projectUuid={projectUuid} />
    </MantineModal>
);
