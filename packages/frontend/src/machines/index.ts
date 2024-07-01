import { uniq } from 'lodash';
import { assign, createActor, setup } from 'xstate';

interface SqlRunnerContext {
    projectUuid: string;
    activeTable: string | undefined;
    activeFields: string[] | undefined;
}

type SqlRunnerEvents =
    | {
          type: 'SET_ACTIVE_FIELDS';
          payload: string;
      }
    | {
          type: 'SET_ACTIVE_TABLE';
          payload: string | undefined;
      };

const sqlRunnerMachine = setup<SqlRunnerContext, SqlRunnerEvents>({
    types: {
        context: {
            projectUuid: '',
            activeTable: undefined,
            activeFields: undefined,
        },
        events: {} as SqlRunnerEvents,
    },
}).createMachine({
    id: 'sqlRunner',
    initial: 'idle',
    context: {
        projectUuid: '',
        activeTable: undefined,
        activeFields: [],
    },
    states: {
        idle: {
            on: {
                SET_ACTIVE_FIELDS: {
                    actions: assign({
                        activeFields: ({ context, event }) => {
                            return uniq([
                                ...(context.activeFields ?? []),
                                event.payload,
                            ]);
                        },
                    }),
                },
                SET_ACTIVE_TABLE: {
                    actions: assign({
                        activeTable: ({ event }) => event.payload,
                        activeFields: () => [],
                    }),
                },
            },
        },
    },
});

export const globalActor = createActor(sqlRunnerMachine);

// export default sqlRunnerMachine;
