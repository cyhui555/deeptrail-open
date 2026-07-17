import { sha256 } from "./fs-safe.mjs";

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function canonicalSha256(value) {
  return sha256(canonicalJson(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)])
    );
  }
  return value;
}
