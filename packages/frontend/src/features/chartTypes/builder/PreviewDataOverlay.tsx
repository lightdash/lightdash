import {
    assertUnreachable,
    getItemLabelWithoutTableName,
    type ItemsMap,
} from '@lightdash/common';
import { Button, Group, Stack, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    chartTypeFitDetail,
    chartTypeFitHeadline,
    type ChartTypeFitIssue,
} from '../utils/chartTypePreviewFit';
import classes from './PreviewDataOverlay.module.css';

/** Why the selected data cannot draw the chart. */
export type PreviewDataOverlayReason =
    | { kind: 'doesNotFit'; issues: ChartTypeFitIssue[]; itemsMap: ItemsMap }
    | { kind: 'unavailable'; message: string };

const overlayCopy = (
    reason: PreviewDataOverlayReason,
): { title: string; detail: string } => {
    switch (reason.kind) {
        case 'doesNotFit': {
            const [first] = reason.issues;
            if (!first) {
                return {
                    title: 'This data does not fit the chart yet',
                    detail: 'Fix the inputs on the right, or keep designing on sample data.',
                };
            }
            const mapped = first.mapped
                ? reason.itemsMap[first.mapped.fieldId]
                : null;
            return {
                title: 'This data does not fit the chart yet',
                detail: `${chartTypeFitHeadline(first)} ${chartTypeFitDetail(
                    first,
                    mapped ? getItemLabelWithoutTableName(mapped) : null,
                )} Fix the input on the right, or keep designing on sample data.`,
            };
        }
        case 'unavailable':
            return {
                title: 'This data cannot be read',
                detail: `${reason.message} Pick different data, or keep designing on sample data.`,
            };
        default:
            return assertUnreachable(reason, 'Unknown preview overlay reason');
    }
};

/**
 * Sits over the preview when the selected data cannot draw the chart. The
 * chart underneath keeps rendering on sample data, so nothing reloads while
 * the author fixes the binding.
 */
const PreviewDataOverlay: FC<{
    reason: PreviewDataOverlayReason;
    /** Asks Chart Studio for a field that fits the input that does not; null
     *  without Ambient AI, or while a suggestion round owns the binding. */
    onSuggestInput: ((fieldName: string) => void) | null;
    onUseSampleData: () => void;
}> = ({ reason, onSuggestInput, onUseSampleData }) => {
    const { title, detail } = overlayCopy(reason);
    const unfitting = reason.kind === 'doesNotFit' ? reason.issues[0] : null;

    return (
        <Stack className={classes.overlay} gap="xs" align="center">
            <Text size="md" fw={600} c="ldGray.8">
                {title}
            </Text>
            <Text fz="xs" c="dimmed" maw={420} ta="center" lh={1.5}>
                {detail}
            </Text>
            <Group gap="xs">
                {onSuggestInput && unfitting && (
                    <Button
                        size="xs"
                        variant="light"
                        color="indigo"
                        leftSection={
                            <MantineIcon icon={IconSparkles} size={14} />
                        }
                        onClick={() => onSuggestInput(unfitting.fieldName)}
                    >
                        {`Suggest a ${unfitting.expects}`}
                    </Button>
                )}
                <Button size="xs" variant="default" onClick={onUseSampleData}>
                    Preview on sample data
                </Button>
            </Group>
        </Stack>
    );
};

export default PreviewDataOverlay;
