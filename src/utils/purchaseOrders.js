export function buildOrderItemLabel(primaryItemName, itemCount) {
  const normalizedName = (primaryItemName || "").trim();
  const totalItems = Number.isFinite(itemCount) ? Number(itemCount) : 0;
  if (totalItems <= 0) {
    return normalizedName || "Tanpa barang";
  }
  if (totalItems === 1) {
    return normalizedName || "Tanpa barang";
  }
  const formatNumber = value => Number(value ?? 0).toLocaleString("id-ID");
  if (!normalizedName) {
    return `${formatNumber(totalItems)} barang`;
  }
  const othersCount = totalItems - 1;
  return `${normalizedName} + ${formatNumber(othersCount)} lainnya`;
}
