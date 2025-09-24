export function formatNumberInput(value) {
  const digitsOnly = (value || "").replace(/[^0-9]/g, "");
  if (!digitsOnly) return "";
  return Number(digitsOnly).toLocaleString("id-ID");
}

export function parseNumberInput(value) {
  const digitsOnly = (value || "").replace(/[^0-9]/g, "");
  return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

export function formatNumberValue(value) {
  return Number(value ?? 0).toLocaleString("id-ID");
}

export function formatCurrencyValue(value) {
  return `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`;
}

export function formatDateDisplay(value) {
  if (!value) return "-";
  const safeValue = value.length === 10 ? `${value}T00:00:00` : value;
  const date = new Date(safeValue);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export function parseDateString(value) {
  if (!value) return new Date();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const fallback = new Date(value);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return new Date();
}

export function formatDateInputValue(dateLike) {
  const date = dateLike instanceof Date ? dateLike : parseDateString(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function safeSlug(text) {
  const normalized = (text || "").toString().trim().toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "po";
}

export function buildPOFileBase(order) {
  const ordererSlug = safeSlug(order?.ordererName || "pemesan");
  const itemSlug = safeSlug(order?.primaryItemName || order?.itemName || "barang");
  const dateSlug = safeSlug(formatDateInputValue(new Date()));
  return `${ordererSlug}_${itemSlug}_${dateSlug}`;
}
