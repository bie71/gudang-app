const CSV_BOM = "\ufeff";

function escapeCsvValue(value) {
  if (value == null) return "";
  const str = String(value);
  if (!str.length) return "";
  const needsQuotes = /[",\n\r]/.test(str) || str.startsWith(" ") || str.endsWith(" ");
  const escaped = str.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function serializeToCsv(columns, rows) {
  if (!Array.isArray(columns) || !columns.length) {
    throw new Error("CSV columns definition is required");
  }
  const headers = columns.map(col => escapeCsvValue(col.header ?? col.key ?? ""));
  const lines = [headers.join(",")];
  const safeRows = Array.isArray(rows) ? rows : [];
  safeRows.forEach(row => {
    const values = columns.map(col => {
      const raw = typeof col.accessor === "function" ? col.accessor(row) : row[col.key];
      return escapeCsvValue(raw);
    });
    lines.push(values.join(","));
  });
  return `${CSV_BOM}${lines.join("\n")}`;
}

export function buildTimestampedFileBase(baseName, date = new Date()) {
  const safeBase = (baseName || "export").replace(/[^a-zA-Z0-9-_]/g, "-");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${safeBase}_${year}${month}${day}-${hours}${minutes}${seconds}`;
}

