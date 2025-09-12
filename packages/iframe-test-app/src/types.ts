// Event types from Lightdash embed system
export interface LightdashEmbedEvent {
    type: string;
    payload: Record<string, unknown>;
    timestamp: number;
}

export interface EventLogEntry {
    id: string;
    timestamp: Date;
    event: LightdashEmbedEvent;
}