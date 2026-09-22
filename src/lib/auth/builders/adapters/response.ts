/** Preserve explicit null data while omitting absent error metadata. */
export function optionalData(data: unknown) {
  return data === undefined ? {} : { data };
}
