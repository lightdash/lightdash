// These suites change the data timezone of the dedicated timezone projects
// and only conflict with each other. One file keeps them on one worker, in
// order, while the parallel group runs around them.
import './timezone/dataTimezone';
import './timezone/queryTimezone';
import './timezone/queryTimezoneBoundary';
