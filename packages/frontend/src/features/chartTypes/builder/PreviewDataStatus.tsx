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

    return (
        <Text fz="xs" c="dimmed">
            Nothing runs until you ask.
        </Text>
    );
};

export default PreviewDataStatus;
