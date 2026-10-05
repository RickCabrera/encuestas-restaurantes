export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valores a conservar en el formulario tras un error (React reinicia el form al enviar). */
  values?: Record<string, string>;
};

export const initialState: ActionState = {};
