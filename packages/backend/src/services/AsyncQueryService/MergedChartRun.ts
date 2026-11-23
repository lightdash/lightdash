import {
    ForbiddenError,
    type Account,
    type SavedChartDAO,
} from '@lightdash/common';

/** Server-only proof a merge runs the saved merge definition of a chart the server loaded; its sources' SQL was checked at save. */
export class MergedChartRun {
    private constructor(
        private readonly userUuid: string,
        readonly projectUuid: string,
        readonly savedChartUuid: string,
    ) {}

    /** Call only after the viewer was authorized to view `savedChart`. */
    static fromLoadedChart({
        account,
        savedChart,
    }: {
        account: Account;
        savedChart: Pick<SavedChartDAO, 'uuid' | 'projectUuid'>;
    }): MergedChartRun {
        return new MergedChartRun(
            account.user.id,
            savedChart.projectUuid,
            savedChart.uuid,
        );
    }

    /** Refuses a run carried into another account's or project's execution. */
    assertExecution(account: Account, projectUuid: string): void {
        if (
            account.user.id !== this.userUuid ||
            projectUuid !== this.projectUuid
        ) {
            throw new ForbiddenError(
                'Merged chart run does not match this execution',
            );
        }
    }
}
