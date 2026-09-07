// Single source for the Sunday-first Korean weekday labels used by
// pickup scheduling — the customer picker, the admin pickup settings
// form, and that form's own save-validation errors all previously
// redeclared this same array independently.
export const WEEKDAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const
