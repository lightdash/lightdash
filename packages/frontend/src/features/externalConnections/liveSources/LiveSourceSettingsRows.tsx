/**
 * The rows a live data source's settings are made of: a label and a short
 * hint on the left, a control on the right, grouped in titled cards. Adding a
 * source and changing its settings use the same ones.
 */
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, type Icon as TablerIcon } from '@tabler/icons-react';
import { type FC, type FormEvent, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import classes from './LiveSourceSettingsRows.module.css';

/** A label and a short hint on the left, its control on the right. */
export const SettingsRow: FC<{
    label: ReactNode;
    hint?: ReactNode;
    children: ReactNode;
    /** Dims the label and hint, such as for an explore that is switched off. */
    dimmed?: boolean;
}> = ({ label, hint, children, dimmed }) => (
    <Box className={classes.settingsRow}>
        <Box miw={0} opacity={dimmed ? 0.5 : undefined}>
            <span className={classes.settingsLabel}>{label}</span>
            {hint ? <Box className={classes.settingsHint}>{hint}</Box> : null}
        </Box>
        <Group gap="xs" wrap="nowrap" justify="flex-end" flex="none">
            {children}
        </Group>
    </Box>
);

/** A setting as read, in place of its control. */
export const SettingsValue: FC<{
    children: ReactNode;
    isEmpty?: boolean;
    /** A measured number, set with digits that line up. */
    isNumber?: boolean;
}> = ({ children, isEmpty, isNumber }) => (
    <Text
        className={classes.settingsValue}
        c={isEmpty ? 'dimmed' : undefined}
        data-number={(isNumber && !isEmpty) || undefined}
    >
        {children}
    </Text>
);

/** A raised card, one row per setting, under an optional title. */
export const SettingsCard: FC<{
    title?: string;
    /** More about the card, behind an info icon after its title. */
    titleInfo?: string;
    /**
     * Puts the title above the card as a quiet label, for cards stacked in a
     * dialog, where a header inside each would read as one more row.
     */
    titleOutside?: boolean;
    /** Marks a card whose actions can't be undone. */
    tone?: 'danger';
    /** Makes the card a form whose rows save together. */
    onSubmit?: (event: FormEvent) => void;
    /** Puts Edit in the card's header, for a card that reads until it is used. */
    edit?: {
        isEditing: boolean;
        onEdit: () => void;
        /** What Edit edits, for a card whose title is outside it. */
        label?: string;
    };
    children: ReactNode;
}> = ({ title, titleInfo, titleOutside, tone, onSubmit, edit, children }) => {
    if (title && titleOutside) {
        return (
            <Stack gap={6}>
                <span className={classes.settingsOutsideTitle}>{title}</span>
                <Box className={classes.settings}>{children}</Box>
            </Stack>
        );
    }
    const header = title ? (
        <Box className={classes.settingsHeader}>
            <span className={classes.settingsTitle}>
                {title}
                {titleInfo ? (
                    <Tooltip
                        label={titleInfo}
                        multiline
                        maw={320}
                        withinPortal
                        events={{ hover: true, focus: true, touch: true }}
                    >
                        <ActionIcon size="xs" aria-label={titleInfo}>
                            <MantineIcon
                                icon={IconInfoCircle}
                                size={14}
                                color="dimmed"
                            />
                        </ActionIcon>
                    </Tooltip>
                ) : null}
            </span>
            {/* Cancel and Save take this place once it is used */}
            {edit && !edit.isEditing ? (
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    aria-label={`Edit ${edit.label ?? title}`}
                    onClick={edit.onEdit}
                >
                    Edit
                </Button>
            ) : null}
        </Box>
    ) : null;
    return onSubmit ? (
        <form
            className={classes.settings}
            data-tone={tone}
            onSubmit={onSubmit}
            noValidate
        >
            {header}
            {children}
        </form>
    ) : (
        <Box className={classes.settings} data-tone={tone}>
            {header}
            {children}
        </Box>
    );
};

/**
 * A card that only reads: Edit opens its rows as fields in a dialog, saved
 * or cancelled there, so the page itself never changes shape.
 */
export const EditableSettingsCard: FC<{
    title: string;
    /** Heads the dialog, beside its title. */
    icon: TablerIcon;
    titleInfo?: string;
    /** False leaves out Edit, such as when there is nothing to change. */
    canEdit?: boolean;
    isEditing: boolean;
    onEdit: () => void;
    onCancel: () => void;
    /** Omitted for a dialog with nothing to save, which only closes. */
    onSave?: () => void;
    isChanged?: boolean;
    isValid?: boolean;
    isSaving?: boolean;
    /** The card's rows, as read on the page or as fields in the dialog. */
    children: (isEditing: boolean) => ReactNode;
}> = ({
    title,
    icon,
    titleInfo,
    canEdit = true,
    isEditing,
    onEdit,
    onCancel,
    onSave,
    isChanged = false,
    isValid = true,
    isSaving = false,
    children,
}) => (
    <>
        <SettingsCard
            title={title}
            titleInfo={titleInfo}
            edit={canEdit ? { isEditing: false, onEdit } : undefined}
        >
            {children(false)}
        </SettingsCard>
        <MantineModal
            opened={isEditing}
            onClose={onCancel}
            title={`Edit ${title.toLowerCase()}`}
            icon={icon}
            // As wide as the dialogs that add a source
            size="xl"
            cancelLabel={onSave ? 'Cancel' : 'Done'}
            confirmLabel="Save changes"
            confirmDisabled={!isChanged || !isValid}
            confirmLoading={isSaving}
            onConfirm={onSave}
        >
            {isEditing ? (
                <Box className={classes.dialogRows}>{children(true)}</Box>
            ) : null}
        </MantineModal>
    </>
);
