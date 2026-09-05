// Shared between the AI preview route and the order submission route so
// the two never drift out of sync with each other or with the wizard's
// own client-side textarea limit.
export const MIN_DESCRIPTION_LENGTH = 10
export const MAX_DESCRIPTION_LENGTH = 500

// customer_note is optional — no minimum, same cap as description.
export const MAX_CUSTOMER_NOTE_LENGTH = 500
