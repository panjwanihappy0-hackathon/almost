// Size limits shared by the page (checks before upload) and the server (checks again).
// Vercel rejects any request body over about 4.5 MB, so everything together must stay below that.

export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB per CSV file
export const MAX_FRAME_BYTES = 1024 * 1024; // 1 MB per snapshot frame
export const MAX_FRAMES = 4;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB for the whole upload

// A rack is flagged when it gets at least this share of all stops...
export const MIN_STOP_SHARE = 0.1;
// ...and its share of sales is less than this fraction of its share of stops.
export const SALES_TO_STOPS_RATIO = 0.5;

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
