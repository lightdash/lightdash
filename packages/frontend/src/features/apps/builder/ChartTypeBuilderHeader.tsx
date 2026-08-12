import {
    getAppDisplayName,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Popover,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconChevronLeft, IconFileDescription } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { getVersionAuthorName } from '../utils/versionsToChatMessages';
import classes from './ChartTypeBuilderHeader.module.css';
import VersionProvenance from './VersionProvenance';

const InlineNameInput: FC<{
    initialName: string;
    onSave: (name: string) => void;
}> = ({ initialName, onSave }) => {
    const [name, setName] = useState(initialName);
    const submit = () => {
        const trimmed = name.trim();
        if (trimmed && trimmed !== initialName) onSave(trimmed);
        else setName(initialName);
    };
    return (
        <TextInput
            classNames={{ input: classes.nameInput }}
            aria-label="Chart type name"
            value={name}
            w={280}
            onChange={(e) => setName(e.currentTarget.value)}
            onBlur={submit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
            }}
        />
    );
};

const DescriptionPopover: FC<{
    initialDescription: string;
    onSave: (description: string) => void;
}> = ({ initialDescription, onSave }) => {
    const [description, setDescription] = useState(initialDescription);
    return (
        <Popover width={320} position="bottom-start" withArrow>
            <Popover.Target>
                <Tooltip withArrow label="Edit description">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="Edit description"
                    >
                        <MantineIcon icon={IconFileDescription} />
                    </ActionIcon>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
                <Textarea
                    label="Description"
                    size="xs"
                    rows={3}
                    placeholder="What this chart type shows and expects"
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                    onBlur={() => {
                        if (description.trim() !== initialDescription.trim()) {
                            onSave(description.trim());
                        }
                    }}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

type Props = {
    projectUuid: string;
    /** Null while no app exists yet (create flow before the first build). */
    app: { appUuid: string; name: string; description: string } | null;
    latestReadyVersion: number | null;
    /** The version the provenance line reports; null while history is empty. */
    provenanceVersion: ApiAppVersionSummary | null;
    /** Whether `provenanceVersion` really is the origin (v1 is loaded). */
    hasOrigin: boolean;
    onSaveMeta: (patch: { name?: string; description?: string }) => void;
    onPreviewInExplorer: () => void;
};

const ChartTypeBuilderHeader: FC<Props> = ({
    projectUuid,
    app,
    latestReadyVersion,
    provenanceVersion,
    hasOrigin,
    onSaveMeta,
    onPreviewInExplorer,
}) => (
    <Box className={classes.header} component="header">
        <Box className={classes.side}>
            <Button
                component={Link}
                to={`/projects/${projectUuid}/gallery`}
                variant="subtle"
                size="compact-sm"
                leftSection={<MantineIcon icon={IconChevronLeft} />}
            >
                Gallery
            </Button>
            <Box className={classes.divider} />
            {app ? (
                <>
                    <InlineNameInput
                        key={`${app.appUuid}:${app.name}`}
                        initialName={getAppDisplayName(app.name, app.appUuid)}
                        onSave={(name) => onSaveMeta({ name })}
                    />
                    <DescriptionPopover
                        key={`${app.appUuid}:desc:${app.description}`}
                        initialDescription={app.description}
                        onSave={(description) => onSaveMeta({ description })}
                    />
                </>
            ) : (
                <TextInput
                    classNames={{ input: classes.nameInput }}
                    aria-label="Chart type name"
                    value="Untitled chart type"
                    w={280}
                    readOnly
                />
            )}
            {latestReadyVersion !== null && (
                <Badge size="sm" variant="light" color="violet">
                    {`v${latestReadyVersion}`}
                </Badge>
            )}
            {provenanceVersion && (
                <VersionProvenance
                    className={classes.provenance}
                    authorName={getVersionAuthorName(provenanceVersion)}
                    at={new Date(provenanceVersion.createdAt)}
                    isOrigin={hasOrigin}
                />
            )}
        </Box>
        {latestReadyVersion !== null && (
            <Button onClick={onPreviewInExplorer}>Preview in explorer</Button>
        )}
    </Box>
);

export default ChartTypeBuilderHeader;
