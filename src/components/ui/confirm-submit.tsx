"use client";

import { Button } from "./button";

/** Botón de envío que pide confirmación antes de ejecutar la acción del formulario. */
export function ConfirmSubmit({ message, ...props }: React.ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      {...props}
    />
  );
}
