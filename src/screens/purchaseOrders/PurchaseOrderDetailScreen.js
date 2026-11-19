import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { usePurchaseOrderDetail } from "../../hooks/usePurchaseOrderDetail";
import { Card, Badge, SectionHeader } from "../../components/ui";
import {
  formatCurrencyValue,
  formatDateDisplay,
  formatNumberValue,
  buildPOFileBase,
} from "../../utils/format";
import { saveFileToStorage, resolveShareableUri } from "../../services/files";

export default function PurchaseOrderDetailScreen({ route, navigation }) {
  const orderId = route?.params?.id || route?.params?.orderId;
  const { order, loading, refresh, changeStatus, deleteOrder } = usePurchaseOrderDetail(orderId);
  const invoicePreviewRef = useRef(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (loading && !order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={styles.loadingText}>Memuat detail PO...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Purchase Order tidak ditemukan atau telah dihapus.</Text>
      </View>
    );
  }

  const handleDelete = async () => {
    const success = await deleteOrder();
    if (success) {
      navigation.goBack();
    }
  };

  const handleCancelOrder = () => {
    Alert.alert("Batalkan Purchase Order", "Yakin ingin membatalkan purchase order ini?", [
      { text: "Kembali", style: "cancel" },
      {
        text: "Batalkan PO",
        style: "destructive",
        onPress: () => changeStatus("CANCELLED"),
      },
    ]);
  };

  const statusVariant =
    order.status === "DONE"
      ? "success"
      : order.status === "CANCELLED"
      ? "danger"
      : "warning";

  const statusLabel =
    order.status === "DONE"
      ? "Selesai"
      : order.status === "CANCELLED"
      ? "Dibatalkan"
      : "Diproses";

  const invoiceItems =
    order.items && order.items.length > 0
      ? order.items
      : [
          {
            id: order.id,
            name: order.item_name || "Tanpa barang",
            quantity: Number(order.quantity) || 1,
            price: Number(order.price) || 0,
            costPrice: Number(order.cost_price) || 0,
          },
        ];

  const totalAmount = invoiceItems.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.price) || 0),
    0
  );

  const totalQty = invoiceItems.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0),
    0
  );

  const totalCost = invoiceItems.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.costPrice || it.cost_price) || 0),
    0
  );

  const marketerFee = Number(order.marketer_fee) || 0;
  const netProfit = totalAmount - totalCost - marketerFee;

  // Generate PDF Invoice
  const generateInvoicePdf = async () => {
    try {
      setExportingPdf(true);
      const fileBaseName = buildPOFileBase(order);
      const escapeHtml = text =>
        (text ?? "")
          .toString()
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const formattedDate = formatDateDisplay(order.order_date || order.orderDate);
      const totalFormatted = formatCurrencyValue(totalAmount);
      const totalQtyFormatted = formatNumberValue(totalQty);

      const itemsHtml = invoiceItems
        .map(item => {
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const sub = qty * price;
          return `
            <tr>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a;">
                ${escapeHtml(item.name || "-")}
              </td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 14px; color: #0f172a; font-weight: 600;">
                ${formatNumberValue(qty)} pcs
              </td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 14px; color: #0f172a;">
                ${formatCurrencyValue(price)}
              </td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 14px; color: #0f172a; font-weight: 700;">
                ${formatCurrencyValue(sub)}
              </td>
            </tr>
          `;
        })
        .join("");

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body {
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f8fafc;
                padding: 32px;
                color: #0f172a;
              }
              .card {
                max-width: 680px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 20px;
                padding: 28px;
                box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 2px solid #f1f5f9;
                padding-bottom: 18px;
                margin-bottom: 20px;
              }
              .badge {
                display: inline-block;
                padding: 6px 14px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 700;
                background: ${order.status === "DONE" ? "#dcfce7" : order.status === "CANCELLED" ? "#fee2e2" : "#fef3c7"};
                color: ${order.status === "DONE" ? "#15803d" : order.status === "CANCELLED" ? "#dc2626" : "#b45309"};
              }
              .meta-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px 20px;
                margin-bottom: 20px;
                background: #f8fafc;
                padding: 16px;
                border-radius: 12px;
              }
              .meta-item p {
                margin: 0;
                font-size: 12px;
                color: #64748b;
              }
              .meta-item strong {
                display: block;
                font-size: 14px;
                color: #0f172a;
                margin-top: 2px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
              }
              th {
                background: #f1f5f9;
                padding: 10px 14px;
                font-size: 12px;
                text-transform: uppercase;
                color: #475569;
                text-align: left;
              }
              th.num { text-align: right; }
              .total-box {
                display: flex;
                justify-content: space-between;
                padding: 14px 18px;
                background: #f8fafc;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 800;
                color: #0f172a;
                margin-top: 10px;
              }
              .note {
                margin-top: 16px;
                font-size: 13px;
                color: #64748b;
                line-height: 1.5;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="header">
                <div>
                  <div style="font-size: 12px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: 0.05em;">Invoice PO</div>
                  <h1 style="margin: 4px 0 0; font-size: 22px; color: #0f172a;">No. PO #${order.id}</h1>
                </div>
                <span class="badge">${escapeHtml(statusLabel)}</span>
              </div>

              <div class="meta-grid">
                <div class="meta-item">
                  <p>Tanggal Pesanan</p>
                  <strong>${escapeHtml(formattedDate)}</strong>
                </div>
                <div class="meta-item">
                  <p>Nama Pemesan</p>
                  <strong>${escapeHtml(order.orderer_name || order.ordererName || "-")}</strong>
                </div>
                <div class="meta-item">
                  <p>Pemasok / Supplier</p>
                  <strong>${escapeHtml(order.supplier_name || order.supplierName || "-")}</strong>
                </div>
                <div class="meta-item">
                  <p>Estimasi Ready</p>
                  <strong>${escapeHtml(order.estimated_ready_date ? formatDateDisplay(order.estimated_ready_date) : "-")}</strong>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Barang</th>
                    <th class="num">Qty</th>
                    <th class="num">Harga</th>
                    <th class="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <div class="total-box">
                <span>Grand Total (${totalQtyFormatted} pcs)</span>
                <span style="color: #0d9488;">${totalFormatted}</span>
              </div>

              ${
                order.note
                  ? `<div class="note"><strong>Catatan:</strong> ${escapeHtml(order.note)}</div>`
                  : ""
              }
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } =
        await saveFileToStorage(uri, `${fileBaseName}.pdf`, "application/pdf");

      if (await Sharing.isAvailableAsync()) {
        const shareUri = await resolveShareableUri(`${fileBaseName}-share.pdf`, uri, savedUri);
        if (shareUri) {
          await Sharing.shareAsync(shareUri, {
            mimeType: "application/pdf",
            dialogTitle: "Bagikan Invoice Purchase Order (PDF)",
          });
        }
      }

      const alertMsg = savedDisplayPath
        ? `Tersimpan di ${savedDisplayPath}`
        : "File PDF berhasil dibuat dan disimpan.";
      Alert.alert("Invoice PDF Siap", alertMsg);
    } catch (e) {
      console.log("GENERATE PO PDF ERROR:", e);
      Alert.alert("Gagal", "Tidak dapat menghasilkan file PDF saat ini.");
    } finally {
      setExportingPdf(false);
    }
  };

  // Generate PNG Image Invoice
  const generateInvoiceImage = async () => {
    try {
      setExportingImage(true);
      let tempUri;
      const viewShot = invoicePreviewRef.current;
      if (viewShot && typeof viewShot.capture === "function") {
        tempUri = await viewShot.capture({ format: "png", quality: 1 });
      } else if (invoicePreviewRef.current) {
        tempUri = await captureRef(invoicePreviewRef, { format: "png", quality: 1 });
      } else {
        Alert.alert("Gagal", "Pratinjau gambar belum siap.");
        return;
      }
      const fileBaseName = buildPOFileBase(order);
      const { uri: savedUri, location: savedLocation, notice: savedNotice, displayPath: savedDisplayPath } =
        await saveFileToStorage(tempUri, `${fileBaseName}.png`, "image/png");

      if (await Sharing.isAvailableAsync()) {
        const shareUri = await resolveShareableUri(`${fileBaseName}-share.png`, tempUri, savedUri);
        if (shareUri) {
          await Sharing.shareAsync(shareUri, {
            mimeType: "image/png",
            dialogTitle: "Bagikan Invoice PO (PNG)",
          });
        }
      }

      const alertMsg = savedDisplayPath
        ? `Tersimpan di ${savedDisplayPath}`
        : "Gambar invoice berhasil disimpan.";
      Alert.alert("Gambar Invoice Siap", alertMsg);
    } catch (e) {
      console.log("GENERATE PO IMAGE ERROR:", e);
      Alert.alert("Gagal", "Tidak dapat membuat gambar invoice saat ini.");
    } finally {
      setExportingImage(false);
    }
  };

  const previewWidth = Math.max(Dimensions.get("window").width - 32, 340);

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Main Status & Header Card */}
        <Card style={styles.mainCard}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.poNumber}>PO #{order.id}</Text>
              <Text style={styles.orderDate}>
                Tanggal Order: {formatDateDisplay(order.order_date || order.orderDate)}
              </Text>
            </View>
            <Badge label={statusLabel} variant={statusVariant} />
          </View>

          {/* Quick Metrics */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Total Penjualan</Text>
              <Text style={styles.metricValue}>{formatCurrencyValue(totalAmount)}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Total Modal</Text>
              <Text style={styles.metricValue}>{formatCurrencyValue(totalCost)}</Text>
            </View>
          </View>

          {/* Net Profit Bar */}
          <View style={styles.profitBar}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons
                name="wallet-outline"
                size={16}
                color={netProfit >= 0 ? "#16A34A" : "#DC2626"}
              />
              <Text style={styles.profitBarLabel}>Akumulasi Profit Bersih:</Text>
            </View>
            <Text
              style={[
                styles.profitBarValue,
                { color: netProfit >= 0 ? "#16A34A" : "#DC2626" },
              ]}
            >
              {netProfit >= 0 ? "+" : "-"} {formatCurrencyValue(Math.abs(netProfit))}
            </Text>
          </View>

          {/* Partner & Details Info */}
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <Ionicons name="person-outline" size={16} color="#64748B" />
              <Text style={styles.infoLabel}>Pemesan:</Text>
              <Text style={styles.infoValue}>{order.orderer_name || "-"}</Text>
            </View>

            <View style={styles.infoItem}>
              <Ionicons name="business-outline" size={16} color="#64748B" />
              <Text style={styles.infoLabel}>Pemasok / Supplier:</Text>
              <Text style={styles.infoValue}>{order.supplier_name || "-"}</Text>
            </View>

            {Boolean(order.marketer_name) && (
              <View style={styles.infoItem}>
                <Ionicons name="megaphone-outline" size={16} color="#D97706" />
                <Text style={styles.infoLabel}>Marketer:</Text>
                <Text style={[styles.infoValue, { color: "#D97706", fontWeight: "600" }]}>
                  {order.marketer_name}
                  {order.marketer_fee ? ` (Komisi: ${formatCurrencyValue(order.marketer_fee)})` : ""}
                </Text>
              </View>
            )}

            {Boolean(order.close_po_date) && (
              <View style={styles.infoItem}>
                <Ionicons name="calendar-outline" size={16} color="#F59E0B" />
                <Text style={styles.infoLabel}>Close PO:</Text>
                <Text style={[styles.infoValue, { color: "#F59E0B", fontWeight: "700" }]}>
                  {formatDateDisplay(order.close_po_date)}
                </Text>
              </View>
            )}

            {Boolean(order.estimated_ready_date) && (
              <View style={styles.infoItem}>
                <Ionicons name="time-outline" size={16} color="#0D9488" />
                <Text style={styles.infoLabel}>Estimasi Ready:</Text>
                <Text style={[styles.infoValue, { color: "#0D9488", fontWeight: "700" }]}>
                  {formatDateDisplay(order.estimated_ready_date)}
                </Text>
              </View>
            )}

            {Boolean(order.note) && (
              <View style={styles.infoItem}>
                <Ionicons name="document-text-outline" size={16} color="#64748B" />
                <Text style={styles.infoLabel}>Catatan:</Text>
                <Text style={styles.infoValue}>{order.note}</Text>
              </View>
            )}
          </View>

          {/* Export & Action Buttons */}
          <View style={styles.actionSection}>
            <Text style={styles.actionSectionTitle}>Aksi & Ekspor</Text>
            <View style={styles.actionGrid}>
              <TouchableOpacity
                onPress={generateInvoicePdf}
                disabled={exportingPdf}
                activeOpacity={0.7}
                style={[styles.actionBtn, styles.pdfBtn]}
              >
                {exportingPdf ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <Ionicons name="document-text-outline" size={18} color="#4F46E5" />
                )}
                <Text style={[styles.actionBtnText, { color: "#4F46E5" }]}>Export PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={generateInvoiceImage}
                disabled={exportingImage}
                activeOpacity={0.7}
                style={[styles.actionBtn, styles.pngBtn]}
              >
                {exportingImage ? (
                  <ActivityIndicator size="small" color="#0284C7" />
                ) : (
                  <Ionicons name="image-outline" size={18} color="#0284C7" />
                )}
                <Text style={[styles.actionBtnText, { color: "#0284C7" }]}>Export PNG</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate("EditPurchaseOrder", { orderId: order.id })}
                activeOpacity={0.7}
                style={[styles.actionBtn, styles.editBtn]}
              >
                <Ionicons name="create-outline" size={18} color="#0D9488" />
                <Text style={[styles.actionBtnText, { color: "#0D9488" }]}>Edit PO</Text>
              </TouchableOpacity>

              {order.status !== "CANCELLED" && (
                <TouchableOpacity
                  onPress={handleCancelOrder}
                  activeOpacity={0.7}
                  style={[styles.actionBtn, styles.cancelOrderBtn]}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                  <Text style={[styles.actionBtnText, { color: "#DC2626" }]}>Batalkan</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Status Change & Delete Bar */}
            <View style={styles.statusRow}>
              {order.status === "PROGRESS" ? (
                <TouchableOpacity
                  onPress={() => changeStatus("DONE")}
                  activeOpacity={0.7}
                  style={[styles.bigBtn, styles.doneBtn]}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.bigBtnText}>Tandai Selesai (DONE)</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => changeStatus("PROGRESS")}
                  activeOpacity={0.7}
                  style={[styles.bigBtn, styles.progressBtn]}
                >
                  <Ionicons name="refresh" size={18} color="#fff" />
                  <Text style={styles.bigBtnText}>Kembalikan ke Progress</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={handleDelete}
                activeOpacity={0.7}
                style={styles.deleteIconButton}
              >
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        </Card>

        {/* Item Breakdown */}
        <SectionHeader
          title="Daftar Barang Pesanan"
          subtitle={`${invoiceItems.length} macam barang • ${totalQty} pcs`}
          style={{ marginTop: 8 }}
        />

        {invoiceItems.map((it, idx) => {
          const qty = Number(it.quantity) || 0;
          const price = Number(it.price) || 0;
          const cost = Number(it.costPrice || it.cost_price) || 0;
          const subtotal = qty * price;
          const itemProfit = subtotal - qty * cost;

          return (
            <Card key={String(it.id || idx)} style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemNameText}>{it.name}</Text>
                <Text style={styles.itemPriceText}>
                  {formatNumberValue(qty)} pcs × {formatCurrencyValue(price)}
                </Text>
                {cost > 0 && (
                  <Text style={styles.itemCostText}>
                    Modal: {formatCurrencyValue(cost)}/pcs
                  </Text>
                )}
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.itemSubtotal}>{formatCurrencyValue(subtotal)}</Text>
                <Text
                  style={[
                    styles.itemProfitText,
                    { color: itemProfit >= 0 ? "#16A34A" : "#DC2626" },
                  ]}
                >
                  Profit: {itemProfit >= 0 ? "+" : "-"}
                  {formatCurrencyValue(Math.abs(itemProfit))}
                </Text>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      {/* Hidden ViewShot for PNG Invoice Capture */}
      <View style={styles.hiddenViewShot}>
        <ViewShot ref={invoicePreviewRef} collapsable={false} style={{ width: previewWidth }}>
          <View style={styles.invoiceShotContainer}>
            <View style={styles.shotHeader}>
              <View>
                <Text style={styles.shotTag}>INVOICE RESMI</Text>
                <Text style={styles.shotTitle}>Purchase Order #{order.id}</Text>
              </View>
              <Badge label={statusLabel} variant={statusVariant} />
            </View>

            <View style={styles.shotMetaBox}>
              <Text style={styles.shotMetaText}>
                Pemesan: <Text style={styles.shotMetaBold}>{order.orderer_name || "-"}</Text>
              </Text>
              <Text style={styles.shotMetaText}>
                Pemasok: <Text style={styles.shotMetaBold}>{order.supplier_name || "-"}</Text>
              </Text>
              <Text style={styles.shotMetaText}>
                Tanggal:{" "}
                <Text style={styles.shotMetaBold}>
                  {formatDateDisplay(order.order_date || order.orderDate)}
                </Text>
              </Text>
            </View>

            <View style={styles.shotTable}>
              {invoiceItems.map((it, idx) => (
                <View key={idx} style={styles.shotRow}>
                  <Text style={styles.shotItemName} numberOfLines={1}>
                    {it.name}
                  </Text>
                  <Text style={styles.shotItemQty}>{formatNumberValue(it.quantity)} pcs</Text>
                  <Text style={styles.shotItemTotal}>
                    {formatCurrencyValue((Number(it.quantity) || 0) * (Number(it.price) || 0))}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.shotFooter}>
              <Text style={styles.shotFooterLabel}>Grand Total ({totalQty} pcs)</Text>
              <Text style={styles.shotFooterValue}>{formatCurrencyValue(totalAmount)}</Text>
            </View>
          </View>
        </ViewShot>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
  },
  emptyText: {
    fontSize: 15,
    color: "#94A3B8",
    textAlign: "center",
  },
  mainCard: {
    padding: 18,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 14,
    marginBottom: 14,
  },
  poNumber: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  orderDate: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "500",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 4,
  },
  profitBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  profitBarLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#166534",
  },
  profitBarValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  infoList: {
    gap: 10,
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: "#64748B",
    width: 130,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
    flex: 1,
  },
  actionSection: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 14,
  },
  actionSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  pdfBtn: {
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  pngBtn: {
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  editBtn: {
    backgroundColor: "rgba(13, 148, 136, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(13, 148, 136, 0.25)",
  },
  cancelOrderBtn: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  statusRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  bigBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  doneBtn: {
    backgroundColor: "#16A34A",
  },
  progressBtn: {
    backgroundColor: "#0284C7",
  },
  bigBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  deleteIconButton: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  itemCard: {
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemNameText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  itemPriceText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  itemCostText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 1,
  },
  itemSubtotal: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  itemProfitText: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  hiddenViewShot: {
    position: "absolute",
    top: -9999,
    left: -9999,
  },
  invoiceShotContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  shotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 14,
    marginBottom: 14,
  },
  shotTag: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0D9488",
    textTransform: "uppercase",
  },
  shotTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 2,
  },
  shotMetaBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    gap: 4,
  },
  shotMetaText: {
    fontSize: 12,
    color: "#64748B",
  },
  shotMetaBold: {
    fontWeight: "700",
    color: "#0F172A",
  },
  shotTable: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingVertical: 10,
    marginBottom: 14,
    gap: 8,
  },
  shotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shotItemName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    flex: 1,
  },
  shotItemQty: {
    fontSize: 12,
    color: "#64748B",
    width: 60,
    textAlign: "right",
  },
  shotItemTotal: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    width: 90,
    textAlign: "right",
  },
  shotFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    padding: 12,
    borderRadius: 10,
  },
  shotFooterLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
  },
  shotFooterValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#166534",
  },
});
