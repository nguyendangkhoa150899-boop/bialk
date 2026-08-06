export class ValidationError extends Error {}

export function intInRange(value, { min = 0, max, label }) {
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new ValidationError(`${label} phải là số nguyên`);
  }
  if (n < min) {
    throw new ValidationError(`${label} không được nhỏ hơn ${min}`);
  }
  if (max !== undefined && n > max) {
    throw new ValidationError(`${label} không được lớn hơn ${max}`);
  }
  return n;
}

export function nonEmptyString(value, label) {
  const s = String(value ?? "").trim();
  if (!s) {
    throw new ValidationError(`${label} không được để trống`);
  }
  return s;
}
