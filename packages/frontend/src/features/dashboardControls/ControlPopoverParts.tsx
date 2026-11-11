import {
    ActionIcon,
    Box,
    Button,
    Group,
    Stack,
    Switch,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowLeft,
    IconEye,
    IconLayoutGrid,
    IconSettings,
} from '@tabler/icons-react';
import { useId, type FC, type ReactNode, type Ref } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import TruncatedText from '../../components/common/TruncatedText';
import classes from './FilterEditor.module.css';
import { focusOnMount } from './mappingFocus';

// The parameter popover's pieces, shared by the controls built like it

/** A setting's line and its caption, at the gap the filter's Required uses. */
export const CaptionedSetting: FC<{
    caption: string;
    captionId?: string;
    children: ReactNode;
}> = ({ caption, captionId, children }) => (
    <Stack gap="xs">
        {children}
        <Text id={captionId} size="xs" c="dimmed">
            {caption}
        </Text>
    </Stack>
);

/** Back, "Settings" and the control's name under it; Back takes focus. */
export const SettingsHeader: FC<{ name: string; onBack: () => void }> = ({
    name,
    onBack,
}) => (
    <Group gap="xs" wrap="nowrap">
        <Tooltip fz="xs" label="Back">
            <ActionIcon
                size="sm"
                aria-label="Back"
                ref={focusOnMount}
                onClick={onBack}
            >
                <MantineIcon icon={IconArrowLeft} />
            </ActionIcon>
        </Tooltip>
        <Box miw={0}>
            <Title order={6} lh="sm">
                Settings
            </Title>
            <TruncatedText maxWidth="100%" fz="xs" c="dimmed">
                {name}
            </TruncatedText>
        </Box>
    </Group>
);

/** "Show to viewers", with what still happens while hidden. */
export const ShowToViewersSetting: FC<{
    hidden: boolean;
    description: string;
    onChange: (hidden: boolean) => void;
}> = ({ hidden, description, onChange }) => {
    const id = useId();
    return (
        <CaptionedSetting caption={description} captionId={`${id}-description`}>
            <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <MantineIcon icon={IconEye} size="sm" color="ldGray.6" />
                    <Text component="label" htmlFor={id} size="xs" fw={600}>
                        Show to viewers
                    </Text>
                </Group>
                <Switch
                    id={id}
                    size="xs"
                    checked={!hidden}
                    aria-describedby={`${id}-description`}
                    onChange={({ currentTarget }) =>
                        onChange(!currentTarget.checked)
                    }
                />
            </Group>
        </CaptionedSetting>
    );
};

/** The tiles a control reaches; with `onChooseTiles`, a button that maps them. */
export const TilesChip: FC<{
    label: string;
    chooseTiles: string;
    onChooseTiles: (() => void) | null;
}> = ({ label, chooseTiles, onChooseTiles }) =>
    onChooseTiles === null ? (
        <Group gap={6} wrap="nowrap" mih={24} px={6}>
            <MantineIcon icon={IconLayoutGrid} size={14} color="dimmed" />
            <Text span fz="xs" c="dimmed">
                {label}
            </Text>
        </Group>
    ) : (
        <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            mih={24}
            flex="0 0 auto"
            aria-label={`${label}. ${chooseTiles}`}
            leftSection={<MantineIcon icon={IconLayoutGrid} size={14} />}
            onClick={onChooseTiles}
        >
            <Text span fz="xs">
                <Text span fz="xs" c="dimmed">
                    {label}
                </Text>
                {` · ${chooseTiles}`}
            </Text>
        </Button>
    );

/** "Settings", and its summary after a dot when there is one. */
export const SettingsChip: FC<{
    summary: string | null;
    chipRef: Ref<HTMLButtonElement>;
    onClick: () => void;
}> = ({ summary, chipRef, onClick }) => (
    <Button
        ref={chipRef}
        variant="subtle"
        color="gray"
        size="compact-xs"
        miw={0}
        mih={24}
        classNames={{
            root: classes.wrappingChip,
            label: classes.wrappingChipLabel,
        }}
        leftSection={<MantineIcon icon={IconSettings} size={14} />}
        aria-label={summary === null ? 'Settings' : `Settings: ${summary}`}
        onClick={onClick}
    >
        <Text span fz="xs">
            Settings
            {summary !== null && (
                <Text span fz="xs" c="dimmed">
                    {` · ${summary}`}
                </Text>
            )}
        </Text>
    </Button>
);
