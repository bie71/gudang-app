import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import ActionButton from "../../components/ActionButton";
import DatePickerField from "../../components/DatePickerField";
import DetailRow from "../../components/DetailRow";
import FormScrollContainer from "../../components/FormScrollContainer";
import Input from "../../components/Input";
import { exec } from "../../services/database";
import { saveFileToStorage, resolveShareableUri } from "../../services/files";
import {
  buildBookkeepingReportFileBase,
  formatCurrencyValue,
  formatDateDisplay,
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

export function BookkeepingScreen({ navigation }) {
  const PAGE_SIZE = 20;
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
  const pagingRef = useRef({ offset: 0, search: "" });
  const requestIdRef = useRef(0);
  const searchInitRef = useRef(false);

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
              body { background: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; }
              .card { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 24px; padding: 32px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); }
              .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
              .header h1 { margin: 0; font-size: 28px; }
              .range { color: #64748b; margin-top: 4px; font-size: 14px; }
              .summary { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
              .summary-item { background: #f8fafc; border-radius: 16px; padding: 16px 20px; flex: 1 1 220px; }
              .summary-item h2 { margin: 0 0 8px; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
              .summary-item p { margin: 0; font-size: 18px; font-weight: 600; }
              table { width: 100%; border-collapse: collapse; }
              thead { background: #f8fafc; }
              th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
              th { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
              td { font-size: 14px; color: #0f172a; }
              .col-index { width: 48px; text-align: center; }
              .col-date { width: 140px; }
              .col-name { width: 220px; }
              .col-note { width: 100%; }
              .col-amount { width: 140px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
              tfoot td { font-weight: 700; color: #0f172a; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div>
                  <p style="letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8; margin: 0 0 8px;">Laporan</p>
                  <h1>Pembukuan Gudang</h1>
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

  const renderItem = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        navigation.navigate("BookkeepingDetail", {
          entryId: item.id,
          initialEntry: item,
          onDone: () => {
            loadEntries({ search: searchTerm, reset: true });
            loadSummary();
          },
        })
      }
      style={{
        backgroundColor: "#fff",
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginBottom: 10,
      }}
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
  );

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
            onPress={() =>
              navigation.navigate("AddBookkeeping", {
                onDone: () => {
                  loadEntries({ search: searchTerm, reset: true });
                  loadSummary();
                },
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
  const onDone = route.params?.onDone;
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
    try {
      if (isEdit) {
        await exec(
          `UPDATE bookkeeping_entries SET name = ?, amount = ?, entry_date = ?, note = ? WHERE id = ?`,
          [trimmedName, parsedAmount, entryDate, note || null, entryId],
        );
      } else {
        await exec(
          `INSERT INTO bookkeeping_entries (name, amount, entry_date, note) VALUES (?,?,?,?)`,
          [trimmedName, parsedAmount, entryDate, note || null],
        );
      }
      onDone && onDone();
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
  const onDone = route.params?.onDone;
  const initialEntry = route.params?.initialEntry;
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
  const [loading, setLoading] = useState(() => !initialEntry);
  const entryId = Number(entryIdParam);

  const load = useCallback(async () => {
    if (!Number.isFinite(entryId)) {
      setEntry(null);
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
        return;
      }
      const row = res.rows.item(0);
      setEntry(
        normalizeEntry({
          id: row.id,
          name: row.name,
          amount: row.amount,
          entryDate: row.entry_date,
          note: row.note,
          createdAt: row.created_at,
        }),
      );
    } catch (error) {
      console.log("BOOKKEEPING DETAIL LOAD ERROR:", error);
    } finally {
      setLoading(false);
    }
  }, [entryId, normalizeEntry]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshParent = useCallback(() => {
    if (typeof onDone === "function") {
      onDone();
    }
  }, [onDone]);

  const handleEdit = useCallback(() => {
    if (!entry) return;
    navigation.navigate("AddBookkeeping", {
      entry,
      onDone: () => {
        load();
        refreshParent();
      },
    });
  }, [entry, navigation, load, refreshParent]);

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
        <View style={{ flexDirection: "row", gap: 12 }}>
          <ActionButton label="Edit" onPress={handleEdit} color="#2563EB" />
          <ActionButton label="Hapus" onPress={confirmDelete} color="#E11D48" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default BookkeepingScreen;
