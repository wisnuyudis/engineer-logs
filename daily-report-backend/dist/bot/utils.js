"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOffsetDate = exports.parseFlexibleDuration = void 0;
const parseFlexibleDuration = (input) => {
    // Parses strings like "1j 20m", "1j", "90m", "1.5j" to MINUTES
    const str = input.toLowerCase().replace(/\s+/g, '');
    let totalMinutes = 0;
    // Ex: "1j20m"
    const jMatch = str.match(/([0-9.]+)(j|jam|h|hour)/);
    const mMatch = str.match(/([0-9]+)(m|mnt|menit|min)/);
    if (jMatch) {
        totalMinutes += parseFloat(jMatch[1]) * 60;
    }
    if (mMatch) {
        totalMinutes += parseInt(mMatch[1], 10);
    }
    // If it's just a raw number, assume minutes
    if (!jMatch && !mMatch && !isNaN(Number(str))) {
        totalMinutes = Number(str);
    }
    return Math.round(totalMinutes);
};
exports.parseFlexibleDuration = parseFlexibleDuration;
const getOffsetDate = (offsetDays) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
};
exports.getOffsetDate = getOffsetDate;
