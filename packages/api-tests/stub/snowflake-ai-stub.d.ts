export type SnowflakeAiStub = { url: string; close: () => Promise<void> };
export function startStub(options?: {
    port?: number;
    host?: string;
}): Promise<SnowflakeAiStub>;

export default startStub;
