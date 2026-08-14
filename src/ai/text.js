const PERSIAN_RANGE = /[\u0600-\u06FF\uFB8A-\uFBF9]/;
export function looksPersian(text) {
    if (!text || text.length < 2)
        return false;
    let count = 0;
    for (const ch of text) {
        if (PERSIAN_RANGE.test(ch))
            count++;
    }
    return count / text.length >= 0.3;
}
export function pickPersianFallback(text, fallback) {
    return looksPersian(text) ? text : fallback;
}
