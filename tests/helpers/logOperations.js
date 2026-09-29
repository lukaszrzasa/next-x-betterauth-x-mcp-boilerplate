/**
 * The LogsModule operations, one use case per file, gathered the way the
 * suites address them. Loaded on call, so a suite's `mock.module`
 * registrations are in place before anything is imported.
 */

/** The email recorders are module-wide: the global sender calls them. */
const RECORDERS = "../../app/(LogsModule)/_/operations";
/** The reads and the staff recorder are the dashboard's. */
const READS = "../../app/(LogsModule)/admin/_/operations";

async function gather(directory, files) {
  const modules = await Promise.all(files.map((file) => import(`${directory}/${file}.ts`)));
  return Object.assign({}, ...modules);
}

/** `recordStaffLog`, `beginEmailLog`, `completeEmailLog`: internal, called with a genuine context. */
export async function loadLogRecorders() {
  return {
    ...(await gather(READS, ["staff/recordStaffLog"])),
    ...(await gather(RECORDERS, ["email/beginEmailLog", "email/completeEmailLog"])),
  };
}

/** The four guarded admin reads. */
export function loadLogReadOperations() {
  return gather(READS, ["email/listEmailLogs", "email/getEmailLog", "staff/listStaffLogs", "staff/listFilterOptions"]);
}
