export type BuildEvent =
    | { ok: false; errors: string[] }
    | {
          ok: true;
          generation: number;
          revision: number;
          seconds: number;
          changed: boolean;
          outfile: string;
          inputs: number;
          esbuildVersion: string;
      };
export function createBackendBuilder(options: {
    root: string;
    outDir: string;
    role?: 'api' | 'scheduler';
    entry?: string;
    onBuild?: (event: BuildEvent) => void | Promise<void>;
}): Promise<{
    outfile: string;
    rebuild(): Promise<BuildEvent>;
    watch(): Promise<void>;
    dispose(): Promise<void>;
}>;
