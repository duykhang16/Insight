/**
 * Vietnam Time (GMT+7) formatting utilities.
 * Uses Intl.DateTimeFormat with Asia/Ho_Chi_Minh for correctness.
 */

const VN_TZ = 'Asia/Ho_Chi_Minh';

const pad = (n) => String(n).padStart(2, '0');

/** Parse a Unix timestamp (seconds) into its Vietnam-time date parts. */
const vnParts = (unixSec) => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: VN_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    // formatToParts gives us: day, month, year, hour, minute as named parts
    const parts = Object.fromEntries(
        formatter.formatToParts(new Date(unixSec * 1000))
            .filter(p => p.type !== 'literal')
            .map(p => [p.type, p.value])
    );
    return parts; // { day, month, year, hour, minute }
};

/**
 * Format Unix timestamp (seconds) as "HH:mm — DD/MM/YYYY" in Vietnam time.
 * Used in tooltips and filter badges.
 */
export const formatVN = (unixSec) => {
    if (!unixSec) return '—';
    const p = vnParts(unixSec);
    return `${p.hour}:${p.minute} — ${p.day}/${p.month}/${p.year}`;
};

/**
 * Format Unix timestamp (seconds) as "HH:mm" in Vietnam time.
 * Used for chart X-axis labels and ReferenceLine x-values.
 */
export const formatTimeOnly = (unixSec) => {
    if (!unixSec) return '';
    const p = vnParts(unixSec);
    return `${p.hour}:${p.minute}`;
};

/**
 * Returns the Vietnam-time calendar date string "DD/MM/YYYY" for a Unix timestamp.
 * Used to detect day-boundary changes between consecutive data points.
 */
export const formatDateKey = (unixSec) => {
    if (!unixSec) return '';
    const p = vnParts(unixSec);
    return `${p.day}/${p.month}/${p.year}`;
};
