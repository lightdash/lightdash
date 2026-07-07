import Logger from '../../logging/logger';
import type { BaseTrack } from '../LightdashAnalytics';
import type { ProjectionResult } from './projection';
import type { EventStreamRegistry, ProjectedEvent } from './registry';
import type { EventStreamWriter } from './types';

/**
 * Projects allowlisted analytics events into typed rows and pushes them to
 * the usage event stream writer. Never throws into the caller (`track()`).
 */
export class EventStreamSink {
    private readonly registry: EventStreamRegistry;

    private readonly writer: EventStreamWriter;

    constructor(registry: EventStreamRegistry, writer: EventStreamWriter) {
        this.registry = registry;
        this.writer = writer;
    }

    private isProjectedEvent(payload: BaseTrack): payload is ProjectedEvent {
        return payload.event in this.registry;
    }

    handle(payload: BaseTrack): void {
        try {
            if (!this.isProjectedEvent(payload)) return;
            // Safe: the registry maps each event name to a projection accepting that event type
            const projection = this.registry[payload.event] as (
                p: ProjectedEvent,
            ) => ProjectionResult;
            const result = projection(payload);
            if (result === null) return;
            this.writer.push(result.stream, result.row);
        } catch (error) {
            Logger.warn(
                `Failed to project analytics event "${payload.event}" into the usage event stream: ${error}`,
            );
        }
    }
}
