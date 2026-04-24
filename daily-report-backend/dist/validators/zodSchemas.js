"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginSchema = exports.ActivitySchema = void 0;
const zod_1 = require("zod");
const today = () => new Date().toISOString().slice(0, 10);
// Skema untuk Aktivitas (Create & Update)
exports.ActivitySchema = zod_1.z.object({
    actKey: zod_1.z.string().min(1, "Jenis aktivitas wajib diisi"),
    topic: zod_1.z.string().optional().nullable(),
    dur: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, {
        message: "Durasi harus berupa angka positif",
    }),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD").optional().default(today),
    startTime: zod_1.z.string().optional().nullable(),
    endTime: zod_1.z.string().optional().nullable(),
    status: zod_1.z.enum(["completed", "in_progress", "progress", "canceled"]).optional().default("completed"),
    note: zod_1.z.string().optional().nullable(),
    ticketId: zod_1.z.string().optional().nullable(),
    ticketTitle: zod_1.z.string().optional().nullable(),
    customerName: zod_1.z.string().optional().nullable(),
    prName: zod_1.z.string().optional().nullable(),
    nps: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable().transform(val => val ? Number(val) : null),
    leadId: zod_1.z.string().optional().nullable(),
    prospectValue: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable().transform(val => val ? Number(val) : null),
});
// Skema untuk Auth / Login
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email("Format email tidak valid"),
    password: zod_1.z.string().min(6, "Password minimal 6 karakter"),
});
