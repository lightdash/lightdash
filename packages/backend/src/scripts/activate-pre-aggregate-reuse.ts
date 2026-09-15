import knex from 'knex';
import { parseArgs } from 'node:util';
import {
    activatePreAggregateReuse,
    setPreAggregateReuseEnabled,
} from '../ee/database/activatePreAggregateReuse';
import knexConfig from '../knexfile';

const main = async (): Promise<void> => {
    const { values } = parseArgs({
        options: {
            actor: { type: 'string' },
            'disable-reuse': { type: 'boolean', default: false },
            'enable-reuse': { type: 'boolean', default: false },
            'compatible-writers-confirmed': { type: 'boolean', default: false },
        },
        strict: true,
        allowPositionals: false,
    });
    if (
        !values.actor?.trim() ||
        (!values['disable-reuse'] &&
            !values['enable-reuse'] &&
            !values['compatible-writers-confirmed']) ||
        (values['disable-reuse'] && values['enable-reuse'])
    ) {
        throw new Error(
            'Usage: activate-pre-aggregate-reuse --actor <operator> --compatible-writers-confirmed. Confirm every API, scheduler, and query worker runs the compatibility release before activation.',
        );
    }
    const environment =
        process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const database = knex({
        ...knexConfig[environment],
        pool: { min: 0, max: 1 },
    });
    try {
        if (values['disable-reuse'] || values['enable-reuse']) {
            await setPreAggregateReuseEnabled(database, {
                enabled: values['enable-reuse'],
                actor: values.actor,
            });
        } else {
            await activatePreAggregateReuse(database, {
                compatibleWritersConfirmed: true,
                actor: values.actor,
            });
        }
    } finally {
        await database.destroy();
    }
};

void main().catch((error: unknown) => {
    console.error(
        error instanceof Error
            ? error.message
            : 'Pre-aggregate reuse activation failed',
    );
    process.exitCode = 1;
});
