import dashboardAsCodeSchema from './json/dashboard-as-code-1.0.json';

/**
 * The dashboard-as-code schema on a path of its own. Anything the frontend
 * imports from the package index is built into the file every page loads;
 * a page that is loaded on demand imports the schema from here instead
 * (`@lightdash/common/src/schemas/dashboardAsCodeSchema`), so only that page
 * carries it.
 */
export default dashboardAsCodeSchema;
