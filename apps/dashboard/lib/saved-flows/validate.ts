/**
 * Input validation for /api/saved-flows + /api/saved-flows/[id].
 * PRD §4.9: name <= 40 chars, prompt non-empty, icon optional, display_order integer.
 */

export interface CreateSavedFlowInput {
  name: string
  prompt: string
  icon?: string | null
  displayOrder?: number
}

export interface UpdateSavedFlowInput {
  name?: string
  prompt?: string
  icon?: string | null
  displayOrder?: number
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

function isPlainString(value: unknown): value is string {
  return typeof value === 'string'
}

export function parseCreateInput(body: unknown): ValidationResult<CreateSavedFlowInput> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body_must_be_object' }
  }
  const raw = body as Record<string, unknown>

  if (!isPlainString(raw.name) || raw.name.trim().length === 0) {
    return { ok: false, error: 'name_required' }
  }
  if (raw.name.length > 40) {
    return { ok: false, error: 'name_too_long' }
  }
  if (!isPlainString(raw.prompt) || raw.prompt.trim().length === 0) {
    return { ok: false, error: 'prompt_required' }
  }
  if (raw.icon !== undefined && raw.icon !== null && !isPlainString(raw.icon)) {
    return { ok: false, error: 'icon_invalid' }
  }
  if (raw.displayOrder !== undefined && (!Number.isInteger(raw.displayOrder))) {
    return { ok: false, error: 'display_order_invalid' }
  }

  return {
    ok: true,
    value: {
      name: raw.name.trim(),
      prompt: raw.prompt,
      icon: raw.icon === undefined ? undefined : (raw.icon as string | null),
      displayOrder: raw.displayOrder as number | undefined,
    },
  }
}

export function parseUpdateInput(body: unknown): ValidationResult<UpdateSavedFlowInput> {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body_must_be_object' }
  }
  const raw = body as Record<string, unknown>

  const result: UpdateSavedFlowInput = {}
  let touched = false

  if (raw.name !== undefined) {
    if (!isPlainString(raw.name) || raw.name.trim().length === 0) {
      return { ok: false, error: 'name_required' }
    }
    if (raw.name.length > 40) {
      return { ok: false, error: 'name_too_long' }
    }
    result.name = raw.name.trim()
    touched = true
  }
  if (raw.prompt !== undefined) {
    if (!isPlainString(raw.prompt) || raw.prompt.trim().length === 0) {
      return { ok: false, error: 'prompt_required' }
    }
    result.prompt = raw.prompt
    touched = true
  }
  if (raw.icon !== undefined) {
    if (raw.icon !== null && !isPlainString(raw.icon)) {
      return { ok: false, error: 'icon_invalid' }
    }
    result.icon = raw.icon as string | null
    touched = true
  }
  if (raw.displayOrder !== undefined) {
    if (!Number.isInteger(raw.displayOrder)) {
      return { ok: false, error: 'display_order_invalid' }
    }
    result.displayOrder = raw.displayOrder as number
    touched = true
  }

  if (!touched) {
    return { ok: false, error: 'no_fields_to_update' }
  }

  return { ok: true, value: result }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidId(id: string | undefined | null): id is string {
  return typeof id === 'string' && UUID_RE.test(id)
}
