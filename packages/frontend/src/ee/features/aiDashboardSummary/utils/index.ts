import { assertUnreachable, DashboardSummaryTone } from '@lightdash/common';

export function getToneEmoji(tone: DashboardSummaryTone): string {
    switch (tone) {
        case DashboardSummaryTone.FRIENDLY:
            return '😊';
        case DashboardSummaryTone.FORMAL:
            return '👔';
        case DashboardSummaryTone.DIRECT:
            return '🎯';
        case DashboardSummaryTone.ENTHUSIASTIC:
            return '🎉';
        default:
            return assertUnreachable(tone, `Unexpected tone: ${tone}`);
    }
}
