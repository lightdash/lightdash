import { randomUUID } from 'node:crypto';
import { getActiveSpanId } from '../tracing/tracing';
import { VERSION } from '../version';

export const omnibarSearchTimingPhases = [
    'projectSummary',
    'searchModel',
    'spaceAccess',
    'contentAccess',
    'userAttributes',
    'dataAppAccess',
    'resultAssembly',
    'spaces',
    'contentGroup',
    'dashboards',
    'savedCharts',
    'sqlCharts',
    'dashboardTabs',
    'dataAppsSearch',
    'exploreSelection',
    'exploreRows',
    'exploreFilter',
    'tableErrors',
    'tablesFields',
    'pages',
] as const;

export type OmnibarSearchTimingPhase =
    (typeof omnibarSearchTimingPhases)[number];

type PhaseState =
    | { status: 'skipped' }
    | { status: 'running'; startedAt: number }
    | { status: 'complete' | 'error'; durationMs: number };

export type OmnibarSearchTimingSnapshot = Readonly<{
    event: 'omnibar.search.timing';
    invocationId: string;
    spanId: string | null;
    source: 'omnibar';
    serverVersion: string;
    outcome: 'success' | 'error';
    verifiedOnly: boolean;
    totalServiceMs: number;
    phaseDurationsMs: Readonly<Record<OmnibarSearchTimingPhase, number | null>>;
    phaseStatuses: Readonly<
        Record<
            OmnibarSearchTimingPhase,
            'skipped' | 'complete' | 'error' | 'incomplete'
        >
    >;
}>;

type OmnibarSearchTimingOptions = {
    verifiedOnly?: boolean;
    now?: () => number;
    invocationId?: string;
    spanId?: string | null;
};

export class OmnibarSearchTiming {
    private readonly now: () => number;

    private readonly startedAt: number;

    private readonly invocationId: string;

    private readonly spanId: string | null;

    private readonly verifiedOnly: boolean;

    private readonly phases: Record<OmnibarSearchTimingPhase, PhaseState>;

    constructor({
        verifiedOnly = false,
        now = () => performance.now(),
        invocationId = randomUUID(),
        spanId = getActiveSpanId() ?? null,
    }: OmnibarSearchTimingOptions = {}) {
        this.now = now;
        this.startedAt = now();
        this.invocationId = invocationId;
        this.spanId = spanId;
        this.verifiedOnly = verifiedOnly;
        this.phases = Object.fromEntries(
            omnibarSearchTimingPhases.map((phase) => [
                phase,
                { status: 'skipped' },
            ]),
        ) as Record<OmnibarSearchTimingPhase, PhaseState>;
    }

    async time<T>(
        phase: OmnibarSearchTimingPhase,
        operation: () => PromiseLike<T>,
    ): Promise<T> {
        const startedAt = this.now();
        this.phases[phase] = { status: 'running', startedAt };
        try {
            const result = await operation();
            this.phases[phase] = {
                status: 'complete',
                durationMs: this.now() - startedAt,
            };
            return result;
        } catch (error) {
            this.phases[phase] = {
                status: 'error',
                durationMs: this.now() - startedAt,
            };
            throw error;
        }
    }

    timeSync<T>(phase: OmnibarSearchTimingPhase, operation: () => T): T {
        const startedAt = this.now();
        this.phases[phase] = { status: 'running', startedAt };
        try {
            const result = operation();
            this.phases[phase] = {
                status: 'complete',
                durationMs: this.now() - startedAt,
            };
            return result;
        } catch (error) {
            this.phases[phase] = {
                status: 'error',
                durationMs: this.now() - startedAt,
            };
            throw error;
        }
    }

    snapshot(
        outcome: OmnibarSearchTimingSnapshot['outcome'],
    ): OmnibarSearchTimingSnapshot {
        const phaseDurationsMs = Object.fromEntries(
            omnibarSearchTimingPhases.map((phase) => {
                const state = this.phases[phase];
                return [
                    phase,
                    state.status === 'complete' || state.status === 'error'
                        ? state.durationMs
                        : null,
                ];
            }),
        ) as Record<OmnibarSearchTimingPhase, number | null>;
        const phaseStatuses = Object.fromEntries(
            omnibarSearchTimingPhases.map((phase) => {
                const { status } = this.phases[phase];
                return [phase, status === 'running' ? 'incomplete' : status];
            }),
        ) as OmnibarSearchTimingSnapshot['phaseStatuses'];

        return Object.freeze({
            event: 'omnibar.search.timing',
            invocationId: this.invocationId,
            spanId: this.spanId,
            source: 'omnibar',
            serverVersion: String(VERSION),
            outcome,
            verifiedOnly: this.verifiedOnly,
            totalServiceMs: this.now() - this.startedAt,
            phaseDurationsMs: Object.freeze(phaseDurationsMs),
            phaseStatuses: Object.freeze(phaseStatuses),
        });
    }
}

export const timeOmnibarSearch = <T>(
    timing: OmnibarSearchTiming | undefined,
    phase: OmnibarSearchTimingPhase,
    operation: () => PromiseLike<T>,
): PromiseLike<T> => (timing ? timing.time(phase, operation) : operation());

export const timeOmnibarSearchSync = <T>(
    timing: OmnibarSearchTiming | undefined,
    phase: OmnibarSearchTimingPhase,
    operation: () => T,
): T => (timing ? timing.timeSync(phase, operation) : operation());
