import { z } from "zod";

// Email validation
export const emailSchema = z.string().email("Invalid email address");

// Phone number (E.164 format)
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (+1234567890)");

// Client creation
export const createClientSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: emailSchema.optional(),
  company: z.string().max(200).optional(),
  phone: phoneSchema.optional(),
});

// User preferences
export const preferencesSchema = z.object({
  dailyDigestTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format")
    .optional(),
  urgencyThreshold: z.number().min(0).max(100).optional(),
  notifications: z
    .object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
    })
    .optional(),
});

// Message text (sanitized)
export const messageTextSchema = z
  .string()
  .min(1, "Message cannot be empty")
  .max(50000, "Message is too long");

/**
 * Parse and validate input, returning typed data or throwing ValidationError
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
