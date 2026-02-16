import ora from 'ora';
import { Config } from './config';
import * as styles from './styles';

type PromptAnswer = {
    useFallbackDbtVersion?: boolean;
    useExperimentalDbtCloudCLI?: boolean;
};

class GlobalState {
    private verbose: boolean = false;

    private nonInteractive: boolean = false;

    private activeSpinner: ora.Ora | undefined;

    private savedPromptAnswers: PromptAnswer;

    constructor() {
        this.savedPromptAnswers = {};
    }

    setNonInteractive(value: boolean) {
        this.nonInteractive = value;
    }

    isNonInteractive(): boolean {
        return this.nonInteractive || process.env.CI === 'true';
    }

    getActiveSpinner() {
        return this.activeSpinner;
    }

    startSpinner(options?: ora.Options | string): ora.Ora {
        this.activeSpinner = ora(options);
        this.activeSpinner.start();
        return this.activeSpinner;
    }

    log(message: unknown, ...optionalParams: unknown[]) {
        const spinner = this.getActiveSpinner();
        const shouldRestartSpinner = spinner?.isSpinning;
        spinner?.stop();
        console.error(message, ...optionalParams);
        if (shouldRestartSpinner) {
            spinner?.start();
        }
    }

    setVerbose(verbose: boolean) {
        this.verbose = verbose;
    }

    getSavedPromptAnswer<T extends keyof PromptAnswer>(
        prompt: T,
    ): PromptAnswer[T] | undefined {
        return this.savedPromptAnswers[prompt];
    }

    savePromptAnswer<T extends keyof PromptAnswer>(
        prompt: T,
        value: PromptAnswer[T],
    ) {
        this.savedPromptAnswers[prompt] = value;
    }

    clearPromptAnswer() {
        this.savedPromptAnswers = {};
    }

    debug(message: string) {
        if (this.verbose) {
            this.log(styles.debug(message));
        }
    }

    logProjectInfo(config: Config) {
        const projectUuid = config.context?.project;

        this.log(`\n${styles.success('Using project:')} ${projectUuid}\n`);
    }
}

export default new GlobalState();
