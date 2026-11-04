export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
    let sal_a, gy, gm, gd, days;
    jy += 1595;
    days = -355668 + (365 * jy) + (~~(jy / 33) * 8) + ~~(((jy % 33) + 3) / 4) + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy = 400 * ~~(days / 146097);
    days %= 146097;
    if (days > 36524) {
        gy += 100 * ~~(--days / 36524);
        days %= 36524;
        if (days >= 365) days++;
    }
    gy += 4 * ~~(days / 1461);
    days %= 1461;
    if (days > 365) {
        gy += ~~((days - 1) / 365);
        days = (days - 1) % 365;
    }
    gd = days + 1;
    sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (gm = 0; gm < 13 && gd > sal_a[gm]!; gm++) {
        gd -= sal_a[gm]!;
    }
    return [gy, gm, gd];
}

function isJalaliLeapYear(jy: number): boolean {
    // Jalali leap years: year % 33 must be in {1, 5, 9, 13, 17, 22, 26, 30}
    const LEAP_REMAINDERS = new Set([1, 5, 9, 13, 17, 22, 26, 30]);
    return LEAP_REMAINDERS.has(jy % 33);
}

export function getDaysInJalaliMonth(year: number, month: number): number {
    if (month <= 6) return 31;
    if (month <= 11) return 30;
    // Month 12 (Esfand): 30 days in leap years, 29 in non-leap years
    return isJalaliLeapYear(year) ? 30 : 29;
}

export function getPersianDayOfWeek(gy: number, gm: number, gd: number): string {
    const date = new Date(gy, gm - 1, gd);
    const day = date.getDay();
    const days = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
    return days[day]!;
}
