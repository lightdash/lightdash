import { ActionIcon, Button, Loader, Text } from '@mantine/core';
import { IconRefresh, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    type PreviewDataSelection,
    type PreviewFitState,
    type PreviewRunState,
} from './previewDataTypes';

type Props = {
    selection: PreviewDataSelection;
    run: PreviewRunState;
    fit: PreviewFitState;
    /** The version on screen declares inputs, so real data can be bound. */
    hasDeclaredInputs: boolean;
    /** The inputs on screen come from the last session, unrun. */
    isRemembered: boolean;
    /** Asks Chart Studio to find the data; null without Ambient AI. */
    onSuggestFields: (() => void) | null;
    isSuggestingFields: boolean;
    onOpenDataMenu: () => void;
    onRefresh: () => void;
};

/**
 * What the data strip says beyond its badge: how the last run went, and the
 * one control that changes it.
 */
const PreviewDataStatus: FC<Props> = ({
    selection,
    run,
    fit,
    hasDeclaredInputs,
    isRemembered,
    onSuggestFields,
    isSuggestingFields,
    onOpenDataMenu,
    onRefresh,
}) => {
    if (selection.kind === 'sample') {
        if (!hasDeclaredInputs) return null;
        return (
            <>
                {onSuggestFields && (
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="indigo"
                        leftSection={
                            <MantineIcon icon={IconSparkles} size={12} />
                        }
                        loading={isSuggestingFields}
                        onClick={onSuggestFields}
                    >
                        Suggest data
                    </Button>
                )}
                <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={onOpenDataMenu}
                >
                    Preview on real data
                </Button>
            </>
        );
    }

    if (run.status === 'running') {
        return (
            <>
                <Loader size={12} color="ldGray.6" />
                <Text fz="xs" c="dimmed">
                    Running your query…
                </Text>
            </>
        );
    }

    if (run.status === 'error') {
        return (
            <Text fz="xs" c="red" lineClamp={1}>
                {run.message}
            </Text>
        );
    }

    // The strip's own label already carries these; adding to it would repeat.
    if (fit.status === 'doesNotFit' || fit.status === 'unavailable') {
        return null;
    }

    if (run.status === 'ready') {
        return (
            <ActionIcon
                size="sm"
                aria-label="Refresh results"
                onClick={onRefresh}
            >
                <MantineIcon icon={IconRefresh} size={14} />
            </ActionIcon>
        );
    }

    // The strip's own label already says nothing runs unasked; this is the
    // ask. Named apart from the panel's own Run query.
    if (isRemembered) {
        return (
            <Button
                size="compact-xs"
                variant="default"
                aria-label="Run the remembered query"
                onClick={onRefresh}
            >
                Run query
            </Button>
        );
    }

    return (
        <Text fz="xs" c="dimmed">
            Nothing runs until you ask.
        </Text>
    );
};

export default PreviewDataStatus;
