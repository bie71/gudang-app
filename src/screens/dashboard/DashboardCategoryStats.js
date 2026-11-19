import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card, SectionHeader } from "../../components/ui";
import { formatCurrencyValue, formatNumberValue } from "../../utils/format";

export default function DashboardCategoryStats({
  categories = [],
  onNavigateItems,
}) {
  if (categories.length === 0) return null;

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Distribusi Kategori Barang"
        subtitle="Stok dan nilai berdasarkan kategori"
        actionLabel="Lihat Semua"
        onAction={onNavigateItems}
      />

      <View style={styles.cardGrid}>
        {categories.map((cat, idx) => (
          <Card key={String(cat.label || idx)} style={styles.catCard}>
            <Text style={styles.catTitle} numberOfLines={1}>
              {cat.label}
            </Text>
            <Text style={styles.catStock}>
              {formatNumberValue(cat.totalStock)} pcs
            </Text>
            <Text style={styles.catValue}>
              {formatCurrencyValue(cat.totalValue)}
            </Text>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 40,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  catCard: {
    width: "48%",
    flexGrow: 1,
    padding: 12,
  },
  catTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  catStock: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0D9488",
    marginTop: 4,
  },
  catValue: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
});
