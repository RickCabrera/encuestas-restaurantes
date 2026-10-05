import { z } from "zod";

/** Reglas de contraseña del panel (Mi cuenta, recuperación y registro con invitación). */
export const passwordSchema = z.string().min(8, "Mínimo 8 caracteres").max(128, "Máximo 128 caracteres");
