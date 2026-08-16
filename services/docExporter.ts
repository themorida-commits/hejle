
import type { Personnel, ShiftType, ScheduleEntry, GlobalDutySettings } from '../types';
import { MONTHS, NATIONAL_HOLIDAYS } from '../constants';
import { jalaliToGregorian, getDaysInJalaliMonth, getPersianDayOfWeek, calculateShiftHoursDetailed, calculateDutyHours } from '../utils';

declare const docx: any;
declare const saveAs: any;

export const exportToDocx = (
    personnel: Personnel[],
    shiftTypes: ShiftType[],
    schedule: ScheduleEntry[],
    jMonth: number,
    jYear: number,
    departmentName: string,
    scheduleNotes: string,
    globalSettings: GlobalDutySettings
) => {
    const { Packer, Document, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, AlignmentType, VerticalAlign, TableLayoutType } = docx;

    const daysInMonth = getDaysInJalaliMonth(jYear, jMonth);
    const shiftMap = new Map(shiftTypes.map(st => [st.id, st]));
    const scheduleMap = new Map<string, ScheduleEntry>();
    schedule.forEach(entry => {
        scheduleMap.set(`${entry.personnelId}-${entry.date}`, entry);
    });
    
    const centerAlign = { alignment: AlignmentType.CENTER, verticalAlign: VerticalAlign.CENTER };
    const headerShading = { shading: { fill: "f2f2f2" } };
    const cellBorders = {
        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    };

    const holidaysInMonth = new Set(NATIONAL_HOLIDAYS
        .filter(h => h.month === jMonth)
        .map(h => h.day));

    // Calculate dynamic holiday deduction
    let holidayCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
        if (getPersianDayOfWeek(gy, gm, gd) !== 'ج' && holidaysInMonth.has(d)) holidayCount++;
    }
    const holidayDeduction = holidayCount * 6;

    // --- HEADER ---
    const headerRow1Cells = [
        new TableCell({ children: [new Paragraph("کسر/اضافه کار")], rowSpan: 2, ...centerAlign, ...headerShading, borders: cellBorders }),
        new TableCell({ children: [new Paragraph("مجموع ساعت شیفت")], rowSpan: 2, ...centerAlign, ...headerShading, borders: cellBorders }),
        ...Array.from({ length: daysInMonth }, (_, i) => {
            const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, i + 1);
            return new TableCell({ children: [new Paragraph(getPersianDayOfWeek(gy, gm, gd))], ...centerAlign, ...headerShading, borders: cellBorders });
        }),
        new TableCell({ children: [new Paragraph("تغییر گروهی")], columnSpan: 3, ...centerAlign, ...headerShading, borders: cellBorders }),
        new TableCell({ children: [new Paragraph("سمت")], rowSpan: 2, ...centerAlign, ...headerShading, borders: cellBorders }),
        new TableCell({ children: [new Paragraph("وضعیت استخدامی")], rowSpan: 2, ...centerAlign, ...headerShading, borders: cellBorders }),
        new TableCell({ children: [new Paragraph("اسامی")], rowSpan: 2, ...centerAlign, ...headerShading, borders: cellBorders }),
        new TableCell({ children: [new Paragraph("ردیف")], rowSpan: 2, ...centerAlign, ...headerShading, borders: cellBorders }),
    ];
    const headerRow1 = new TableRow({ children: headerRow1Cells });

    const headerRow2Cells = [
        ...Array.from({ length: daysInMonth }, (_, i) => new TableCell({ children: [new Paragraph(`${i + 1}`)], ...centerAlign, ...headerShading, borders: cellBorders })),
        new TableCell({ children: [new Paragraph("تعداد شب")], ...centerAlign, ...headerShading, borders: cellBorders }),
        new TableCell({ children: [new Paragraph("تعداد عصر")], ...centerAlign, ...headerShading, borders: cellBorders }),
        new TableCell({ children: [new Paragraph("تعداد صبح")], ...centerAlign, ...headerShading, borders: cellBorders }),
    ];
    const headerRow2 = new TableRow({ children: headerRow2Cells });

    // --- BODY ---
    const morningShiftId = shiftTypes.find(st => st.name === 'صبح' || st.symbol === 'M')?.id;
    const eveningShiftId = shiftTypes.find(st => st.name === 'عصر' || st.symbol === 'E')?.id;
    const nightShiftId = shiftTypes.find(st => st.name === 'شب' || st.symbol === 'N')?.id;

    const bodyRows = personnel.map((p, index) => {
        let totalHours = 0;
        let morningCount = 0;
        let eveningCount = 0;
        let nightCount = 0;

        for (let i = 1; i <= daysInMonth; i++) {
            const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, i);
            const date = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
            const entry = scheduleMap.get(`${p.id}-${date}`);
            if (entry) {
                const shift = shiftMap.get(entry.shiftTypeId);
                if (shift) {
                    const isHoliday = holidaysInMonth.has(i);
                    const isFriday = getPersianDayOfWeek(gy, gm, gd) === 'ج';
                    totalHours += calculateShiftHoursDetailed(shift, isFriday, isHoliday);
                    
                    if (shift.id === morningShiftId) morningCount++;
                    else if (shift.id === eveningShiftId) eveningCount++;
                    else if (shift.id === nightShiftId) nightCount++;
                }
            }
        }

        const dutyHours = calculateDutyHours(p, globalSettings, holidayDeduction, jYear, jMonth);
        const overtime = totalHours - dutyHours;

        const cells = [
             new TableCell({ children: [new Paragraph({ text: overtime.toFixed(1), ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
             new TableCell({ children: [new Paragraph({ text: totalHours.toFixed(1), ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
            ...Array.from({ length: daysInMonth }, (_, i) => {
                const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, i + 1);
                const date = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
                const entry = scheduleMap.get(`${p.id}-${date}`);
                const shift = entry ? shiftMap.get(entry.shiftTypeId) : null;
                return new TableCell({
                    children: [new Paragraph({ text: shift ? shift.symbol : '', ...centerAlign })],
                    shading: { fill: shift ? shift.displayColor.substring(1) : "FFFFFF" },
                    borders: cellBorders,
                    verticalAlign: VerticalAlign.CENTER,
                });
            }),
             new TableCell({ children: [new Paragraph({ text: String(nightCount), ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
             new TableCell({ children: [new Paragraph({ text: String(eveningCount), ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
             new TableCell({ children: [new Paragraph({ text: String(morningCount), ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
             new TableCell({ children: [new Paragraph({ text: p.role, ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
             new TableCell({ children: [new Paragraph({ text: p.employmentStatus, ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
             new TableCell({ children: [new Paragraph({ text: p.name, ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
             new TableCell({ children: [new Paragraph({ text: String(index + 1), ...centerAlign })], borders: cellBorders, verticalAlign: VerticalAlign.CENTER }),
        ];
        return new TableRow({ children: cells });
    });

    const notesParagraphs = scheduleNotes.split('\n').map(line => new Paragraph({
        children: [new TextRun({ text: line, rightToLeft: true })],
        alignment: AlignmentType.RIGHT,
    }));

    const table = new Table({
        rows: [headerRow1, headerRow2, ...bodyRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
        tableLayout: TableLayoutType.FIXED,
        rightToLeft: true,
    });

    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: `برنامه چینش شیفت ${departmentName} ماه ${MONTHS.find(m => m.value === jMonth)?.name || jMonth} سال ${jYear}`,
                            bold: true,
                            size: 28,
                            rightToLeft: true,
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph(" "),
                table,
                new Paragraph(" "),
                ...notesParagraphs,
            ],
        }],
    });

    Packer.toBlob(doc).then(blob => {
        saveAs(blob, `schedule-${jYear}-${jMonth}.docx`);
    });
};
