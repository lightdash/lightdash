// const { NodeTracerProvider } = require('@opentelemetry/node');
// const { registerInstrumentations } = require('@opentelemetry/instrumentation');
// const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
// const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
// import { SimpleSpanProcessor } from '@opentelemetry/tracing';
// import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
// import { Resource } from '@opentelemetry/resources'
//
// // This is completely undocumented but you need to set this resource attribute to declare the service name
// // Seems like a recent breaking change
// const provider = new NodeTracerProvider({ resource: Resource.default().merge(new Resource({'service.name': 'lightdash-server'}))});
// provider.addSpanProcessor(
//     new SimpleSpanProcessor(
//         new JaegerExporter({}),
//     ),
// );
//
// provider.register();
//
// registerInstrumentations({
//     instrumentations: [
//         new HttpInstrumentation(),
//         new ExpressInstrumentation(),
//     ],
// });
//
// console.log('Open telemetry initialised')

/**
 * Usage in code
 * to instrument the library just use the opentelemetry api
 *
 * Note that the express instrumentation automatically creates a root span
 * for each root. Just create a new span with a tracer or get the current span
 * with the context api
 *
 * Example usage follows
 */

// tracer api
// import opentelemetry, {SpanStatusCode} from "@opentelemetry/api";
// const tracer = opentelemetry.trace.getTracer('lightdash')
// const span = tracer.startSpan('postDbtSyncRpc')
// span.setAttribute('requestToken', requestToken)
// span.recordException(e)
// span.setStatus({code: SpanStatusCode.ERROR, message: 'Error reaching dbt server'})
// span.end()

// context api
// const span = opentelemetry.trace.getSpan(opentelemetry.context.active())
// span && span.addEvent('Spawed dbt child process', {dbtProcessId: dbtChildProcess?.pid})

// build scripts
// "dev": "nodemon -r ./src/tracing.ts src/index.ts",
//     "build": "tsc --build tsconfig.json",
//     "start": "node -r ./dist/tracing.js dist/index.js"
