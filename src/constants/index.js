export const CATEGORY_COLORS = ["#2563EB", "#7C3AED", "#F97316", "#10B981", "#F43F5E"];

export const PO_STATUS_OPTIONS = ["PROGRESS", "DONE", "CANCELLED"];

export const PO_STATUS_STYLES = {
  PROGRESS: { background: "#FEF3C7", color: "#B45309", label: "Progress" },
  DONE: { background: "#DCFCE7", color: "#166534", label: "Done" },
  CANCELLED: { background: "#FEE2E2", color: "#B91C1C", label: "Cancelled" },
};

export function getPOStatusStyle(status) {
  return PO_STATUS_STYLES[status] || PO_STATUS_STYLES.PROGRESS;
}
