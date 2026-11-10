/**
 * Shared server-action state. `fieldErrors` maps form field names to a message so the
 * form can mark the field invalid, describe the error and move focus to it.
 */
export type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
} | null;
