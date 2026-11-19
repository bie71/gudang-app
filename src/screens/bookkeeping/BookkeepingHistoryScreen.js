import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { exec } from "../../services/database";
import { Card, EmptyState } from "../../components/ui";
import { formatCurrencyValue, formatDateTimeDisplay } from "../../utils/format";

export default function BookkeepingHistoryScreen() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await exec(`
          SELECT
            h.id,
            h.entry_id,
            h.change_amount,
            h.type,
            h.note,
            h.previous_amount,
            h.new_amount,
            h.created_at,
            b.name as entry_name
          FROM bookkeeping_entry_history h
          JOIN bookkeeping_entries b ON b.id = h.entry_id
          WHERE (h.deleted_at IS NULL OR h.deleted_at = '')
            AND (b.deleted_at IS NULL OR b.deleted_at = '')
          ORDER BY h.id DESC
          LIMIT 100
        `);
        const rows = [];
        for (let i = 0; i < res.rows.length; i++) {
          rows.push(res.rows.item(i));
        }
        setHistory(rows);
      } catch (e) {
        console.log("LOAD FULL BOOKKEEPING HISTORY ERROR:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const renderItem = ({ item }) => {
    const isEntry = item.type === "IN";
    return (
      <Card style={styles.card}>
        <View style={styles.leftRow}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: isEntry ? "#DCFCE7" : "#FEE2E2" },
            ]}
          >
            <Ionicons
              name={isEntry ? "arrow-down" : "arrow-up"}
              size={16}
              color={isEntry ? "#15803D" : "#B91C1C"}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.entryName}>{item.entry_name}</Text>
            <Text style={styles.date}>
              {formatDateTimeDisplay(item.created_at)}
            </Text>
            {Boolean(item.note) && (
              <Text style={styles.note}>{item.note}</Text>
            )}
          </View>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={[
              styles.amount,
              { color: isEntry ? "#15803D" : "#B91C1C" },
            ]}
          >
            {isEntry ? "+" : "-"}
            {formatCurrencyValue(item.change_amount)}
          </Text>
          <Text style={styles.afterBalance}>
            Saldo: {formatCurrencyValue(item.new_amount)}
          </Text>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0D9488" />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="time-outline"
              title="Belum Ada Riwayat"
              description="Mutasi saldo kas Anda akan tercatat secara detail di sini."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    padding: 14,
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  entryName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  date: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  note: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: "800",
  },
  afterBalance: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
});
