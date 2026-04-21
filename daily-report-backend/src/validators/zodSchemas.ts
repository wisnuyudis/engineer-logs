import { z } from 'zod';

// Skema untuk Aktivitas (Create & Update)
export const ActivitySchema = z.object({
  actKey: z.string().min(1, "Jenis aktivitas wajib diisi"),
  topic: z.string().min(3, "Topik minimal 3 karakter"),
  dur: z.union([z.number(), z.string()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, {
    message: "Durasi harus berupa angka positif",
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  status: z.enum(["completed", "progress", "canceled"]).optional().default("completed"),
  
  ticketId: z.string().optional().nullable(),
  ticketTitle: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  prName: z.string().optional().nullable(),
  nps: z.union([z.number(), z.string()]).optional().nullable().transform(val => val ? Number(val) : null),
  leadId: z.string().optional().nullable(),
  prospectValue: z.union([z.number(), z.string()]).optional().nullable().transform(val => val ? Number(val) : null),
});

// Skema untuk Auth / Login
export const LoginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});
