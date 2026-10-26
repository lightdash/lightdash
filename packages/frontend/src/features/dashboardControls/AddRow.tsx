import { ActionIcon, Box, Button, Text, UnstyledButton } from '@mantine/core';
import { IconFilter, IconSection, IconPlus, IconX } from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './ControlSidebar.module.css';

type Props = {
    /** Null while no filter can be added. */
    onAddFilter: (() => void) | null;
    /** Null for a viewer, whose rail has no sections. */
    onNewSection: (() => void) | null;
};

// The list's last row. An editor's reads "+ Add" and opens in place into
// "Add", a Filter and a Section button and an X; a viewer's adds a filter at
// once. Folded, it carries `data-controls-new-section`, so focus falls back
// to it after a remove or a dropped new section
export const AddRow: FC<Props> = ({ onAddFilter, onNewSection }) => {
    const getUiString = useUiStrings();
    const [isOpen, setIsOpen] = useState(false);
    const openRef = useRef<HTMLDivElement>(null);
    const rowRef = useRef<HTMLButtonElement>(null);
    const filterRef = useRef<HTMLButtonElement>(null);
    // Escape and the X fold it with focus back on the row; focus or a click
    // leaving it folds it quietly
    const refocusRow = useRef(false);
    const fold = (withFocus: boolean) => {
        refocusRow.current = withFocus;
        setIsOpen(false);
    };
    useLayoutEffect(() => {
        if (isOpen) {
            filterRef.current?.focus();
            return;
        }
        if (!refocusRow.current) return;
        refocusRow.current = false;
        rowRef.current?.focus();
    }, [isOpen]);
    useEffect(() => {
        if (!isOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (
                event.target instanceof Node &&
                !openRef.current?.contains(event.target)
            )
                setIsOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [isOpen]);

    if (onAddFilter === null && onNewSection === null) return null;
    if (onNewSection === null)
        return (
            <UnstyledButton
                className={classes.addRow}
                data-controls-new-section
                onClick={onAddFilter ?? undefined}
            >
                <MantineIcon icon={IconPlus} size={14} />
                <Text fz="xs" fw={500} inherit>
                    {getUiString('filters.addFilter')}
                </Text>
            </UnstyledButton>
        );
    if (!isOpen)
        return (
            <UnstyledButton
                ref={rowRef}
                className={classes.addRow}
                aria-expanded={false}
                data-controls-new-section
                onClick={() => setIsOpen(true)}
            >
                <MantineIcon icon={IconPlus} size={14} />
                <Text fz="xs" fw={500} inherit>
                    {getUiString('filters.rail.add')}
                </Text>
            </UnstyledButton>
        );
    return (
        <Box
            ref={openRef}
            className={classes.addRowOpen}
            data-own-escape
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                fold(true);
            }}
            onBlur={(event) => {
                if (
                    event.relatedTarget instanceof Node &&
                    event.currentTarget.contains(event.relatedTarget)
                )
                    return;
                fold(false);
            }}
        >
            <Text fz="xs" c="dimmed">
                {getUiString('filters.rail.add')}
            </Text>
            {onAddFilter && (
                <Button
                    ref={filterRef}
                    size="xs"
                    variant="default"
                    className={classes.addRowChoice}
                    leftSection={<MantineIcon icon={IconFilter} size={14} />}
                    onClick={onAddFilter}
                >
                    {getUiString('filters.rail.filterNoun')}
                </Button>
            )}
            <Button
                ref={onAddFilter ? undefined : filterRef}
                size="xs"
                variant="default"
                className={classes.addRowChoice}
                leftSection={<MantineIcon icon={IconSection} size={14} />}
                onClick={onNewSection}
            >
                {getUiString('filters.rail.sectionNoun')}
            </Button>
            <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                ml="auto"
                // "Close" is the rail's X; this one gives the row up
                aria-label={getUiString('filters.actions.cancel')}
                onClick={() => fold(true)}
            >
                <MantineIcon icon={IconX} size={14} />
            </ActionIcon>
        </Box>
    );
};
