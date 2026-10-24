const scale = 1000000000000n;
export function decimal(value) {
  if (typeof value !== "string" || !/^\d{1,18}(?:\.\d{1,12})?$/.test(value))
    throw new Error("price_format");
  const [a, b = ""] = value.split(".");
  return BigInt(a) * scale + BigInt(b.padEnd(12, "0"));
}
export function formatted(value) {
  const neg = value < 0n;
  if (neg) value = -value;
  const whole = value / scale;
  const fraction = (value % scale)
    .toString()
    .padStart(12, "0")
    .replace(/0+$/, "");
  return (neg ? "-" : "") + whole + (fraction ? "." + fraction : "");
}
export function estimate(price, quantity, unit) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 0 ||
    !Number.isSafeInteger(unit) ||
    unit < 1
  )
    throw new Error("usage_format");
  return formatted(
    (decimal(price) * BigInt(quantity) + BigInt(unit) / 2n) / BigInt(unit),
  );
}
export function total(values) {
  return formatted(values.reduce((sum, v) => sum + decimal(v), 0n));
}
