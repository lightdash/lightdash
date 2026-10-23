const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { fileURLToPath } = require('node:url');

const EXPRESSION = 'JSON.stringify({projectUuid,stats:diskPool.stats})';
const REQUEST_TIMEOUT_MS = 2000;

function parseJson(value) {
    try {
        return JSON.parse(value);
    } catch {
        throw new Error('invalid_json');
    }
}

function bundlePath(value) {
    const builds = path.resolve(__dirname, '.work/large-org/builds');
    if (typeof value !== 'string' || !path.isAbsolute(value))
        throw new Error('invalid_bundle');
    const relative = path.relative(builds, value);
    if (!/^[a-f0-9]{40}\/\.runtime\/api\.cjs$/.test(relative))
        throw new Error('invalid_bundle');
    if (fs.realpathSync(value) !== value || fs.realpathSync(builds) !== builds)
        throw new Error('invalid_bundle');
    return value;
}

function matchesBundle(url, expected) {
    try {
        return fileURLToPath(url) === expected;
    } catch {
        return false;
    }
}

function isPm2Wrapper(url) {
    try {
        const filename = fs.realpathSync(fileURLToPath(url));
        return (
            filename.endsWith('/pm2/lib/ProcessContainerFork.js') &&
            parseJson(
                fs.readFileSync(
                    path.resolve(filename, '../../package.json'),
                    'utf8',
                ),
            ).name === 'pm2'
        );
    } catch {
        return false;
    }
}

function locatePoints(source) {
    const lines = source.split('\n');
    const success = lines.flatMap((line, index) =>
        line.includes('`dbt.compile.sourceFetchComplete ') ? [index] : [],
    );
    const failure = lines.flatMap((line, index) =>
        line.includes('`dbt.compile.crossSourceRefsResolved ') &&
        line.includes('status=failed')
            ? [index]
            : [],
    );
    if (success.length !== 1 || failure.length !== 1)
        throw new Error('unsupported_bundle');
    const successLine = success[0] - 1;
    if (lines[successLine]?.trim() !== 'this.logger.info(')
        throw new Error('unsupported_bundle');
    const failureLine = failure[0] - 3;
    if (
        lines[failureLine]?.trim() !== 'if (crossSourceRefsEnabled) {' ||
        lines[failureLine + 1]?.trim() !==
            'await waitForDbtSourceCleanup(cleanup);' ||
        lines[failureLine + 2]?.trim() !== 'this.logger.info(' ||
        !lines
            .slice(Math.max(0, failureLine - 30), failureLine)
            .some((line) => line.includes('}).catch(async (error) => {'))
    )
        throw new Error('unsupported_bundle');
    const failureThrowLine = lines.findIndex(
        (line, index) =>
            index > failure[0] &&
            index < failure[0] + 25 &&
            line.trim() === 'throw error;',
    );
    if (failureThrowLine < 0) throw new Error('unsupported_bundle');
    return [
        { point: 'sourceFetchComplete', lineNumber: successLine },
        { point: 'sourceFetchFailed', lineNumber: failureThrowLine },
    ];
}

function observation(value, point) {
    const parsed = parseJson(value);
    const { projectUuid, stats } = parsed ?? {};
    if (
        typeof projectUuid !== 'string' ||
        !projectUuid ||
        !Number.isSafeInteger(stats?.diskEvictions) ||
        stats.diskEvictions < 0 ||
        !Number.isSafeInteger(stats?.diskRecreations) ||
        stats.diskRecreations < 0
    )
        throw new Error('invalid_observation');
    return {
        projectUuid,
        diskEvictions: stats.diskEvictions,
        diskRecreations: stats.diskRecreations,
        point,
    };
}

class Inspector {
    constructor(socket, onEvent) {
        this.socket = socket;
        this.onEvent = onEvent;
        this.sequence = 0;
        this.pending = new Map();
        socket.addEventListener('message', ({ data }) => {
            try {
                const message = parseJson(data);
                if (message.id) {
                    const request = this.pending.get(message.id);
                    if (request) {
                        this.pending.delete(message.id);
                        clearTimeout(request.timer);
                        if (message.error)
                            request.reject(
                                new Error('inspector_request_failed'),
                            );
                        else request.resolve(message.result);
                    }
                } else this.onEvent(message);
            } catch {
                this.onEvent({ method: 'observer.invalidMessage' });
            }
        });
        socket.addEventListener('close', () => {
            this.pending.forEach(({ reject, timer }) => {
                clearTimeout(timer);
                reject(new Error('inspector_disconnected'));
            });
            this.pending.clear();
            this.onEvent({ method: 'observer.disconnected' });
        });
    }

    send(method, params = {}) {
        this.sequence += 1;
        const id = this.sequence;
        return new Promise((resolve, reject) => {
            if (this.socket.readyState !== WebSocket.OPEN) {
                reject(new Error('inspector_disconnected'));
                return;
            }
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('inspector_timeout'));
            }, REQUEST_TIMEOUT_MS);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
}

async function discover(port, api) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw new Error('invalid_inspector_port');
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('discovery_failed');
    const targets = parseJson(await response.text());
    if (
        !Array.isArray(targets) ||
        targets.length !== 1 ||
        targets[0].type !== 'node' ||
        (!matchesBundle(targets[0].url, api) && !isPm2Wrapper(targets[0].url))
    )
        throw new Error('target_mismatch');
    const endpoint = new URL(targets[0].webSocketDebuggerUrl);
    if (
        endpoint.protocol !== 'ws:' ||
        endpoint.hostname !== '127.0.0.1' ||
        endpoint.port !== String(port) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
    )
        throw new Error('target_mismatch');
    return endpoint.href;
}

async function run(config, input) {
    let inspector;
    let socket;
    let stopping = false;
    let unavailable = false;
    let activePause = Promise.resolve();
    const breakpoints = new Map();
    const scripts = new Map();
    let scriptId;

    async function stop(reason) {
        if (stopping) return;
        stopping = true;
        clearTimeout(startupTimer);
        clearTimeout(lifetimeTimer);
        if (reason && !unavailable) {
            unavailable = true;
            process.stdout.write(
                `${JSON.stringify({ unavailable: reason })}\n`,
            );
        }
        const deadline = setTimeout(() => process.exit(1), 4000);
        try {
            await Promise.allSettled([activePause]);
            if (inspector && socket.readyState === WebSocket.OPEN) {
                await Promise.allSettled(
                    [...breakpoints.keys()].map((breakpointId) =>
                        inspector.send('Debugger.removeBreakpoint', {
                            breakpointId,
                        }),
                    ),
                );
                await inspector.send('Debugger.disable');
            }
        } catch {
            process.exitCode = 1;
        } finally {
            socket?.close();
            input.close();
            process.stdin.destroy();
            clearTimeout(deadline);
            process.exit(unavailable ? 1 : (process.exitCode ?? 0));
        }
    }

    async function paused(params) {
        const hit = params.hitBreakpoints?.find((id) => breakpoints.has(id));
        const frame = params.callFrames?.[0];
        if (!hit) throw new Error('unexpected_pause');
        let result;
        const expected = breakpoints.get(hit);
        try {
            if (
                frame?.location.scriptId !== scriptId ||
                frame.location.lineNumber !== expected.lineNumber
            )
                throw new Error('pause_location_mismatch');
            result = await inspector.send('Debugger.evaluateOnCallFrame', {
                callFrameId: frame.callFrameId,
                expression: EXPRESSION,
                returnByValue: true,
                silent: true,
                throwOnSideEffect: true,
            });
        } finally {
            await inspector.send('Debugger.resume');
        }
        if (result.exceptionDetails || typeof result.result?.value !== 'string')
            throw new Error('stats_unavailable');
        const event = observation(result.result.value, expected.point);
        process.stdout.write(`${JSON.stringify(event)}\n`);
    }

    function onEvent(message) {
        if (message.method === 'Debugger.scriptParsed') {
            const { url, scriptId: parsedId } = message.params;
            if (matchesBundle(url, config.api)) scripts.set(parsedId, url);
        } else if (message.method === 'Debugger.paused') {
            activePause = paused(message.params);
            void activePause.catch(() => stop('stats_unavailable'));
        } else if (message.method === 'observer.disconnected') {
            void stop('inspector_disconnected');
        } else if (message.method === 'observer.invalidMessage') {
            void stop('invalid_inspector_message');
        }
    }

    async function installPoint(point) {
        const { locations } = await inspector.send(
            'Debugger.getPossibleBreakpoints',
            {
                start: {
                    scriptId,
                    lineNumber: point.lineNumber,
                    columnNumber: 0,
                },
                end: {
                    scriptId,
                    lineNumber: point.lineNumber + 1,
                    columnNumber: 0,
                },
                restrictToFunction: true,
            },
        );
        const location = locations
            .filter(
                (candidate) =>
                    candidate.scriptId === scriptId &&
                    candidate.lineNumber === point.lineNumber &&
                    candidate.type !== 'return',
            )
            .sort((a, b) => a.columnNumber - b.columnNumber)[0];
        if (!location) throw new Error('breakpoint_unavailable');
        const result = await inspector.send('Debugger.setBreakpointByUrl', {
            url: scripts.get(scriptId),
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber,
        });
        breakpoints.set(result.breakpointId, point);
        if (
            result.locations.length !== 1 ||
            result.locations[0].scriptId !== scriptId ||
            result.locations[0].lineNumber !== location.lineNumber ||
            result.locations[0].columnNumber !== location.columnNumber
        )
            throw new Error('breakpoint_location_mismatch');
    }

    process.once('SIGINT', () => void stop());
    process.once('SIGTERM', () => void stop());
    input.once('close', () => void stop('parent_disconnected'));
    const startupTimer = setTimeout(() => void stop('ready_timeout'), 9000);
    const lifetimeTimer = setTimeout(
        () => void stop('lifetime_exceeded'),
        1795000,
    );
    try {
        if (Number(process.versions.node.split('.')[0]) !== 24)
            throw new Error('node_24_required');
        const api = bundlePath(config.api);
        const points = locatePoints(fs.readFileSync(api, 'utf8'));
        const endpoint = await discover(config.port, api);
        if (stopping) return;
        socket = new WebSocket(endpoint);
        inspector = new Inspector(socket, onEvent);
        await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve, { once: true });
            socket.addEventListener(
                'error',
                () => reject(new Error('connection_failed')),
                { once: true },
            );
        });
        const identity = await inspector.send('Runtime.evaluate', {
            expression: 'process.pid',
            returnByValue: true,
            silent: true,
            throwOnSideEffect: true,
        });
        if (
            !Number.isInteger(config.pid) ||
            config.pid <= 0 ||
            identity.result?.value !== config.pid
        )
            throw new Error(
                identity.exceptionDetails ? 'pid_unavailable' : 'pid_mismatch',
            );
        await inspector.send('Debugger.enable');
        if (scripts.size !== 1) throw new Error('script_mismatch');
        [scriptId] = scripts.keys();
        await installPoint(points[0]);
        await installPoint(points[1]);
        if (!stopping) {
            clearTimeout(startupTimer);
            process.stdout.write('ready\n');
        }
    } catch (error) {
        const reasons = new Set([
            'unsupported_bundle',
            'node_24_required',
            'discovery_failed',
            'target_mismatch',
            'pid_unavailable',
            'pid_mismatch',
            'connection_failed',
            'script_mismatch',
            'breakpoint_unavailable',
            'breakpoint_location_mismatch',
            'inspector_request_failed',
            'inspector_timeout',
        ]);
        await stop(
            reasons.has(error.message) ? error.message : 'observer_unavailable',
        );
    }
}

if (require.main === module) {
    const input = readline.createInterface({ input: process.stdin });
    const configTimer = setTimeout(() => process.exit(1), 9000);
    input.once('line', (line) => {
        clearTimeout(configTimer);
        try {
            const config = parseJson(line);
            void run(config, input).catch(() => process.exit(1));
        } catch {
            process.exit(1);
        }
    });
} else {
    module.exports = { bundlePath, matchesBundle, locatePoints, observation };
}
