import { type SharedSignInStatus } from '@lightdash/common';
import {
    createContext,
    useContext,
    useLayoutEffect,
    useId,
    useSyncExternalStore,
} from 'react';

export type WarehouseSignInBinding = string | null;
export type WarehouseSignInIdentity = {
    projectUuid: string;
    userUuid: string;
    pageGeneration: string;
};
export type WarehouseSignInCheck = {
    binding: WarehouseSignInBinding;
    generation: number;
    priority: number;
    started: boolean;
    forceRefresh: boolean;
    requestVersion: number;
    settled: boolean;
    blocked: boolean;
    status: SharedSignInStatus | null;
    retiredExpiry: string | null;
};
export type WarehouseSignInExecutionIdentity = WarehouseSignInIdentity & {
    binding: WarehouseSignInBinding;
    generation: number;
};
export type WarehouseSignInTarget = WarehouseSignInExecutionIdentity & {
    status: SharedSignInStatus;
};
export const warehouseSignInBindingKey = (binding: WarehouseSignInBinding) =>
    binding ?? 'original';
export const acceptWarehouseSignInStatus = (
    status: SharedSignInStatus | null,
    binding: WarehouseSignInBinding,
    knownSharedFailure = false,
): SharedSignInStatus | null => {
    if (!status) return null;
    if (status.personalSelection?.warehouseConnectionUuid !== binding) {
        return binding === null && knownSharedFailure && !status.personalSignIn
            ? status
            : null;
    }
    if (binding !== null && !status.personalSignIn) return null;
    return status;
};

export class WarehouseSignInStatusCache {
    constructor(readonly userUuid?: string) {}
    private readonly entries = new Map<
        string,
        {
            checkedAt: number;
            pageGeneration: string;
            generation: number;
            result: Promise<SharedSignInStatus | null>;
        }
    >();
    readonly openedSharedProjects = new Set<string>();
    checkedAt(
        identity: WarehouseSignInIdentity,
        binding: WarehouseSignInBinding,
    ) {
        return this.entries.get(
            JSON.stringify([identity.projectUuid, identity.userUuid, binding]),
        )?.checkedAt;
    }
    fetch(
        identity: WarehouseSignInIdentity,
        binding: WarehouseSignInBinding,
        generation: number,
        request: () => Promise<SharedSignInStatus | null>,
        forceRefresh = false,
    ) {
        const key = JSON.stringify([
            identity.projectUuid,
            identity.userUuid,
            binding,
        ]);
        const previous = this.entries.get(key);
        if (
            previous &&
            Date.now() - previous.checkedAt < 60_000 &&
            !(
                forceRefresh &&
                previous.pageGeneration === identity.pageGeneration
            )
        ) {
            previous.pageGeneration = identity.pageGeneration;
            previous.generation = generation;
            return previous.result;
        }
        const result = request();
        this.entries.delete(key);
        this.entries.set(key, {
            checkedAt: Date.now(),
            pageGeneration: identity.pageGeneration,
            generation,
            result,
        });
        if (this.entries.size > 100)
            this.entries.delete(this.entries.keys().next().value!);
        return result;
    }
    abandon(
        identity: WarehouseSignInIdentity,
        binding: WarehouseSignInBinding,
        generation: number,
    ) {
        const key = JSON.stringify([
            identity.projectUuid,
            identity.userUuid,
            binding,
        ]);
        const entry = this.entries.get(key);
        if (
            entry?.pageGeneration === identity.pageGeneration &&
            entry.generation === generation
        )
            this.entries.delete(key);
    }
    invalidate(
        identity: WarehouseSignInIdentity,
        binding: WarehouseSignInBinding,
        resetShared = false,
    ) {
        this.entries.delete(
            JSON.stringify([identity.projectUuid, identity.userUuid, binding]),
        );
        if (resetShared) this.openedSharedProjects.delete(identity.projectUuid);
    }
}

const signInStatusIdentity = (status: SharedSignInStatus) =>
    JSON.stringify(
        status.personalSignIn
            ? [
                  'personal',
                  status.personalSignIn.provider,
                  status.personalSignIn.userWarehouseCredentialsUuid,
              ]
            : [
                  'shared',
                  status.provider,
                  status.subject?.userUuid,
                  status.subjectBasis,
              ],
    );

export class WarehouseSignInPreflight {
    readonly checks = new Map<string, WarehouseSignInCheck>();
    private readonly sources = new Map<
        string,
        { binding: WarehouseSignInBinding; priority: number }
    >();
    private readonly listeners = new Set<() => void>();
    private revision = 0;
    private generation = 0;
    private lastPreferredBinding: WarehouseSignInBinding | undefined;
    recoveryGeneration = 0;
    automaticOpened = false;
    target: WarehouseSignInTarget | null = null;
    modalOpen = false;
    constructor(
        readonly identity: WarehouseSignInIdentity,
        readonly enabled: boolean,
        readonly loading: boolean,
        readonly statusCache = new WarehouseSignInStatusCache(),
    ) {}
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    snapshot = () => this.revision;
    notify = () => {
        this.arbitrate();
        this.revision += 1;
        this.listeners.forEach((listener) => listener());
    };
    register(
        source: string,
        binding: WarehouseSignInBinding,
        priority: number,
    ) {
        if (priority > 0 && this.lastPreferredBinding !== binding)
            this.automaticOpened = false;
        this.sources.set(source, { binding, priority });
        const key = warehouseSignInBindingKey(binding);
        const check = this.checks.get(key);
        const forceRefresh =
            priority > 0 &&
            this.lastPreferredBinding !== undefined &&
            this.lastPreferredBinding !== binding;
        if (!check || (priority > 0 && this.lastPreferredBinding !== binding))
            this.checks.set(key, {
                binding,
                generation: ++this.generation,
                priority,
                forceRefresh,
                requestVersion: 0,
                started: false,
                settled: false,
                blocked: false,
                status: null,
                retiredExpiry: null,
            });
        else check.priority = Math.max(check.priority, priority);
        if (priority > 0) this.lastPreferredBinding = binding;
        this.notify();
        return () => {
            this.sources.delete(source);
            const remaining = [...this.sources.values()].filter(
                (item) => item.binding === binding,
            );
            if (remaining.length === 0) this.checks.delete(key);
            else {
                const current = this.checks.get(key);
                if (current)
                    current.priority = Math.max(
                        ...remaining.map((item) => item.priority),
                    );
            }
            this.notify();
        };
    }
    isCurrent(
        target: Pick<
            WarehouseSignInTarget,
            | 'projectUuid'
            | 'userUuid'
            | 'pageGeneration'
            | 'binding'
            | 'generation'
        >,
    ) {
        return (
            target.projectUuid === this.identity.projectUuid &&
            target.userUuid === this.identity.userUuid &&
            target.pageGeneration === this.identity.pageGeneration &&
            this.checks.get(warehouseSignInBindingKey(target.binding))
                ?.generation === target.generation
        );
    }
    ready(binding: WarehouseSignInBinding | undefined) {
        if (this.loading) return false;
        if (!this.enabled) return true;
        if (binding === undefined) return false;
        const check = this.checks.get(warehouseSignInBindingKey(binding));
        return check?.settled === true && !check.blocked;
    }
    settle(
        binding: WarehouseSignInBinding,
        generation: number,
        status: SharedSignInStatus | null,
    ) {
        const check = this.checks.get(warehouseSignInBindingKey(binding));
        if (check?.generation !== generation) return false;
        const expired = status?.personalSignIn?.expired ?? status?.expired;
        if (
            this.target?.binding === binding &&
            this.target.generation === generation &&
            status &&
            !status.statusUnknown &&
            !expired
        ) {
            this.target = null;
            this.modalOpen = false;
        }
        if (status && !status.statusUnknown && !expired)
            check.retiredExpiry = null;
        check.status = status;
        check.settled = true;
        check.blocked = !!(status?.personalSignIn?.expired ?? status?.expired);
        this.notify();
        return true;
    }
    settleRejection(
        execution: WarehouseSignInExecutionIdentity & {
            recoveryGeneration: number;
        },
        status: SharedSignInStatus,
    ) {
        if (
            !this.isCurrent(execution) ||
            execution.recoveryGeneration !== this.recoveryGeneration ||
            !this.hasPreferredBinding(execution.binding) ||
            this.checks.get(warehouseSignInBindingKey(execution.binding))
                ?.retiredExpiry === signInStatusIdentity(status) ||
            this.target
        )
            return false;
        if (
            !(status.personalSignIn?.expired ?? status.expired) ||
            status.statusUnknown
        )
            return false;
        this.present(execution.binding, execution.generation, status);
        return this.settle(execution.binding, execution.generation, status);
    }
    arbitrate() {
        if (
            this.target &&
            (!this.isCurrent(this.target) ||
                !this.hasPreferredBinding(this.target.binding))
        ) {
            this.target = null;
            this.modalOpen = false;
        }
        if (this.target) {
            for (const check of this.checks.values())
                check.blocked =
                    this.modalOpen && check.binding === this.target.binding;
            return;
        }
        if ([...this.checks.values()].some((check) => !check.settled)) return;
        const expired = [...this.checks.values()]
            .filter(
                (check) =>
                    check.status &&
                    (check.status.personalSignIn?.expired ??
                        check.status.expired) &&
                    this.hasPreferredBinding(check.binding),
            )
            .sort((a, b) => b.priority - a.priority)[0];
        const target =
            expired?.status && !this.automaticOpened
                ? this.present(
                      expired.binding,
                      expired.generation,
                      expired.status,
                  )
                : null;
        for (const check of this.checks.values())
            check.blocked = this.modalOpen && check.binding === target?.binding;
    }
    private present(
        binding: WarehouseSignInBinding,
        generation: number,
        status: SharedSignInStatus,
    ) {
        this.target = {
            ...this.identity,
            binding,
            generation,
            status,
        };
        this.modalOpen =
            (status.personalSignIn?.canReconnect ?? status.canReconnect) &&
            (!!status.personalSignIn ||
                !this.statusCache.openedSharedProjects.has(
                    this.identity.projectUuid,
                ));
        if (!status.personalSignIn && this.modalOpen) {
            this.statusCache.openedSharedProjects.add(
                this.identity.projectUuid,
            );
            if (this.statusCache.openedSharedProjects.size > 100)
                this.statusCache.openedSharedProjects.delete(
                    this.statusCache.openedSharedProjects.values().next()
                        .value!,
                );
        }
        this.automaticOpened = true;
        return this.target;
    }
    dismiss(target: WarehouseSignInTarget) {
        if (this.target !== target || !this.isCurrent(target)) return;
        this.modalOpen = false;
        this.release(target);
    }
    restored(target: WarehouseSignInTarget) {
        if (this.target !== target || !this.isCurrent(target)) return;
        const check = this.checks.get(
            warehouseSignInBindingKey(target.binding),
        )!;
        this.statusCache.invalidate(
            this.identity,
            target.binding,
            !target.status.personalSignIn,
        );
        for (const sibling of this.checks.values()) {
            if (sibling === check) sibling.retiredExpiry = null;
            else if (
                sibling.status &&
                !sibling.status.statusUnknown &&
                (sibling.status.personalSignIn?.expired ??
                    sibling.status.expired)
            )
                sibling.retiredExpiry = signInStatusIdentity(sibling.status);
        }
        check.requestVersion += 1;
        check.status = null;
        check.settled = true;
        check.blocked = false;
        this.target = null;
        this.modalOpen = false;
        this.notify();
    }
    release(target: WarehouseSignInTarget) {
        if (!this.isCurrent(target)) return;
        const check = this.checks.get(
            warehouseSignInBindingKey(target.binding),
        )!;
        check.blocked = false;
        this.notify();
    }
    hasPreferredBinding(binding: WarehouseSignInBinding) {
        const preferred = [...this.sources.values()].filter(
            (source) => source.priority > 0,
        );
        return (
            this.lastPreferredBinding === undefined ||
            preferred.some((source) => source.binding === binding)
        );
    }
}

export const WarehouseSignInPreflightContext =
    createContext<WarehouseSignInPreflight | null>(null);
const noSubscribe = () => () => {};
const emptySnapshot = () => 0;
export const useWarehouseSignInPreflightStore = () => {
    const store = useContext(WarehouseSignInPreflightContext);
    useSyncExternalStore(
        store?.subscribe ?? noSubscribe,
        store?.snapshot ?? emptySnapshot,
    );
    return store;
};
export const useWarehouseSignInExecution = (
    projectUuid: string | undefined,
    binding: WarehouseSignInBinding | undefined,
    candidate = true,
    priority = 0,
) => {
    const store = useWarehouseSignInPreflightStore();
    const source = useId();
    useLayoutEffect(() => {
        if (
            !store ||
            !candidate ||
            binding === undefined ||
            projectUuid !== store.identity.projectUuid
        )
            return;
        return store.register(source, binding, priority);
    }, [store, source, projectUuid, binding, candidate, priority]);
    return (
        !store ||
        (!store.loading && !store.enabled) ||
        (projectUuid === store.identity.projectUuid &&
            store.ready(candidate ? binding : undefined) &&
            binding !== undefined &&
            store.hasPreferredBinding(binding))
    );
};

let activeStore: WarehouseSignInPreflight | null = null;
export const getActiveWarehouseSignInPreflight = () => activeStore;
export const activateWarehouseSignInPreflight = (
    store: WarehouseSignInPreflight,
) => {
    activeStore = store;
    return () => {
        if (activeStore === store) activeStore = null;
    };
};
export const isWarehouseSignInExecutionReady = (
    projectUuid: string,
    binding: WarehouseSignInBinding | undefined,
) =>
    !activeStore ||
    (!activeStore.loading && !activeStore.enabled) ||
    (activeStore.identity.projectUuid === projectUuid &&
        activeStore.ready(binding) &&
        (binding === undefined || activeStore.hasPreferredBinding(binding)));
export const isWarehouseSignInTargetCurrent = (target: WarehouseSignInTarget) =>
    activeStore?.target === target &&
    activeStore.isCurrent(target) &&
    activeStore.hasPreferredBinding(target.binding);

export const captureWarehouseSignInExecution = (
    projectUuid: string,
    binding: WarehouseSignInBinding,
): WarehouseSignInExecutionIdentity | null => {
    if (
        !activeStore?.enabled ||
        activeStore.identity.projectUuid !== projectUuid
    )
        return null;
    const check = activeStore.checks.get(warehouseSignInBindingKey(binding));
    return check
        ? { ...activeStore.identity, binding, generation: check.generation }
        : null;
};
export const isWarehouseSignInExecutionCurrent = (
    execution: WarehouseSignInExecutionIdentity | null,
) =>
    execution === null ||
    (activeStore?.isCurrent(execution) === true &&
        activeStore.hasPreferredBinding(execution.binding));
