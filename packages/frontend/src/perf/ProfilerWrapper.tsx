import { type AnyType } from '@lightdash/common';
import React, { Profiler, type PropsWithChildren } from 'react';

export function ProfilerWrapper({
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
        // Gate capture to test window to reduce noise
        if ((window as AnyType).__captureProfiling === false) return;

        (window as AnyType).__profiling = (window as AnyType).__profiling || [];
        (window as AnyType).__profiling.push({
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
