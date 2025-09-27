import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Keyboard,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import ActionButton from "../../components/ActionButton";
import DatePickerField from "../../components/DatePickerField";
import DetailRow from "../../components/DetailRow";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import ViewShot from "react-native-view-shot";
import { exec } from "../../services/database";
import { saveFileToStorage, resolveShareableUri } from "../../services/files";
import { exportBookkeepingCsv } from "../../services/export";
import {
  buildBookkeepingReportFileBase,
  buildBookkeepingEntryImageFileBase,
  formatCurrencyValue,
  formatDateDisplay,
  formatDateTimeDisplay,
  formatDateInputValue,
  formatNumberInput,
  formatNumberValue,
  parseNumberInput,
} from "../../utils/format";

function buildDefaultReportRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: formatDateInputValue(start),
    endDate: formatDateInputValue(now),
  };
}

function escapeHtml(value) {
  if (value == null) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, char => map[char] || char);
}

function emitBookkeepingRefreshEvent(navigation) {
  const parent = typeof navigation?.getParent === "function" ? navigation.getParent() : null;
  if (!parent || typeof parent.emit !== "function") return;
  const targetKey = typeof parent.getState === "function" ? parent.getState().key : undefined;
  parent.emit({ type: "bookkeeping:refresh", target: targetKey });
}

export function BookkeepingScreen({ navigation }) {
  const PAGE_SIZE = 20;
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ totalEntries: 0, totalAmount: 0 });
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [reportModalState, setReportModalState] = useState(() => ({
    visible: false,
    ...buildDefaultReportRange(),
  }));
  const [reportGenerating, setReportGenerating] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [adjustModal, setAdjustModal] = useState({
    visible: false,
    mode: "ADD",
    entry: null,
    amount: "",
    note: "",
    loading: false,
  });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);
  const navigateToRoot = useCallback(
    (routeName, params) => {
      const parent = typeof navigation.getParent === "function" ? navigation.getParent() : null;
      if (parent?.navigate) parent.navigate(routeName, params);
      else navigation.navigate(routeName, params);
    },
    [navigation],
  );

  useEffect(() => {
    loadEntries({ search: searchTerm, reset: true });
    loadSummary();
  }, []);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      loadEntries({ search: searchTerm, reset: true });
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      loadEntries({ search: searchTerm, reset: true });
      loadSummary();
    });
    return unsubscribe;
  }, [navigation, searchTerm]);

  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return undefined;
    const unsubscribe = parent.addListener("bookkeeping:refresh", () => {
      loadEntries({ search: searchTerm, reset: true });
      loadSummary();
    });
    return unsubscribe;
  }, [navigation, searchTerm]);

  async function loadEntries({ search = searchTerm, reset = false, mode = "default" } = {}) {
    const normalizedSearch = (search || "").trim().toLowerCase();
    const isSearchChanged = normalizedSearch !== pagingRef.current.search;
    const shouldReset = reset || isSearchChanged;
    const offset = shouldReset ? 0 : pagingRef.current.offset;
    const limit = PAGE_SIZE + 1;
    const requestId = ++requestIdRef.current;

    if (mode === "refresh") setRefreshing(true);
    else if (mode === "loadMore") setLoadingMore(true);
    else setLoading(true);

    try {
      const res = await exec(
        `
          SELECT id, name, amount, entry_date, note
          FROM bookkeeping_entries
          WHERE (? = '' OR LOWER(name) LIKE ? OR LOWER(IFNULL(note,'')) LIKE ?)
          ORDER BY entry_date DESC, id DESC
          LIMIT ? OFFSET ?
        `,
        [normalizedSearch, `%${normalizedSearch}%`, `%${normalizedSearch}%`, limit, offset],
      );
      if (requestId !== requestIdRef.current) return;
      const rowsArray = res.rows?._array ?? [];
      const pageEntries = rowsArray.slice(0, PAGE_SIZE).map(row => ({
        id: row.id,
        name: row.name,
        amount: Number(row.amount ?? 0),
        entryDate: row.entry_date,
        note: row.note,
      }));
      const nextOffset = offset + pageEntries.length;
      setHasMore(rowsArray.length > PAGE_SIZE);
      setEntries(prev => (shouldReset ? pageEntries : [...prev, ...pageEntries]));
      pagingRef.current = { offset: nextOffset, search: normalizedSearch };
    } catch (error) {
      console.log("BOOKKEEPING LOAD ERROR:", error);
      if (mode === "default") {
        Alert.alert("Gagal", "Tidak dapat memuat data pembukuan.");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        if (mode === "refresh") setRefreshing(false);
        else if (mode === "loadMore") setLoadingMore(false);
        else setLoading(false);
      }
    }
  }

  async function loadSummary() {
    try {
      const res = await exec(`
        SELECT
          COUNT(*) as totalEntries,
          IFNULL(SUM(amount), 0) as totalAmount
        FROM bookkeeping_entries
      `);
      const row = res.rows.length ? res.rows.item(0) : {};
      setSummary({
        totalEntries: Number(row.totalEntries ?? 0),
        totalAmount: Number(row.totalAmount ?? 0),
      });
    } catch (error) {
      console.log("BOOKKEEPING SUMMARY ERROR:", error);
    }
  }

  const handleRefresh = () => {
    loadSummary();
    loadEntries({ search: searchTerm, reset: true, mode: "refresh" });
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadEntries({ search: searchTerm, reset: false, mode: "loadMore" });
    }
  };

  const openReportModal = () => {
    const defaults = buildDefaultReportRange();
    setReportModalState({ visible: true, ...defaults });
  };

  const closeReportModal = () => {
    if (reportGenerating) return;
    setReportModalState(prev => ({ ...prev, visible: false }));
  };

  const openAdjustModal = (entry, mode = "ADD") => {
    if (!entry) return;
    setAdjustModal({
      visible: true,
      mode,
      entry,
      amount: "",
      note: "",
      loading: false,
    });
  };

  const closeAdjustModal = () => {
    setAdjustModal({ visible: false, mode: "ADD", entry: null, amount: "", note: "", loading: false });
  };

  const handleAdjustAmountChange = text => {
    setAdjustModal(prev => ({ ...prev, amount: formatNumberInput(text) }));
  };

  const handleAdjustNoteChange = text => {
    setAdjustModal(prev => ({ ...prev, note: text }));
  };

  const handleAdjustSubmit = useCallback(async () => {
    const { entry, mode, amount, note, loading: submitting } = adjustModal;
    if (!entry || submitting) return;
    const parsedAmount = parseNumberInput(amount);
    if (parsedAmount <= 0) {
      Alert.alert("Validasi", "Nominal harus lebih dari 0.");
      return;
    }
    const delta = mode === "ADD" ? parsedAmount : -parsedAmount;
    setAdjustModal(prev => ({ ...prev, loading: true }));
    let transactionActive = false;
    try {
      await exec("BEGIN TRANSACTION");
      transactionActive = true;
      const currentRes = await exec(`SELECT amount FROM bookkeeping_entries WHERE id = ?`, [entry.id]);
      const currentRow = currentRes.rows.length ? currentRes.rows.item(0) : { amount: entry.amount ?? 0 };
      const currentAmount = Number(currentRow.amount ?? 0);
      const nextAmount = currentAmount + delta;
      await exec(`UPDATE bookkeeping_entries SET amount = ? WHERE id = ?`, [nextAmount, entry.id]);
      await exec(
        `INSERT INTO bookkeeping_entry_history (entry_id, change_amount, type, note, previous_amount, new_amount)` +
          ` VALUES (?,?,?,?,?,?)`,
        [
          entry.id,
          delta,
          mode,
          note && note.trim() ? note.trim() : null,
          currentAmount,
          nextAmount,
        ],
      );
      await exec("COMMIT");
      transactionActive = false;
      closeAdjustModal();
      loadSummary();
      loadEntries({ search: searchTerm, reset: true });
    } catch (error) {
      console.log("BOOKKEEPING ADJUST ERROR:", error);
      if (transactionActive) {
        try {
          await exec("ROLLBACK");
        } catch (rollbackError) {
          const message = String(rollbackError?.message || rollbackError);
          if (!message.includes("no transaction is active")) {
            console.log("BOOKKEEPING ADJUST ROLLBACK ERROR:", rollbackError);
          }
        }
      }
      setAdjustModal(prev => ({ ...prev, loading: false }));
      Alert.alert("Gagal", "Perubahan nominal tidak dapat disimpan.");
    }
  }, [adjustModal, loadEntries, loadSummary, searchTerm]);

  const handleGenerateReport = useCallback(async () => {
    const { startDate, endDate } = reportModalState;
    if (!startDate || !endDate) {
      Alert.alert("Validasi", "Tanggal mulai dan akhir wajib dipilih.");
      return;
    }
    if (startDate > endDate) {
      Alert.alert("Validasi", "Tanggal mulai tidak boleh melebihi tanggal akhir.");
      return;
    }
    setReportGenerating(true);
    try {
      const res = await exec(
        `
          SELECT id, name, amount, entry_date, note, created_at
          FROM bookkeeping_entries
          WHERE entry_date BETWEEN ? AND ?
          ORDER BY entry_date ASC, id ASC
        `,
        [startDate, endDate],
      );
      const rows = [];
      for (let i = 0; i < res.rows.length; i++) {
        const row = res.rows.item(i);
        rows.push({
          id: row.id,
          name: row.name,
          amount: Number(row.amount ?? 0),
          entryDate: row.entry_date,
          note: row.note,
          createdAt: row.created_at,
        });
      }
      if (!rows.length) {
        Alert.alert("Tidak Ada Data", "Tidak ada catatan pembukuan dalam rentang tanggal tersebut.");
        return;
      }
      const totalAmount = rows.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
      const startDisplay = formatDateDisplay(startDate);
      const endDisplay = formatDateDisplay(endDate);
      const rowsHtml = rows
        .map((entry, index) => {
          const noteText = entry.note ? escapeHtml(entry.note) : "-";
          return `
            <tr>
              <td class="col-index">${index + 1}</td>
              <td class="col-date">${escapeHtml(formatDateDisplay(entry.entryDate))}</td>
              <td class="col-name">${escapeHtml(entry.name)}</td>
              <td class="col-note">${noteText}</td>
              <td class="col-amount">${escapeHtml(formatCurrencyValue(entry.amount))}</td>
            </tr>
          `;
        })
        .join("");
      const fileBase = buildBookkeepingReportFileBase({ startDate, endDate });
      const html = `
        <!DOCTYPE html>
        <html lang="id">
          <head>
            <meta charset="utf-8" />
            <title>Laporan Pembukuan</title>
            <style>
              * { box-sizing: border-box; font-family: 'Inter', 'Helvetica', 'Arial', sans-serif; }
              .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
              .header h1 { margin: 0; font-size: 28px; }
              .card {padding: 8px}
              .range { color: #64748b; margin-top: 4px; font-size: 14px; }
              .summary { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
              .summary-item { background: #f8fafc; border-radius: 16px; padding: 16px 20px; flex: 1 1 220px; }
              .summary-item h2 { margin: 0 0 8px; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
              .summary-item p { margin: 0; font-size: 18px; font-weight: 600; }
              table { width: 100%; border-collapse: collapse; background: #e8edf1ff;}
              thead { background: #f8fafc; }
              th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
              th { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
              td { font-size: 14px; color: #0f172a; }
              .col-index { width: 48px; text-align: center; }
              .col-date { width: 180px; }
              .col-name { width: 220px; }
              .col-note { width: 450px; }
              .col-amount { width: 400px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
              tfoot td { font-weight: 700; color: #0f172a; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div>
                  <p style="letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin: 0 0 8px;">Laporan</p>
                  <h1>Laporan Pembukuan</h1>
                  <p class="range">${escapeHtml(startDisplay)} - ${escapeHtml(endDisplay)}</p>
                </div>
              </div>
              <div class="summary">
                <div class="summary-item">
                  <h2>Total Catatan</h2>
                  <p>${rows.length.toLocaleString("id-ID")}</p>
                </div>
                <div class="summary-item">
                  <h2>Total Nominal</h2>
                  <p>${escapeHtml(formatCurrencyValue(totalAmount))}</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th class="col-index">No</th>
                    <th class="col-date">Tanggal</th>
                    <th class="col-name">Nama</th>
                    <th class="col-note">Catatan</th>
                    <th class="col-amount">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="4" style="text-align: right;">Total</td>
                    <td class="col-amount">${escapeHtml(formatCurrencyValue(totalAmount))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html, base64: false, fileName: fileBase });
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } = await saveFileToStorage(
        uri,
        `${fileBase}.pdf`,
        "application/pdf",
      );
      if (await Sharing.isAvailableAsync()) {
        const shareUri = await resolveShareableUri(`${fileBase}-share.pdf`, uri, savedUri);
        if (shareUri) {
          await Sharing.shareAsync(shareUri, {
            mimeType: "application/pdf",
            dialogTitle: "Bagikan Laporan Pembukuan",
            UTI: "com.adobe.pdf",
          });
        }
      }
      const locationMessage = savedDisplayPath
        ? `File tersimpan di ${savedDisplayPath}.`
        : savedLocation === "external"
        ? "File tersimpan di folder yang kamu pilih."
        : `File tersimpan di ${savedUri}.`;
      const alertMessage = savedNotice ? `${savedNotice}\n\n${locationMessage}` : locationMessage;
      Alert.alert("Laporan Dibuat", alertMessage);
      setReportModalState(prev => ({ ...prev, visible: false }));
    } catch (error) {
      console.log("BOOKKEEPING REPORT ERROR:", error);
      Alert.alert("Gagal", "Laporan tidak dapat dibuat saat ini.");
    } finally {
      setReportGenerating(false);
    }
  }, [reportModalState]);

  const handleExportCsv = useCallback(async () => {
    if (csvExporting) return;
    setCsvExporting(true);
    try {
      const result = await exportBookkeepingCsv();
      if (result.shareUri) {
        await Sharing.shareAsync(result.shareUri, {
          mimeType: "text/csv",
          dialogTitle: "Bagikan CSV Pembukuan",
        });
      }
      const locationMessage = result.displayPath
        ? `File tersimpan di ${result.displayPath}.`
        : result.location === "external"
        ? "File tersimpan di folder yang kamu pilih."
        : `File tersimpan di ${result.uri}.`;
      const alertMessage = result.notice ? `${result.notice}\n\n${locationMessage}` : locationMessage;
      Alert.alert("Berhasil", alertMessage);
    } catch (error) {
      console.log("EXPORT BOOKKEEPING CSV ERROR:", error);
      Alert.alert("Gagal", "CSV pembukuan tidak dapat dibuat saat ini.");
    } finally {
      setCsvExporting(false);
    }
  }, [csvExporting]);

  const renderItem = ({ item }) => (
    <View
      style={{
        backgroundColor: "#fff",
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginBottom: 10,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() =>
          navigateToRoot("BookkeepingDetail", {
            entryId: item.id,
            initialEntry: item,
          })
        }
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontWeight: "700", color: "#0F172A", marginBottom: 4 }}>{item.name}</Text>
            <Text style={{ color: "#64748B", fontSize: 12 }}>{formatDateDisplay(item.entryDate)}</Text>
            {item.note ? (
              <Text style={{ color: "#475569", marginTop: 6 }} numberOfLines={2}>
                {item.note}
              </Text>
            ) : null}
          </View>
          <Text style={{ color: "#2563EB", fontWeight: "700" }}>{formatCurrencyValue(item.amount)}</Text>
        </View>
      </TouchableOpacity>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <TouchableOpacity
          onPress={() => openAdjustModal(item, "ADD")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#22C55E",
            alignItems: "center",
            backgroundColor: "#F0FDF4",
          }}
        >
          <Text style={{ color: "#15803D", fontWeight: "600" }}>+ Tambah</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openAdjustModal(item, "SUBTRACT")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#F87171",
            alignItems: "center",
            backgroundColor: "#FEF2F2",
          }}
        >
          <Text style={{ color: "#DC2626", fontWeight: "600" }}>- Kurangi</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const adjustModeLabel = adjustModal.mode === "ADD" ? "Tambah Nominal" : "Kurangi Nominal";
  const adjustAmountValue = parseNumberInput(adjustModal.amount);
  const adjustCurrentAmount = Number(adjustModal.entry?.amount ?? 0);
  const adjustNextAmount =
    adjustModal.mode === "SUBTRACT"
      ? adjustCurrentAmount - adjustAmountValue
      : adjustCurrentAmount + adjustAmountValue;
  const modalBottomInset = Math.max(insets.bottom, 5);
  useEffect(() => {
    if (!adjustModal.visible) {
      setKeyboardInset(0);
      return undefined;
    }
    const showEvent = Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
    const hideEvent = Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";
    const showSub = Keyboard.addListener(showEvent, event => {
      const height = event?.endCoordinates?.height ?? 0;
      const adjusted = Math.max(0, height - insets.bottom);
      setKeyboardInset(adjusted);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));
    return () => {
      showSub?.remove();
      hideSub?.remove();
      setKeyboardInset(0);
    };
  }, [adjustModal.visible, insets.bottom]);
  const keyboardPadding = keyboardInset > 0 ? keyboardInset -110: 0;
  const containerPaddingBottom = modalBottomInset + keyboardPadding;
  const keyboardVerticalOffset = Platform.select({
    ios: insets.top + 24,
    android: modalBottomInset,
    default: modalBottomInset,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A", marginBottom: 12 }}>Pembukuan</Text>

        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: "#fff",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              padding: 16,
            }}
          >
            <Text style={{ color: "#94A3B8", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.08 }}>Catatan</Text>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A", marginTop: 6 }}>
              {formatNumberValue(summary.totalEntries)}
            </Text>
            <Text style={{ color: "#64748B", marginTop: 4 }}>Total catatan tersimpan</Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: "#fff",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              padding: 16,
            }}
          >
            <Text style={{ color: "#94A3B8", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.08 }}>Nominal</Text>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A", marginTop: 6 }}>
              {formatCurrencyValue(summary.totalAmount)}
            </Text>
            <Text style={{ color: "#64748B", marginTop: 4 }}>Akumulasi nominal</Text>
          </View>
        </View>

        <TextInput
          placeholder="Cari nama atau catatan…"
          value={searchTerm}
          onChangeText={setSearchTerm}
          style={{
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: "#E5E7EB",
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 44,
            marginBottom: 12,
          }}
          placeholderTextColor="#94A3B8"
        />

        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={openReportModal}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#0EA5E9",
              paddingHorizontal: 16,
              borderRadius: 12,
              height: 44,
            }}
          >
            <Ionicons name="document-text-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ color: "#fff", fontWeight: "700" }}>Laporan PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleExportCsv}
            disabled={csvExporting}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: csvExporting ? "#94A3B8" : "#16A34A",
              paddingHorizontal: 16,
              borderRadius: 12,
              height: 44,
            }}
          >
            {csvExporting ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
            ) : (
              <Ionicons name="download-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={{ color: "#fff", fontWeight: "700" }}>Ekspor CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              navigateToRoot("AddBookkeeping", {
              })
            }
            style={{
              flex: 1,
              backgroundColor: "#2563EB",
              paddingHorizontal: 16,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              height: 44,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>+ Pembukuan</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={entries}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color="#2563EB" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingVertical: 40 }}>
                <ActivityIndicator color="#2563EB" />
              </View>
            ) : (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Ionicons name="document-text-outline" size={32} color="#CBD5F5" />
                <Text style={{ color: "#94A3B8", marginTop: 8 }}>
                  {searchTerm.trim() ? "Tidak ada catatan yang cocok." : "Belum ada catatan pembukuan."}
                </Text>
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      </View>

      <Modal
        visible={adjustModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeAdjustModal}
        statusBarTranslucent
      >
        <Pressable
          onPress={closeAdjustModal}
          style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)" }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: containerPaddingBottom,
            shadowColor: "#0F172A",
            shadowOpacity: 0.1,
            shadowRadius: 18,
            elevation: 6,
            maxHeight: "80%",
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: containerPaddingBottom }}
            scrollIndicatorInsets={{ bottom: containerPaddingBottom }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>{adjustModeLabel}</Text>
                <Text style={{ color: "#64748B", marginTop: 4 }}>{adjustModal.entry?.name || "-"}</Text>
              </View>
              <TouchableOpacity onPress={closeAdjustModal} disabled={adjustModal.loading}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: "#0F172A", fontWeight: "600", marginTop: 12 }}>
              Saldo saat ini: {formatCurrencyValue(adjustCurrentAmount)}
            </Text>
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: "#64748B", marginBottom: 6 }}>Nominal</Text>
              <TextInput
                value={adjustModal.amount}
                onChangeText={handleAdjustAmountChange}
                placeholder="contoh: 250000"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  height: 44,
                }}
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: "#64748B", marginBottom: 6 }}>Catatan (opsional)</Text>
              <TextInput
                value={adjustModal.note}
                onChangeText={handleAdjustNoteChange}
                placeholder="contoh: Penyesuaian kas"
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  minHeight: 96,
                  textAlignVertical: "top",
                }}
                placeholderTextColor="#94A3B8"
                multiline
              />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
              <Text style={{ color: "#64748B" }}>Saldo setelah update</Text>
              <Text style={{ color: "#0F172A", fontWeight: "700" }}>{formatCurrencyValue(adjustNextAmount)}</Text>
            </View>
            <TouchableOpacity
              onPress={handleAdjustSubmit}
              disabled={adjustModal.loading}
              style={{
                marginTop: 18,
                backgroundColor: adjustModal.loading ? "#93C5FD" : "#2563EB",
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              {adjustModal.loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700" }}>Simpan Perubahan</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={closeAdjustModal}
              disabled={adjustModal.loading}
              style={{
                marginTop: 12,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#CBD5F5",
              }}
            >
              <Text style={{ color: "#2563EB", fontWeight: "600" }}>Batal</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={reportModalState.visible}
        transparent
        animationType="fade"
        onRequestClose={closeReportModal}
        statusBarTranslucent
      >
        <Pressable
          onPress={closeReportModal}
          style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.55)" }}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 24,
            shadowColor: "#0F172A",
            shadowOpacity: 0.12,
            shadowRadius: 16,
            elevation: 6,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Laporan Pembukuan</Text>
            <TouchableOpacity onPress={closeReportModal} disabled={reportGenerating}>
              <Ionicons name="close" size={22} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <Text style={{ color: "#64748B", marginTop: 6 }}>
            Pilih rentang tanggal untuk membuat laporan pembukuan dalam format PDF.
          </Text>
          <View style={{ marginTop: 18 }}>
            <DatePickerField
              label="Tanggal Mulai"
              value={reportModalState.startDate}
              onChange={value => setReportModalState(prev => ({ ...prev, startDate: value }))}
            />
            <DatePickerField
              label="Tanggal Akhir"
              value={reportModalState.endDate}
              onChange={value => setReportModalState(prev => ({ ...prev, endDate: value }))}
            />
          </View>
          <TouchableOpacity
            onPress={handleGenerateReport}
            disabled={reportGenerating}
            style={{
              marginTop: 12,
              backgroundColor: reportGenerating ? "#93C5FD" : "#2563EB",
              paddingVertical: 14,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            {reportGenerating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700" }}>Generate PDF</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export function AddBookkeepingScreen({ route, navigation }) {
  const initialEntry = route.params?.entry || null;
  const [entryId, setEntryId] = useState(initialEntry?.id ?? null);
  const [name, setName] = useState(initialEntry?.name ?? "");
  const [amount, setAmount] = useState(
    initialEntry ? formatNumberInput(String(initialEntry.amount ?? "")) : "",
  );
  const [entryDate, setEntryDate] = useState(initialEntry?.entryDate || formatDateInputValue(new Date()));
  const [note, setNote] = useState(initialEntry?.note ?? "");

  useEffect(() => {
    if (initialEntry) {
      setEntryId(initialEntry.id);
      setName(initialEntry.name || "");
      setAmount(formatNumberInput(String(initialEntry.amount ?? "")));
      setEntryDate(initialEntry.entryDate || formatDateInputValue(new Date()));
      setNote(initialEntry.note || "");
      navigation.setOptions({ title: "Edit Pembukuan" });
    } else {
      resetForm();
    }
  }, [initialEntry?.id, navigation]);

  function resetForm() {
    setEntryId(null);
    setName("");
    setAmount("");
    setEntryDate(formatDateInputValue(new Date()));
    setNote("");
    navigation.setOptions({ title: "Tambah Pembukuan" });
  }

  const isEdit = Boolean(entryId);

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Validasi", "Nama pembukuan wajib diisi.");
      return;
    }
    if (!entryDate) {
      Alert.alert("Validasi", "Tanggal wajib diisi.");
      return;
    }
    const parsedAmount = parseNumberInput(amount);
    if (parsedAmount <= 0) {
      Alert.alert("Validasi", "Nominal harus lebih dari 0.");
      return;
    }
    const trimmedNote = note && note.trim() ? note.trim() : null;
    try {
      if (isEdit) {
        const currentRes = await exec(`SELECT amount FROM bookkeeping_entries WHERE id = ?`, [entryId]);
        const currentAmount = currentRes.rows.length ? Number(currentRes.rows.item(0).amount ?? 0) : 0;
        await exec(
          `UPDATE bookkeeping_entries SET name = ?, amount = ?, entry_date = ?, note = ? WHERE id = ?`,
          [trimmedName, parsedAmount, entryDate, trimmedNote, entryId],
        );
        if (currentAmount !== parsedAmount) {
          const delta = parsedAmount - currentAmount;
          await exec(
            `INSERT INTO bookkeeping_entry_history (entry_id, change_amount, type, note, previous_amount, new_amount)` +
              ` VALUES (?,?,?,?,?,?)`,
            [entryId, delta, "EDIT", trimmedNote, currentAmount, parsedAmount],
          );
        }
      } else {
        const insertRes = await exec(
          `INSERT INTO bookkeeping_entries (name, amount, entry_date, note) VALUES (?,?,?,?)`,
          [trimmedName, parsedAmount, entryDate, trimmedNote],
        );
        const newId = insertRes.insertId;
        if (newId) {
          await exec(
            `INSERT INTO bookkeeping_entry_history (entry_id, change_amount, type, note, previous_amount, new_amount)` +
              ` VALUES (?,?,?,?,?,?)`,
            [newId, parsedAmount, "CREATE", trimmedNote, 0, parsedAmount],
          );
        }
      }
      emitBookkeepingRefreshEvent(navigation);
      navigation.goBack();
    } catch (error) {
      console.log("BOOKKEEPING SAVE ERROR:", error);
      Alert.alert("Gagal", "Data pembukuan tidak dapat disimpan.");
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <FormScrollContainer contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 12 }}>
          {isEdit ? "Edit Pembukuan" : "Tambah Pembukuan"}
        </Text>
        <Input
          label="Nama Pembukuan"
          value={name}
          onChangeText={setName}
          placeholder="contoh: Penjualan harian"
        />
        <Input
          label="Nominal (Rp)"
          value={amount}
          onChangeText={text => setAmount(formatNumberInput(text))}
          keyboardType="numeric"
          placeholder="contoh: 1500000"
        />
        <DatePickerField label="Tanggal" value={entryDate} onChange={setEntryDate} />
        <Input
          label="Catatan (opsional)"
          value={note}
          onChangeText={setNote}
          placeholder="contoh: Pembayaran tunai"
          multiline
          style={{ height: 100, textAlignVertical: "top", paddingTop: 12 }}
        />
        <TouchableOpacity
          onPress={save}
          style={{
            marginTop: 16,
            backgroundColor: "#2563EB",
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            {isEdit ? "Simpan Perubahan" : "Simpan"}
          </Text>
        </TouchableOpacity>
        {isEdit ? (
          <TouchableOpacity
            onPress={resetForm}
            style={{
              marginTop: 12,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#CBD5F5",
            }}
          >
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Buat Catatan Baru</Text>
          </TouchableOpacity>
        ) : null}
      </FormScrollContainer>
    </SafeAreaView>
  );
}

export function BookkeepingDetailScreen({ route, navigation }) {
  const entryIdParam = route.params?.entryId;
  const initialEntry = route.params?.initialEntry;
  const insets = useSafeAreaInsets();
  const normalizeEntry = useCallback(data => {
    if (!data) return null;
    return {
      id: data.id,
      name: data.name || "",
      amount: Number(data.amount ?? 0),
      entryDate: data.entryDate || data.entry_date || formatDateInputValue(new Date()),
      note: data.note || "",
      createdAt: data.createdAt || data.created_at || null,
    };
  }, []);

  const [entry, setEntry] = useState(() => normalizeEntry(initialEntry));
  const [history, setHistory] = useState([]);
  const [historyMeta, setHistoryMeta] = useState({ totalCount: 0, adjustmentCount: 0, initialAmount: null });
  const [loading, setLoading] = useState(() => !initialEntry);
  const [adjustModal, setAdjustModal] = useState({
    visible: false,
    mode: "ADD",
    amount: "",
    note: "",
    loading: false,
  });
  const [reportGenerating, setReportGenerating] = useState(false);
  const reportShotRef = useRef(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const entryId = Number(entryIdParam);
  const HISTORY_LIMIT = 50;

  useEffect(() => {
    if (!adjustModal.visible) {
      setKeyboardInset(0);
      return () => undefined;
    }
    const showEvent = Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow";
    const hideEvent = Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide";
    const showSub = Keyboard.addListener(showEvent, event => {
      const height = event?.endCoordinates?.height ?? 0;
      const adjusted = Math.max(0, height - insets.bottom);
      setKeyboardInset(adjusted);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));
    return () => {
      showSub?.remove();
      hideSub?.remove();
      setKeyboardInset(0);
    };
  }, [adjustModal.visible, insets.bottom]);

  const load = useCallback(async () => {
    if (!Number.isFinite(entryId)) {
      setEntry(null);
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await exec(
        `SELECT id, name, amount, entry_date, note, created_at FROM bookkeeping_entries WHERE id = ?`,
        [entryId],
      );
      if (!res.rows.length) {
        setEntry(null);
        setHistory([]);
        setHistoryMeta({ totalCount: 0, adjustmentCount: 0, initialAmount: null });
        return;
      }
      const row = res.rows.item(0);
      const normalized = normalizeEntry({
        id: row.id,
        name: row.name,
        amount: row.amount,
        entryDate: row.entry_date,
        note: row.note,
        createdAt: row.created_at,
      });
      setEntry(normalized);
      const historyRes = await exec(
        `
          SELECT id, change_amount, type, note, previous_amount, new_amount, created_at
          FROM bookkeeping_entry_history
          WHERE entry_id = ?
          ORDER BY id DESC
          LIMIT ?
        `,
        [entryId, HISTORY_LIMIT],
      );
      const historyRows = [];
      for (let i = 0; i < historyRes.rows.length; i++) {
        const historyRow = historyRes.rows.item(i);
        historyRows.push({
          id: historyRow.id,
          changeAmount: Number(historyRow.change_amount ?? 0),
          type: historyRow.type,
          note: historyRow.note,
          previousAmount: Number(historyRow.previous_amount ?? 0),
          newAmount: Number(historyRow.new_amount ?? 0),
          createdAt: historyRow.created_at,
        });
      }
      setHistory(historyRows);

      let totalCount = historyRows.length;
      let adjustmentCount = historyRows.filter(item => item.type !== "CREATE").length;
      let initialAmountMeta = historyRows.length
        ? Number(
            historyRows[historyRows.length - 1].newAmount ??
              historyRows[historyRows.length - 1].previousAmount ??
              normalized.amount ?? 0,
          )
        : Number(normalized.amount ?? 0);

      try {
        const metaRes = await exec(
          `
            SELECT
              COUNT(*) as total_count,
              SUM(CASE WHEN type <> 'CREATE' THEN 1 ELSE 0 END) as adjustment_count
            FROM bookkeeping_entry_history
            WHERE entry_id = ?
          `,
          [entryId],
        );
        if (metaRes.rows.length) {
          const metaRow = metaRes.rows.item(0);
          const metaTotal = Number(metaRow.total_count);
          const metaAdjust = Number(metaRow.adjustment_count);
          if (Number.isFinite(metaTotal)) totalCount = metaTotal;
          if (Number.isFinite(metaAdjust)) adjustmentCount = metaAdjust;
        }

        if (totalCount > 0) {
          const earliestRes = await exec(
            `
              SELECT previous_amount, new_amount
              FROM bookkeeping_entry_history
              WHERE entry_id = ?
              ORDER BY id ASC
              LIMIT 1
            `,
            [entryId],
          );
          if (earliestRes.rows.length) {
            const earliestRow = earliestRes.rows.item(0);
            const baseAmountRaw =
              earliestRow.new_amount != null
                ? Number(earliestRow.new_amount)
                : earliestRow.previous_amount != null
                ? Number(earliestRow.previous_amount)
                : initialAmountMeta;
            if (Number.isFinite(baseAmountRaw)) initialAmountMeta = baseAmountRaw;
          }
        }
      } catch (metaError) {
        console.log("BOOKKEEPING DETAIL HISTORY META ERROR:", metaError);
      }

      setHistoryMeta({
        totalCount: Number.isFinite(totalCount) ? totalCount : historyRows.length,
        adjustmentCount: Number.isFinite(adjustmentCount) ? adjustmentCount : 0,
        initialAmount: Number.isFinite(initialAmountMeta) ? initialAmountMeta : Number(normalized.amount ?? 0),
      });
    } catch (error) {
      console.log("BOOKKEEPING DETAIL LOAD ERROR:", error);
      setHistoryMeta({ totalCount: 0, adjustmentCount: 0, initialAmount: null });
    } finally {
      setLoading(false);
    }
  }, [entryId, normalizeEntry]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  const refreshParent = useCallback(() => {
    emitBookkeepingRefreshEvent(navigation);
  }, [navigation]);

  const handleGenerateReportImage = useCallback(async () => {
    if (!entry) return;
    const viewShot = reportShotRef.current;
    if (!viewShot || typeof viewShot.capture !== "function") {
      Alert.alert("Gagal", "Pratinjau laporan belum siap.");
      return;
    }
    try {
      setReportGenerating(true);
      const tempUri = await viewShot.capture({ format: "png", quality: 1 });
      const fileBase = buildBookkeepingEntryImageFileBase(entry);
      const fileName = `${fileBase}.png`;
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } =
        await saveFileToStorage(tempUri, fileName, "image/png");
      if (await Sharing.isAvailableAsync()) {
        const shareUri = await resolveShareableUri(`${fileBase}-share.png`, tempUri, savedUri);
        if (shareUri) {
          await Sharing.shareAsync(shareUri, {
            mimeType: "image/png",
            dialogTitle: "Bagikan Laporan Pembukuan (PNG)",
          });
        }
      }
      const locationMessage = savedDisplayPath
        ? `File tersimpan di ${savedDisplayPath}.`
        : savedLocation === "external"
        ? "File tersimpan di folder yang kamu pilih."
        : `File tersimpan di ${savedUri}.`;
      const alertMessage = savedNotice ? `${savedNotice}\n\n${locationMessage}` : locationMessage;
      Alert.alert("Gambar Disimpan", alertMessage);
    } catch (error) {
      console.log("BOOKKEEPING REPORT IMAGE ERROR:", error);
      Alert.alert("Gagal", "Gambar laporan tidak dapat dibuat.");
    } finally {
      setReportGenerating(false);
    }
  }, [entry]);

  const openAdjustModal = useCallback(
    mode => {
      if (!entry) return;
      setAdjustModal({ visible: true, mode, amount: "", note: "", loading: false });
    },
    [entry],
  );

  const closeAdjustModal = useCallback(() => {
    setAdjustModal({ visible: false, mode: "ADD", amount: "", note: "", loading: false });
  }, []);

  const handleAdjustAmountChange = text => {
    setAdjustModal(prev => ({ ...prev, amount: formatNumberInput(text) }));
  };

  const handleAdjustNoteChange = text => {
    setAdjustModal(prev => ({ ...prev, note: text }));
  };

  const handleAdjustSubmit = useCallback(async () => {
    if (!entry) return;
    const { mode, amount, note, loading: submitting } = adjustModal;
    if (submitting) return;
    const parsedAmount = parseNumberInput(amount);
    if (parsedAmount <= 0) {
      Alert.alert("Validasi", "Nominal harus lebih dari 0.");
      return;
    }
    const delta = mode === "ADD" ? parsedAmount : -parsedAmount;
    setAdjustModal(prev => ({ ...prev, loading: true }));
    let transactionActive = false;
    try {
      await exec("BEGIN TRANSACTION");
      transactionActive = true;
      const currentRes = await exec(`SELECT amount FROM bookkeeping_entries WHERE id = ?`, [entry.id]);
      const currentRow = currentRes.rows.length ? currentRes.rows.item(0) : { amount: entry.amount ?? 0 };
      const currentAmount = Number(currentRow.amount ?? 0);
      const nextAmount = currentAmount + delta;
      await exec(`UPDATE bookkeeping_entries SET amount = ? WHERE id = ?`, [nextAmount, entry.id]);
      await exec(
        `INSERT INTO bookkeeping_entry_history (entry_id, change_amount, type, note, previous_amount, new_amount)` +
          ` VALUES (?,?,?,?,?,?)`,
        [
          entry.id,
          delta,
          mode,
          note && note.trim() ? note.trim() : null,
          currentAmount,
          nextAmount,
        ],
      );
      await exec("COMMIT");
      transactionActive = false;
      closeAdjustModal();
      refreshParent();
      load();
    } catch (error) {
      console.log("BOOKKEEPING DETAIL ADJUST ERROR:", error);
      if (transactionActive) {
        try {
          await exec("ROLLBACK");
        } catch (rollbackError) {
          const message = String(rollbackError?.message || rollbackError);
          if (!message.includes("no transaction is active")) {
            console.log("BOOKKEEPING DETAIL ADJUST ROLLBACK ERROR:", rollbackError);
          }
        }
      }
      setAdjustModal(prev => ({ ...prev, loading: false }));
      Alert.alert("Gagal", "Nominal tidak dapat diperbarui.");
    }
  }, [adjustModal, entry, closeAdjustModal, load, refreshParent]);

  const handleEdit = useCallback(() => {
    if (!entry) return;
    navigation.navigate("AddBookkeeping", {
      entry,
    });
  }, [entry, navigation]);

  const openFullHistory = useCallback(() => {
    if (!entry) return;
    navigation.navigate("BookkeepingHistory", {
      entryId: entry.id,
      entryName: entry.name,
    });
  }, [entry, navigation]);

  const confirmDelete = useCallback(() => {
    if (!entry) return;
    Alert.alert(
      "Hapus Pembukuan",
      `Yakin ingin menghapus ${entry.name || "catatan ini"}?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await exec(`DELETE FROM bookkeeping_entries WHERE id = ?`, [entry.id]);
              refreshParent();
              navigation.goBack();
            } catch (error) {
              console.log("BOOKKEEPING DELETE ERROR:", error);
              Alert.alert("Gagal", "Catatan tidak dapat dihapus.");
            }
          },
        },
      ],
    );
  }, [entry, navigation, refreshParent]);

  if (loading && !entry) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#2563EB" />
        <Text style={{ marginTop: 12, color: "#64748B" }}>Memuat detail…</Text>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#F8FAFC",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Ionicons name="document-text-outline" size={42} color="#CBD5F5" />
        <Text style={{ marginTop: 12, color: "#94A3B8", textAlign: "center" }}>Catatan pembukuan tidak ditemukan.</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            marginTop: 18,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: "#2563EB",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Kembali</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const formattedAmount = formatCurrencyValue(entry.amount);
  const formattedDate = formatDateDisplay(entry.entryDate);
  const createdDisplay = entry.createdAt ? formatDateDisplay(entry.createdAt) : "-";
  const noteDisplay = entry.note && entry.note.trim() ? entry.note : "-";
  const adjustModeLabel = adjustModal.mode === "ADD" ? "Tambah Nominal" : "Kurangi Nominal";
  const adjustAmountValue = parseNumberInput(adjustModal.amount);
  const adjustCurrentAmount = Number(entry.amount ?? 0);
  const adjustNextAmount =
    adjustModal.mode === "SUBTRACT"
      ? adjustCurrentAmount - adjustAmountValue
      : adjustCurrentAmount + adjustAmountValue;
  const windowWidth = Dimensions.get("window").width;
  const reportWidth = Math.max(windowWidth - 48, 640);
  const historyPreviewLimit = 15;
  const historyPreview = history.slice(0, historyPreviewLimit);
  const totalHistoryCount = Number.isFinite(Number(historyMeta.totalCount))
    ? Number(historyMeta.totalCount)
    : history.length;
  const totalAdjustments = Number.isFinite(Number(historyMeta.adjustmentCount))
    ? Number(historyMeta.adjustmentCount)
    : history.filter(item => item.type !== "CREATE").length;
  const lastUpdatedDisplay = history.length
    ? formatDateTimeDisplay(history[0].createdAt)
    : entry.createdAt
    ? formatDateTimeDisplay(entry.createdAt)
    : "-";
  const fallbackInitialAmount = history.length
    ? Number(
        history[history.length - 1].newAmount ??
          history[history.length - 1].previousAmount ??
          adjustCurrentAmount,
      )
    : adjustCurrentAmount;
  const initialAmountRaw = Number(historyMeta.initialAmount);
  const initialAmount = Number.isFinite(initialAmountRaw) ? initialAmountRaw : fallbackInitialAmount;
  const netChange = adjustCurrentAmount - initialAmount;
  const netChangeLabel = `${netChange >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(netChange))}`;
  const historyPreviewNotice =
    totalHistoryCount > historyPreview.length
      ? `Menampilkan ${formatNumberValue(historyPreview.length)} dari ${formatNumberValue(totalHistoryCount)} riwayat terbaru`
      : totalHistoryCount
      ? `Menampilkan ${formatNumberValue(historyPreview.length)} riwayat`
      : "Tidak ada riwayat";
  const showFullHistoryButton =
    totalHistoryCount > historyPreview.length || history.length > historyPreviewLimit;
  const modalBottomInset = Math.max(insets.bottom, 16);
  const keyboardPadding = keyboardInset > 0 ? keyboardInset - 110 : 0;
  const containerPaddingBottom = modalBottomInset + keyboardPadding;
  const keyboardVerticalOffset = Platform.select({
    ios: insets.top + 24,
    android: modalBottomInset,
    default: modalBottomInset,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View
          style={{
            backgroundColor: "#fff",
            padding: 18,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A" }}>{entry.name}</Text>
          <View style={{ marginTop: 18, gap: 14 }}>
            <DetailRow label="Tanggal" value={formattedDate} />
            <DetailRow label="Nominal" value={formattedAmount} bold />
            <DetailRow label="Catatan" value={noteDisplay} multiline />
            <DetailRow label="Dibuat" value={createdDisplay} />
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 12,
            rowGap: 12,
            marginBottom: 20,
          }}
        >
          <ActionButton
            label="Laporan PNG"
            onPress={handleGenerateReportImage}
            color="#0EA5E9"
            loading={reportGenerating}
          />
          <ActionButton label="Tambah Nominal" onPress={() => openAdjustModal("ADD")} color="#16A34A" />
          <ActionButton label="Kurangi Nominal" onPress={() => openAdjustModal("SUBTRACT")} color="#F97316" />
          <ActionButton label="Edit" onPress={handleEdit} color="#2563EB" />
          <ActionButton label="Hapus" onPress={confirmDelete} color="#E11D48" />
        </View>
        <View
          style={{
            backgroundColor: "#fff",
            padding: 18,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E2E8F0",
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Riwayat Perubahan</Text>
            {historyPreview.length ? (
              <Text style={{ color: "#94A3B8", fontSize: 12 }}>{historyPreviewNotice}</Text>
            ) : null}
          </View>
          {historyPreview.length ? (
            <View style={{ marginTop: 12, gap: 12 }}>
              {historyPreview.map(item => {
                const changeColor = item.changeAmount >= 0 ? "#16A34A" : "#DC2626";
                const changeLabel = `${item.changeAmount >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(item.changeAmount))}`;
                const typeLabel =
                  item.type === "ADD"
                    ? "Penambahan"
                    : item.type === "SUBTRACT"
                    ? "Pengurangan"
                    : item.type === "CREATE"
                    ? "Catatan Baru"
                    : item.type === "EDIT"
                    ? "Perubahan"
                    : item.type;
                return (
                  <View key={item.id} style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 12 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: changeColor, fontWeight: "700" }}>{changeLabel}</Text>
                      <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                        {formatDateTimeDisplay(item.createdAt)}
                      </Text>
                    </View>
                    <Text style={{ color: "#0F172A", marginTop: 6, fontWeight: "600" }}>
                      Saldo: {formatCurrencyValue(item.newAmount)}
                    </Text>
                    <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>
                      Sebelumnya: {formatCurrencyValue(item.previousAmount)}
                    </Text>
                    <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>Jenis: {typeLabel}</Text>
                    {item.note ? (
                      <Text style={{ color: "#64748B", marginTop: 6 }}>{item.note}</Text>
                    ) : null}
                  </View>
                );
              })}
              {showFullHistoryButton ? (
                <TouchableOpacity
                  onPress={openFullHistory}
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 4,
                    backgroundColor: "#2563EB",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Lihat semua riwayat</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <Ionicons name="time-outline" size={28} color="#CBD5F5" />
              <Text style={{ color: "#94A3B8", marginTop: 8 }}>Belum ada riwayat penyesuaian.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={{ position: "absolute", top: -9999, left: -9999 }}>
        <ViewShot
          ref={reportShotRef}
          collapsable={false}
          style={{ width: reportWidth }}
        >
          <View style={{ backgroundColor: "#F8FAFC", padding: 24, gap: 16 }}>
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ color: "#0EA5E9", fontWeight: "700", letterSpacing: 0.08, textTransform: "uppercase", fontSize: 12 }}>
                Laporan Pembukuan
              </Text>
              <Text style={{ color: "#0F172A", fontWeight: "700", fontSize: 26 }}>{entry.name}</Text>
              <Text style={{ color: "#64748B" }}>Tanggal catatan: {formattedDate}</Text>
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: "#64748B", fontSize: 12, letterSpacing: 0.08, textTransform: "uppercase" }}>
                  Saldo saat ini
                </Text>
                <Text style={{ color: "#0F172A", fontWeight: "700", fontSize: 24, marginTop: 4 }}>{formattedAmount}</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                {[
                  { label: "Saldo awal", value: formatCurrencyValue(initialAmount) },
                  { label: "Perubahan bersih", value: netChangeLabel },
                  { label: "Total penyesuaian", value: `${formatNumberValue(totalAdjustments)}x` },
                  { label: "Update terakhir", value: lastUpdatedDisplay },
                ].map(stat => (
                  <View
                    key={stat.label}
                    style={{
                      backgroundColor: "#F1F5F9",
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      minWidth: 180,
                    }}
                  >
                    <Text style={{ color: "#64748B", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.08 }}>
                      {stat.label}
                    </Text>
                    <Text style={{ color: "#0F172A", fontWeight: "700", marginTop: 4 }}>{stat.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                padding: 24,
                gap: 10,
              }}
            >
              <Text style={{ color: "#0F172A", fontWeight: "700", fontSize: 18 }}>Catatan</Text>
              <Text style={{ color: "#475569", fontSize: 14 }}>{noteDisplay}</Text>
            </View>

            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "#E2E8F0",
                padding: 24,
                gap: 12,
              }}
            >
              <Text style={{ color: "#0F172A", fontWeight: "700", fontSize: 18 }}>Riwayat Terbaru</Text>
              <Text style={{ color: "#94A3B8", fontSize: 12 }}>{historyPreviewNotice}</Text>
              {historyPreview.length ? (
                <View style={{ gap: 12 }}>
                  {historyPreview.map(item => {
                    const changeColor = item.changeAmount >= 0 ? "#16A34A" : "#DC2626";
                    const changeLabel = `${item.changeAmount >= 0 ? "+" : "-"} ${formatCurrencyValue(
                      Math.abs(item.changeAmount),
                    )}`;
                    const typeLabel =
                      item.type === "ADD"
                        ? "Penambahan"
                        : item.type === "SUBTRACT"
                        ? "Pengurangan"
                        : item.type === "CREATE"
                        ? "Catatan Baru"
                        : item.type === "EDIT"
                        ? "Perubahan"
                        : item.type;
                    return (
                      <View key={item.id} style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, padding: 16, gap: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View>
                            <Text style={{ color: changeColor, fontWeight: "700" }}>{changeLabel}</Text>
                            <Text style={{ color: "#64748B", fontSize: 12 }}>{typeLabel}</Text>
                          </View>
                          <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                            {formatDateTimeDisplay(item.createdAt)}
                          </Text>
                        </View>
                        <Text style={{ color: "#0F172A", fontWeight: "600" }}>
                          Saldo: {formatCurrencyValue(item.newAmount)}
                        </Text>
                        {item.note ? <Text style={{ color: "#475569" }}>Catatan: {item.note}</Text> : null}
                      </View>
                    );
                  })}
                  {showFullHistoryButton ? (
                    <TouchableOpacity
                      onPress={openFullHistory}
                      style={{
                        marginTop: 8,
                        alignSelf: "flex-start",
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: "#2563EB",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600" }}>Lihat semua riwayat</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <Ionicons name="time-outline" size={28} color="#CBD5F5" />
                  <Text style={{ color: "#94A3B8", marginTop: 8 }}>Belum ada riwayat perubahan.</Text>
                </View>
              )}
            </View>
          </View>
        </ViewShot>
      </View>

      <Modal
        visible={adjustModal.visible}
        transparent
        animationType="fade"
        onRequestClose={closeAdjustModal}
        statusBarTranslucent
      >
        <Pressable
          onPress={closeAdjustModal}
          style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)" }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#fff",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: containerPaddingBottom,
            shadowColor: "#0F172A",
            shadowOpacity: 0.12,
            shadowRadius: 18,
            elevation: 6,
            maxHeight: "80%",
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: containerPaddingBottom }}
            scrollIndicatorInsets={{ bottom: containerPaddingBottom }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>{adjustModeLabel}</Text>
                <Text style={{ color: "#64748B", marginTop: 4 }}>{entry.name}</Text>
              </View>
              <TouchableOpacity onPress={closeAdjustModal} disabled={adjustModal.loading}>
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: "#0F172A", fontWeight: "600", marginTop: 12 }}>
              Saldo saat ini: {formatCurrencyValue(adjustCurrentAmount)}
            </Text>
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: "#64748B", marginBottom: 6 }}>Nominal</Text>
              <TextInput
                value={adjustModal.amount}
                onChangeText={handleAdjustAmountChange}
                placeholder="contoh: 250000"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  height: 44,
                }}
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: "#64748B", marginBottom: 6 }}>Catatan (opsional)</Text>
              <TextInput
                value={adjustModal.note}
                onChangeText={handleAdjustNoteChange}
                placeholder="contoh: Penyesuaian"
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  minHeight: 96,
                  textAlignVertical: "top",
                }}
                placeholderTextColor="#94A3B8"
                multiline
              />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
              <Text style={{ color: "#64748B" }}>Saldo setelah update</Text>
              <Text style={{ color: "#0F172A", fontWeight: "700" }}>{formatCurrencyValue(adjustNextAmount)}</Text>
            </View>
            <TouchableOpacity
              onPress={handleAdjustSubmit}
              disabled={adjustModal.loading}
              style={{
                marginTop: 18,
                backgroundColor: adjustModal.loading ? "#93C5FD" : "#2563EB",
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              {adjustModal.loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700" }}>Simpan Perubahan</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={closeAdjustModal}
              disabled={adjustModal.loading}
              style={{
                marginTop: 12,
                paddingVertical: 12,
                borderRadius: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#CBD5F5",
              }}
            >
              <Text style={{ color: "#2563EB", fontWeight: "600" }}>Batal</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

export function BookkeepingHistoryScreen({ route, navigation }) {
  const entryIdParam = route.params?.entryId;
  const entryName = route.params?.entryName || "Pembukuan";
  const entryId = Number(entryIdParam);
  const PAGE_SIZE = 20;
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

  useEffect(() => {
    navigation.setOptions({
      title: entryName ? `Riwayat • ${entryName}` : "Riwayat Pembukuan",
    });
  }, [entryName, navigation]);

  const loadHistory = useCallback(
    async ({ entryId: targetId = entryId, search = searchTerm, reset = false, mode = "default" } = {}) => {
      if (!Number.isFinite(targetId)) return;
      const normalizedSearch = (search || "").trim().toLowerCase();
      const isSearchChanged = normalizedSearch !== pagingRef.current.search;
      const shouldReset = reset || isSearchChanged;
      const offset = shouldReset ? 0 : pagingRef.current.offset;
      const limit = PAGE_SIZE + 1;
      const requestId = ++requestIdRef.current;

      if (mode === "refresh") setRefreshing(true);
      else if (mode === "loadMore") setLoadingMore(true);
      else setLoading(true);

      try {
        const res = await exec(
          `
            SELECT id, change_amount, type, note, previous_amount, new_amount, created_at
            FROM bookkeeping_entry_history
            WHERE entry_id = ?
              AND (? = '' OR LOWER(IFNULL(note,'')) LIKE ? OR LOWER(IFNULL(type,'')) LIKE ?)
            ORDER BY id DESC
            LIMIT ? OFFSET ?
          `,
          [
            targetId,
            normalizedSearch,
            `%${normalizedSearch}%`,
            `%${normalizedSearch}%`,
            limit,
            offset,
          ],
        );
        if (requestId !== requestIdRef.current) return;
        const rowsArray = res.rows?._array ?? [];
        const pageEntries = rowsArray.slice(0, PAGE_SIZE).map(row => ({
          id: row.id,
          changeAmount: Number(row.change_amount ?? 0),
          type: row.type,
          note: row.note,
          previousAmount: Number(row.previous_amount ?? 0),
          newAmount: Number(row.new_amount ?? 0),
          createdAt: row.created_at,
        }));
        const nextOffset = offset + pageEntries.length;
        setHasMore(rowsArray.length > PAGE_SIZE);
        setRecords(prev => (shouldReset ? pageEntries : [...prev, ...pageEntries]));
        pagingRef.current = { offset: nextOffset, search: normalizedSearch };
      } catch (error) {
        console.log("BOOKKEEPING HISTORY LOAD ERROR:", error);
        if (mode === "default" || mode === "initial") {
          Alert.alert("Gagal", "Riwayat tidak dapat dimuat.");
        }
      } finally {
        if (requestId === requestIdRef.current) {
          if (mode === "refresh") setRefreshing(false);
          else if (mode === "loadMore") setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [entryId, searchTerm],
  );

  useEffect(() => {
    if (!Number.isFinite(entryId)) {
      setLoading(false);
      setRecords([]);
      return;
    }
    loadHistory({ reset: true, entryId, search: searchTerm, mode: "initial" });
  }, [entryId]);

  useEffect(() => {
    if (!searchInitRef.current) {
      searchInitRef.current = true;
      return;
    }
    const handler = setTimeout(() => {
      if (!Number.isFinite(entryId)) return;
      loadHistory({ reset: true, entryId, search: searchTerm, mode: "search" });
    }, 250);
    return () => clearTimeout(handler);
  }, [entryId, searchTerm]);

  const handleRefresh = useCallback(() => {
    if (!Number.isFinite(entryId)) return;
    loadHistory({ reset: true, entryId, search: searchTerm, mode: "refresh" });
  }, [entryId, loadHistory, searchTerm]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || !Number.isFinite(entryId)) return;
    loadHistory({ reset: false, entryId, search: searchTerm, mode: "loadMore" });
  }, [entryId, hasMore, loadingMore, loadHistory, searchTerm]);

  const renderItem = useCallback(({ item }) => {
    const changeColor = item.changeAmount >= 0 ? "#16A34A" : "#DC2626";
    const changeLabel = `${item.changeAmount >= 0 ? "+" : "-"} ${formatCurrencyValue(Math.abs(item.changeAmount))}`;
    const typeLabel =
      item.type === "ADD"
        ? "Penambahan"
        : item.type === "SUBTRACT"
        ? "Pengurangan"
        : item.type === "CREATE"
        ? "Catatan Baru"
        : item.type === "EDIT"
        ? "Perubahan"
        : item.type || "-";
    return (
      <View
        style={{ borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, padding: 16, gap: 8, marginBottom: 12 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: changeColor, fontWeight: "700" }}>{changeLabel}</Text>
            <Text style={{ color: "#64748B", fontSize: 12 }}>{typeLabel}</Text>
          </View>
          <Text style={{ color: "#94A3B8", fontSize: 12 }}>{formatDateTimeDisplay(item.createdAt)}</Text>
        </View>
        <Text style={{ color: "#0F172A", fontWeight: "600" }}>
          Saldo: {formatCurrencyValue(item.newAmount)}
        </Text>
        <Text style={{ color: "#94A3B8", fontSize: 12 }}>Sebelumnya: {formatCurrencyValue(item.previousAmount)}</Text>
        {item.note ? <Text style={{ color: "#475569" }}>Catatan: {item.note}</Text> : null}
      </View>
    );
  }, []);

  if (!Number.isFinite(entryId)) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", padding: 24 }}
      >
        <Ionicons name="document-text-outline" size={42} color="#CBD5F5" />
        <Text style={{ marginTop: 12, color: "#94A3B8", textAlign: "center" }}>
          Riwayat pembukuan tidak ditemukan.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: "#2563EB" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Kembali</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <TextInput
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Cari catatan atau jenis riwayat"
          placeholderTextColor="#94A3B8"
          style={{
            backgroundColor: "#fff",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            paddingHorizontal: 14,
            height: 44,
          }}
        />
      </View>
      <FlatList
        data={records}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          loading ? null : (
            <View style={{ alignItems: "center", paddingTop: 48 }}>
              <Ionicons name="time-outline" size={32} color="#CBD5F5" />
              <Text style={{ marginTop: 12, color: "#94A3B8", textAlign: "center", paddingHorizontal: 16 }}>
                Belum ada riwayat yang sesuai.
              </Text>
            </View>
          )
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.6}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#2563EB"]} />}
        ListFooterComponent={
          loadingMore ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : null
        }
      />
      {loading && !records.length ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(248,250,252,0.7)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default BookkeepingScreen;
