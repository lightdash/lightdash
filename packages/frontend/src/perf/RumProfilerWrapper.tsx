import React, { Profiler, type PropsWithChildren } from 'react';

export function RumProfilerWrapper({
    id,
    children,
}: PropsWithChildren<{ id: string }>) {
    const onRender: React.ProfilerOnRenderCallback = (
        profId,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
    ) => {
        (window as any).__profiling = (window as any).__profiling || [];
        (window as any).__profiling.push({
            id: profId,
            phase, // "mount" | "update"
            actualDuration, // time spent rendering this update
            baseDuration, // estimated render cost without memoization
            startTime,
            commitTime,
            ts: performance.now(),
        });
    };

    return (
        <Profiler id={id} onRender={onRender}>
            {children}
        </Profiler>
    );
}
