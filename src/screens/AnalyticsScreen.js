import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Rect, Circle, Text as SvgText, G } from "react-native-svg";
import { exec } from "../services/database";
import { formatCurrencyValue, formatDateDisplay } from "../utils/format";

const WINDOW_WIDTH = Dimensions.get("window").width;

export default function AnalyticsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("cashflow"); // "cashflow" | "inventory" | "po" | "profit"
  const [timeRange, setTimeRange] = useState("7"); // "7" | "30" days

  // Analytics Data States
  const [cashFlow, setCashFlow] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [fastMovingItems, setFastMovingItems] = useState([]);
  const [profitSummary, setProfitSummary] = useState({ itemProfit: 0, poProfit: 0, poProgressProfit: 0, totalRevenue: 0 });
  const [itemProfitLeaders, setItemProfitLeaders] = useState([]);
  const [poStats, setPoStats] = useState({
    totalOrders: 0,
    progressOrders: 0,
    doneOrders: 0,
    cancelledOrders: 0,
    totalValue: 0,
  });
  const [topSuppliers, setTopSuppliers] = useState([]);
  const [upcomingDeliveries, setUpcomingDeliveries] = useState([]);
  const [summaryStats, setSummaryStats] = useState({
    totalIncome: 0,
    totalExpense: 0,
    netBalance: 0,
    totalStockValue: 0,
    totalItemsCount: 0,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Cash Flow Data (Income vs Expense from bookkeeping history)
      const cashFlowRes = await exec(`
        SELECT 
          date(created_at) as date_key,
          SUM(CASE WHEN change_amount > 0 THEN change_amount ELSE 0 END) as income,
          SUM(CASE WHEN change_amount < 0 THEN ABS(change_amount) ELSE 0 END) as expense
        FROM bookkeeping_entry_history
        WHERE date(created_at) >= date('now', ? || ' days', 'localtime')
        GROUP BY date_key
        ORDER BY date_key ASC
      `, [`-${timeRange}`]);

      const cashFlowArray = [];
      let totalIncome = 0;
      let totalExpense = 0;

      for (let i = 0; i < cashFlowRes.rows.length; i++) {
        const row = cashFlowRes.rows.item(i);
        const inc = Number(row.income ?? 0);
        const exp = Number(row.expense ?? 0);
        totalIncome += inc;
        totalExpense += exp;

        // format date label to short form (dd MMM)
        let shortLabel = row.date_key;
        try {
          const parts = row.date_key.split("-");
          const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
          shortLabel = dateObj.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
        } catch (e) {
          // fallback
        }

        cashFlowArray.push({
          date: row.date_key,
          shortLabel,
          income: inc,
          expense: exp,
        });
      }

      setCashFlow(cashFlowArray);

      // 2. Fetch Category Distribution Data
      const categoryRes = await exec(`
        SELECT 
          IFNULL(category, 'Umum') as category,
          COUNT(*) as total_items,
          IFNULL(SUM(stock), 0) as total_stock,
          IFNULL(SUM(stock * price), 0) as total_value
        FROM items
        GROUP BY category
        ORDER BY total_value DESC
      `);

      const catArray = [];
      let totalStockVal = 0;
      let totalItemsCount = 0;

      for (let i = 0; i < categoryRes.rows.length; i++) {
        const row = categoryRes.rows.item(i);
        const val = Number(row.total_value ?? 0);
        totalStockVal += val;
        totalItemsCount += Number(row.total_items ?? 0);
        catArray.push({
          category: row.category,
          itemsCount: Number(row.total_items ?? 0),
          stockCount: Number(row.total_stock ?? 0),
          value: val,
        });
      }
      setCategoryData(catArray);

      // 3. Fetch Top 5 Fast Moving Items (by quantity out)
      const fastMovingRes = await exec(`
        SELECT 
          i.name,
          i.category,
          IFNULL(SUM(h.qty), 0) as total_qty_out,
          IFNULL(SUM(h.profit_amount), 0) as total_profit
        FROM stock_history h
        JOIN items i ON i.id = h.item_id
        WHERE h.type = 'OUT'
        GROUP BY h.item_id
        ORDER BY total_qty_out DESC
        LIMIT 5
      `);

      const fmArray = [];
      for (let i = 0; i < fastMovingRes.rows.length; i++) {
        const row = fastMovingRes.rows.item(i);
        fmArray.push({
          name: row.name,
          category: row.category || "Umum",
          qtyOut: Number(row.total_qty_out ?? 0),
          profit: Number(row.total_profit ?? 0),
        });
      }
      setFastMovingItems(fmArray);

      // 4. Fetch Profit Summaries (Items vs POs)
      const itemProfitSummary = await exec(`
        SELECT IFNULL(SUM(profit_amount), 0) as total_profit
        FROM stock_history
        WHERE type = 'OUT'
      `);
      const itemProfitVal = Number(itemProfitSummary.rows.item(0)?.total_profit ?? 0);

      const poProfitSummary = await exec(`
        SELECT IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) as total_profit
        FROM purchase_orders po
        JOIN purchase_order_items items ON items.order_id = po.id
        WHERE po.status = 'DONE'
      `);
      const poProfitVal = Number(poProfitSummary.rows.item(0)?.total_profit ?? 0);

      const poProgressProfitSummary = await exec(`
        SELECT IFNULL(SUM(items.quantity * (items.price - IFNULL(items.cost_price, 0))), 0) as total_profit
        FROM purchase_orders po
        JOIN purchase_order_items items ON items.order_id = po.id
        WHERE po.status = 'PROGRESS'
      `);
      const poProgressProfitVal = Number(poProgressProfitSummary.rows.item(0)?.total_profit ?? 0);

      // Fetch actual sales/revenue (independent of general bookkeeping Cash Flow)
      const itemSalesSummary = await exec(`
        SELECT IFNULL(SUM(qty * IFNULL(unit_price, 0)), 0) as total_sales
        FROM stock_history
        WHERE type = 'OUT'
      `);
      const itemSalesVal = Number(itemSalesSummary.rows.item(0)?.total_sales ?? 0);

      const poSalesSummary = await exec(`
        SELECT IFNULL(SUM(items.quantity * IFNULL(items.price, 0)), 0) as total_sales
        FROM purchase_orders po
        JOIN purchase_order_items items ON items.order_id = po.id
        WHERE po.status = 'DONE'
      `);
      const poSalesVal = Number(poSalesSummary.rows.item(0)?.total_sales ?? 0);

      const totalBusinessRevenue = itemSalesVal + poSalesVal;

      setProfitSummary({
        itemProfit: itemProfitVal,
        poProfit: poProfitVal,
        poProgressProfit: poProgressProfitVal,
        totalRevenue: totalBusinessRevenue,
      });

      // 5. Fetch Top Profitable Items
      const profitLeadersRes = await exec(`
        SELECT
          i.name,
          i.category,
          IFNULL(SUM(h.profit_amount), 0) as total_profit,
          IFNULL(SUM(h.qty), 0) as total_qty
        FROM stock_history h
        JOIN items i ON i.id = h.item_id
        WHERE h.type = 'OUT'
        GROUP BY h.item_id
        ORDER BY total_profit DESC
        LIMIT 5
      `);

      const plArray = [];
      for (let i = 0; i < profitLeadersRes.rows.length; i++) {
        const row = profitLeadersRes.rows.item(i);
        plArray.push({
          name: row.name,
          category: row.category || "Umum",
          profit: Number(row.total_profit ?? 0),
          qty: Number(row.total_qty ?? 0),
        });
      }
      setItemProfitLeaders(plArray);

      // 6. Fetch PO Summaries and Stats
      const poSummaryRes = await exec(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'PROGRESS' THEN 1 ELSE 0 END) as progress_orders,
          SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) as done_orders,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_orders,
          IFNULL(SUM(total_value), 0) as total_value
        FROM (
          SELECT 
            po.id, 
            po.status, 
            IFNULL(SUM(items.quantity * items.price), 0) as total_value
          FROM purchase_orders po
          LEFT JOIN purchase_order_items items ON items.order_id = po.id
          GROUP BY po.id
        ) aggregated
      `);

      if (poSummaryRes.rows.length) {
        const row = poSummaryRes.rows.item(0);
        setPoStats({
          totalOrders: Number(row.total_orders ?? 0),
          progressOrders: Number(row.progress_orders ?? 0),
          doneOrders: Number(row.done_orders ?? 0),
          cancelledOrders: Number(row.cancelled_orders ?? 0),
          totalValue: Number(row.total_value ?? 0),
        });
      }

      // 7. Fetch Top Suppliers (by spent value)
      const topSuppliersRes = await exec(`
        SELECT 
          IFNULL(NULLIF(po.supplier_name, ''), 'Tanpa Nama') as supplier,
          COUNT(DISTINCT po.id) as total_orders,
          IFNULL(SUM(items.quantity * items.price), 0) as total_spent
        FROM purchase_orders po
        LEFT JOIN purchase_order_items items ON items.order_id = po.id
        GROUP BY supplier
        ORDER BY total_spent DESC
        LIMIT 5
      `);

      const tsArray = [];
      for (let i = 0; i < topSuppliersRes.rows.length; i++) {
        const row = topSuppliersRes.rows.item(i);
        tsArray.push({
          supplier: row.supplier,
          ordersCount: Number(row.total_orders ?? 0),
          spent: Number(row.total_spent ?? 0),
        });
      }
      setTopSuppliers(tsArray);

      // 8. Fetch Upcoming Deliveries (estimated ready dates for PROGRESS POs)
      const upcomingRes = await exec(`
        SELECT 
          po.id,
          po.supplier_name,
          po.estimated_ready_date,
          COALESCE(
            (SELECT name FROM purchase_order_items WHERE order_id = po.id ORDER BY id LIMIT 1),
            ''
          ) as item_name,
          (SELECT SUM(quantity) FROM purchase_order_items WHERE order_id = po.id) as total_qty,
          (SELECT SUM(quantity * price) FROM purchase_order_items WHERE order_id = po.id) as total_val
        FROM purchase_orders po
        WHERE po.status = 'PROGRESS' AND po.estimated_ready_date IS NOT NULL AND po.estimated_ready_date != ''
        ORDER BY date(po.estimated_ready_date) ASC, po.id DESC
        LIMIT 5
      `);

      const udArray = [];
      for (let i = 0; i < upcomingRes.rows.length; i++) {
        const row = upcomingRes.rows.item(i);
        udArray.push({
          id: row.id,
          supplierName: row.supplier_name || "Tanpa Nama",
          estimatedReadyDate: row.estimated_ready_date,
          itemName: row.item_name,
          totalQty: Number(row.total_qty ?? 0),
          totalVal: Number(row.total_val ?? 0),
        });
      }
      setUpcomingDeliveries(udArray);

      // Set Combined Stats
      setSummaryStats({
        totalIncome,
        totalExpense,
        netBalance: totalIncome - totalExpense,
        totalStockValue: totalStockVal,
        totalItemsCount,
      });

    } catch (err) {
      console.log("Error loading analytics data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // --- SVG Charts Logic ---

  // Double Line Area Chart for Cash Flow
  const renderCashFlowChart = () => {
    if (cashFlow.length === 0) {
      return (
        <View style={{ height: 200, justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 16 }}>
          <Ionicons name="bar-chart-outline" size={32} color="#94A3B8" />
          <Text style={{ color: "#94A3B8", marginTop: 8, fontSize: 13 }}>Belum ada data aliran kas pada periode ini</Text>
        </View>
      );
    }

    const chartWidth = WINDOW_WIDTH - 64;
    const chartHeight = 160;
    const paddingLeft = 10;
    const paddingRight = 10;
    const paddingTop = 20;
    const paddingBottom = 20;

    const useableWidth = chartWidth - paddingLeft - paddingRight;
    const useableHeight = chartHeight - paddingTop - paddingBottom;

    // Find max value in dataset
    const maxVal = Math.max(
      ...cashFlow.map(d => Math.max(d.income, d.expense)),
      100000 // default fallback floor
    );

    const getCoordinates = (type) => {
      return cashFlow.map((d, index) => {
        const val = type === "income" ? d.income : d.expense;
        const x = cashFlow.length <= 1 ? paddingLeft + useableWidth / 2 : paddingLeft + (useableWidth / (cashFlow.length - 1)) * index;
        const ratio = val / maxVal;
        const y = chartHeight - paddingBottom - ratio * useableHeight;
        return { x, y };
      });
    };

    const incomeCoords = getCoordinates("income");
    const expenseCoords = getCoordinates("expense");

    const getPathData = (coords) => {
      if (coords.length === 0) return "";
      return coords.reduce((acc, coord, idx) => {
        return idx === 0 ? `M ${coord.x} ${coord.y}` : `${acc} L ${coord.x} ${coord.y}`;
      }, "");
    };

    const getAreaPathData = (coords) => {
      if (coords.length === 0) return "";
      const linePath = getPathData(coords);
      const firstX = coords[0].x;
      const lastX = coords[coords.length - 1].x;
      const baseY = chartHeight - paddingBottom;
      return `${linePath} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
    };

    const incomePath = getPathData(incomeCoords);
    const incomeAreaPath = getAreaPathData(incomeCoords);
    const expensePath = getPathData(expenseCoords);
    const expenseAreaPath = getAreaPathData(expenseCoords);

    return (
      <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#F1F5F9" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Tren Aliran Kas</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" }} />
              <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "600" }}>Pemasukan</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
              <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "600" }}>Pengeluaran</Text>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: "#F8FAFC", borderRadius: 12, paddingVertical: 10, alignItems: "center" }}>
          <Svg width={chartWidth} height={chartHeight}>
            {/* Draw Gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
              const y = chartHeight - paddingBottom - ratio * useableHeight;
              return (
                <Path
                  key={`grid-${index}`}
                  d={`M ${paddingLeft} ${y} L ${chartWidth - paddingRight} ${y}`}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
              );
            })}

            {/* Draw Area Fills */}
            {incomeAreaPath ? <Path d={incomeAreaPath} fill="rgba(16, 185, 129, 0.08)" /> : null}
            {expenseAreaPath ? <Path d={expenseAreaPath} fill="rgba(239, 68, 68, 0.06)" /> : null}

            {/* Draw Lines */}
            {incomePath ? <Path d={incomePath} fill="none" stroke="#10B981" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
            {expensePath ? <Path d={expensePath} fill="none" stroke="#EF4444" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}

            {/* Draw Data Points Circles */}
            {incomeCoords.map((c, i) => <Circle key={`inc-dot-${i}`} cx={c.x} cy={c.y} r={3.5} fill="#10B981" stroke="#fff" strokeWidth={1} />)}
            {expenseCoords.map((c, i) => <Circle key={`exp-dot-${i}`} cx={c.x} cy={c.y} r={3.5} fill="#EF4444" stroke="#fff" strokeWidth={1} />)}
          </Svg>
        </View>

        {/* Date Labels below chart */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingHorizontal: paddingLeft }}>
          {cashFlow.map((d, idx) => (
            <View key={`lbl-${idx}`} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "600", textAlign: "center" }}>
                {d.shortLabel}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // Donut/Category Distribution Chart using colored Progress bars (highly readable on mobile)
  const renderCategoryValuationList = () => {
    if (categoryData.length === 0) {
      return null;
    }

    const COLORS = ["#0D9488", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#10B981", "#EF4444", "#64748B"];
    const maxVal = Math.max(...categoryData.map(c => c.value), 1);

    return (
      <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#F1F5F9", marginTop: 16 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 14 }}>
          Sebaran Nilai Aset Kategori
        </Text>
        
        {categoryData.map((item, index) => {
          const color = COLORS[index % COLORS.length];
          const pct = ((item.value / summaryStats.totalStockValue) * 100).toFixed(1);
          const ratioWidth = `${(item.value / maxVal) * 100}%`;

          return (
            <View key={`${item.category}-${index}`} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
                  <Text style={{ color: "#0F172A", fontWeight: "600", fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
                    {item.category}
                  </Text>
                  <Text style={{ color: "#64748B", fontSize: 11 }}>
                    ({item.stockCount} unit)
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontWeight: "700", color: "#0F172A", fontSize: 13 }}>
                    {formatCurrencyValue(item.value)}
                  </Text>
                  <Text style={{ color: color, fontSize: 10, fontWeight: "700" }}>
                    {pct}%
                  </Text>
                </View>
              </View>

              {/* Progress bar line */}
              <View style={{ height: 6, backgroundColor: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                <View style={{ width: ratioWidth, height: "100%", backgroundColor: color, borderRadius: 3 }} />
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // Profit Source Compare Chart
  const renderProfitCompareChart = () => {
    const { itemProfit, poProfit } = profitSummary;
    const total = itemProfit + poProfit;
    if (total === 0) {
      return (
        <View style={{ height: 120, justifyContent: "center", alignItems: "center", backgroundColor: "#fff", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#F1F5F9" }}>
          <Ionicons name="pie-chart-outline" size={24} color="#94A3B8" />
          <Text style={{ color: "#94A3B8", marginTop: 8, fontSize: 12 }}>Belum ada data profit penjualan / PO</Text>
        </View>
      );
    }

    const itemPct = ((itemProfit / total) * 100).toFixed(1);
    const poPct = ((poProfit / total) * 100).toFixed(1);

    return (
      <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#F1F5F9", flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginBottom: 12 }}>Sumber Keuntungan</Text>
          
          <View style={{ gap: 8 }}>
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#14B8A6" }} />
                <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600" }}>Penjualan Barang ({itemPct}%)</Text>
              </View>
              <Text style={{ fontWeight: "700", color: "#0F172A", fontSize: 14, marginLeft: 14 }}>
                {formatCurrencyValue(itemProfit)}
              </Text>
            </View>

            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#3B82F6" }} />
                <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600" }}>Purchase Order ({poPct}%)</Text>
              </View>
              <Text style={{ fontWeight: "700", color: "#0F172A", fontSize: 14, marginLeft: 14 }}>
                {formatCurrencyValue(poProfit)}
              </Text>
            </View>
          </View>
        </View>

        {/* Custom SVG Mini Donut Chart */}
        <View style={{ width: 100, height: 100, justifyContent: "center", alignItems: "center" }}>
          <Svg width={100} height={100} viewBox="0 0 36 36">
            <Circle cx="18" cy="18" r="15.915" fill="none" stroke="#F1F5F9" strokeWidth="4" />
            
            {/* Sales segment */}
            <Circle
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke="#14B8A6"
              strokeWidth="4"
              strokeDasharray={`${itemPct} ${100 - parseFloat(itemPct)}`}
              strokeDashoffset="25"
            />
            {/* PO segment */}
            <Circle
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke="#3B82F6"
              strokeWidth="4"
              strokeDasharray={`${poPct} ${100 - parseFloat(poPct)}`}
              strokeDashoffset={25 - parseFloat(itemPct)}
            />
          </Svg>
          <View style={{ position: "absolute", alignItems: "center" }}>
            <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "700" }}>Total Profit</Text>
            <Text style={{ fontSize: 11, fontWeight: "800", color: "#0F172A" }}>
              {total >= 1000000 ? `${(total/1000000).toFixed(1)}Jt` : total}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: "#0F172A" }}>
      {/* Dark Premium Header */}
      <View style={{ backgroundColor: "#0F172A", paddingHorizontal: 20, paddingVertical: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={{ padding: 4, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" }}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ fontSize: 18, fontWeight: "800", color: "#fff", letterSpacing: -0.5 }}>
            Laporan & Analisis
          </Text>
          <TouchableOpacity 
            onPress={loadData}
            style={{ padding: 4, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)" }}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Custom Tab Selector */}
        <View style={{ flexDirection: "row", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 4, marginTop: 20 }}>
          <TouchableOpacity
            onPress={() => setActiveTab("cashflow")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: activeTab === "cashflow" ? "#0D9488" : "transparent",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>Aliran Kas</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={() => setActiveTab("inventory")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: activeTab === "inventory" ? "#0D9488" : "transparent",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>Inventori</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab("po")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: activeTab === "po" ? "#0D9488" : "transparent",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>Order PO</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab("profit")}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: activeTab === "profit" ? "#0D9488" : "transparent",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>Profit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Body */}
      {loading && !refreshing ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC" }}>
          <ActivityIndicator size="large" color="#0D9488" />
          <Text style={{ marginTop: 12, color: "#64748B", fontWeight: "600" }}>Memuat Analitis...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: "#F8FAFC" }}
          contentContainerStyle={{ padding: 20, paddingBottom: 30 + insets.bottom }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D9488" colors={["#0D9488"]} />
          }
        >
          {/* TAB 1: CASH FLOW */}
          {activeTab === "cashflow" && (
            <View>
              {/* Day filter selector */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#64748B" }}>PERIODE ANALISIS</Text>
                <View style={{ flexDirection: "row", backgroundColor: "#E2E8F0", borderRadius: 8, padding: 2 }}>
                  <TouchableOpacity
                    onPress={() => setTimeRange("7")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor: timeRange === "7" ? "#fff" : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: timeRange === "7" ? "#0F172A" : "#64748B" }}>7 Hari</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setTimeRange("30")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor: timeRange === "30" ? "#fff" : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: timeRange === "30" ? "#0F172A" : "#64748B" }}>30 Hari</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Financial Summary Cards */}
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#F1F5F9" }}>
                  <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "700" }}>TOTAL MASUK</Text>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#10B981", marginTop: 4 }}>
                    {formatCurrencyValue(summaryStats.totalIncome)}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#F1F5F9" }}>
                  <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "700" }}>TOTAL KELUAR</Text>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: "#EF4444", marginTop: 4 }}>
                    {formatCurrencyValue(summaryStats.totalExpense)}
                  </Text>
                </View>
              </View>

              <View style={{ backgroundColor: "#E0F2FE", borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ color: "#0369A1", fontSize: 11, fontWeight: "800" }}>SALDO NET (PERIODE INI)</Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#0369A1", marginTop: 2 }}>
                    {summaryStats.netBalance >= 0 ? "+" : ""}{formatCurrencyValue(summaryStats.netBalance)}
                  </Text>
                </View>
                <Ionicons
                  name={summaryStats.netBalance >= 0 ? "trending-up" : "trending-down"}
                  size={32}
                  color="#0284C7"
                />
              </View>

              {/* Cash Flow Line Chart */}
              {renderCashFlowChart()}
            </View>
          )}

          {/* TAB 2: INVENTORY */}
          {activeTab === "inventory" && (
            <View>
              {/* Stock Value Card */}
              <View style={{ backgroundColor: "#F0FDF4", borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ color: "#166534", fontSize: 11, fontWeight: "800" }}>TOTAL NILAI INVENTORI GUDANG</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#166534", marginTop: 2 }}>
                    {formatCurrencyValue(summaryStats.totalStockValue)}
                  </Text>
                  <Text style={{ color: "#15803D", fontSize: 11, marginTop: 2, fontWeight: "600" }}>
                    Jumlah: {summaryStats.totalItemsCount} item terdaftar
                  </Text>
                </View>
                <Ionicons name="cube" size={36} color="#15803D" />
              </View>

              {/* Sebaran Kategori Progress Bars */}
              {renderCategoryValuationList()}

              {/* Barang Fast Moving Card */}
              <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#F1F5F9", marginTop: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 12 }}>
                  Produk Fast Moving (Keluar Terbanyak)
                </Text>
                {fastMovingItems.length === 0 ? (
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>Belum ada data barang keluar</Text>
                ) : (
                  fastMovingItems.map((item, index) => {
                    const maxQtyOut = Math.max(...fastMovingItems.map(f => f.qtyOut), 1);
                    const progressWidth = `${(item.qtyOut / maxQtyOut) * 100}%`;
                    return (
                      <View key={`${item.name}-${index}`} style={{ marginVertical: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={{ fontSize: 10, color: "#64748B" }}>
                              {item.category}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: "800", color: "#0D9488" }}>
                            {item.qtyOut} unit keluar
                          </Text>
                        </View>
                        
                        <View style={{ height: 4, backgroundColor: "#F1F5F9", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                          <View style={{ width: progressWidth, height: "100%", backgroundColor: "#0D9488", borderRadius: 2 }} />
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {/* TAB 3: PO */}
          {activeTab === "po" && (
            <View>
              {/* PO Total Value Card */}
              <View style={{ backgroundColor: "#FFF7ED", borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ color: "#C2410C", fontSize: 11, fontWeight: "800" }}>TOTAL NILAI PURCHASE ORDER (PO)</Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: "#C2410C", marginTop: 2 }}>
                    {formatCurrencyValue(poStats.totalValue)}
                  </Text>
                  <Text style={{ color: "#9A3412", fontSize: 11, marginTop: 2, fontWeight: "600" }}>
                    Total: {poStats.totalOrders} order terdaftar
                  </Text>
                </View>
                <Ionicons name="document-text" size={36} color="#C2410C" />
              </View>

              {/* PO Profit Summary Card */}
              <View style={{ backgroundColor: "#F0FDF4", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#DCFCE7" }}>
                <Text style={{ color: "#15803D", fontSize: 11, fontWeight: "800", marginBottom: 12 }}>RINGKASAN KEUNTUNGAN PO</Text>
                
                {/* DONE Row */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#DCFCE7", paddingBottom: 10, marginBottom: 10 }}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#166534" }}>PO Selesai (DONE)</Text>
                    <Text style={{ fontSize: 11, color: "#15803D", marginTop: 2 }}>{poStats.doneOrders} order selesai</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 11, color: "#15803D" }}>Total Profit Realisasi</Text>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: "#166534", marginTop: 2 }}>
                      +{formatCurrencyValue(profitSummary.poProfit)}
                    </Text>
                  </View>
                </View>

                {/* PROGRESS Row */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0369A1" }}>PO Diproses (PROGRESS)</Text>
                    <Text style={{ fontSize: 11, color: "#0284C7", marginTop: 2 }}>{poStats.progressOrders} order diproses</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 11, color: "#0284C7" }}>Estimasi Potensi Profit</Text>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: "#0369A1", marginTop: 2 }}>
                      +{formatCurrencyValue(profitSummary.poProgressProfit)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Status order count summary cards */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
                <View style={{ flex: 1, backgroundColor: "#E0F2FE", borderRadius: 12, padding: 10, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: "#0369A1", fontWeight: "700" }}>DIPROSES</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#0369A1", marginTop: 4 }}>
                    {poStats.progressOrders}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#D1FAE5", borderRadius: 12, padding: 10, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: "#047857", fontWeight: "700" }}>SELESAI</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#047857", marginTop: 4 }}>
                    {poStats.doneOrders}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 12, padding: 10, alignItems: "center" }}>
                  <Text style={{ fontSize: 11, color: "#B91C1C", fontWeight: "700" }}>BATAL</Text>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#B91C1C", marginTop: 4 }}>
                    {poStats.cancelledOrders}
                  </Text>
                </View>
              </View>

              {/* Rasio Status Bar */}
              {(() => {
                const total = poStats.totalOrders;
                if (total === 0) return null;
                const donePct = ((poStats.doneOrders / total) * 100).toFixed(0);
                const progPct = ((poStats.progressOrders / total) * 100).toFixed(0);
                const cancPct = ((poStats.cancelledOrders / total) * 100).toFixed(0);
                return (
                  <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#F1F5F9", marginBottom: 16 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", marginBottom: 10 }}>Rasio Status Order PO</Text>
                    <View style={{ height: 12, backgroundColor: "#F1F5F9", borderRadius: 6, flexDirection: "row", overflow: "hidden", marginBottom: 12 }}>
                      {poStats.doneOrders > 0 && <View style={{ width: `${donePct}%`, backgroundColor: "#10B981" }} />}
                      {poStats.progressOrders > 0 && <View style={{ width: `${progPct}%`, backgroundColor: "#F59E0B" }} />}
                      {poStats.cancelledOrders > 0 && <View style={{ width: `${cancPct}%`, backgroundColor: "#EF4444" }} />}
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" }} />
                        <Text style={{ fontSize: 10, color: "#64748B" }}>Selesai ({donePct}%)</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#F59E0B" }} />
                        <Text style={{ fontSize: 10, color: "#64748B" }}>Diproses ({progPct}%)</Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" }} />
                        <Text style={{ fontSize: 10, color: "#64748B" }}>Batal ({cancPct}%)</Text>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* Top Supplier Spent List */}
              <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#F1F5F9" }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginBottom: 12 }}>
                  Pengeluaran Terbanyak per Supplier
                </Text>
                {topSuppliers.length === 0 ? (
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>Belum ada data supplier</Text>
                ) : (
                  topSuppliers.map((item, index) => {
                    const maxSpent = Math.max(...topSuppliers.map(t => t.spent), 1);
                    const progressWidth = `${(item.spent / maxSpent) * 100}%`;
                    return (
                      <View key={`${item.supplier}-${index}`} style={{ marginVertical: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                              {item.supplier}
                            </Text>
                            <Text style={{ fontSize: 10, color: "#64748B" }}>
                              {item.ordersCount} kali order
                            </Text>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: "800", color: "#C2410C" }}>
                            {formatCurrencyValue(item.spent)}
                          </Text>
                        </View>
                        
                        <View style={{ height: 4, backgroundColor: "#F1F5F9", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                          <View style={{ width: progressWidth, height: "100%", backgroundColor: "#F97316", borderRadius: 2 }} />
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Upcoming Deliveries (Jadwal Ready) */}
              <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#F1F5F9", marginTop: 16 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 12 }}>
                  <Ionicons name="calendar" size={20} color="#F97316" />
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>
                    Jadwal Kedatangan PO (Progress)
                  </Text>
                </View>

                {upcomingDeliveries.length === 0 ? (
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>Tidak ada jadwal pengiriman terdekat</Text>
                ) : (
                  upcomingDeliveries.map((item, index) => (
                    <TouchableOpacity
                      key={`${item.id}-${index}`}
                      activeOpacity={0.7}
                      onPress={() =>
                        navigation.navigate("PurchaseOrderDetail", {
                          orderId: item.id,
                          onDone: loadData,
                        })
                      }
                      style={{
                        paddingVertical: 10,
                        borderBottomWidth: index === upcomingDeliveries.length - 1 ? 0 : 1,
                        borderBottomColor: "#F1F5F9",
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A", flex: 1, marginRight: 8 }} numberOfLines={1}>
                          {item.itemName || "PO Item"} ({item.totalQty} unit)
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>
                          {formatDateDisplay(item.estimatedReadyDate)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                        Supplier: {item.supplierName} • Estimasi Nilai: {formatCurrencyValue(item.totalVal)}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          )}

          {/* TAB 3: PROFIT */}
          {activeTab === "profit" && (
            <View>
              {/* Total Profit */}
              <View style={{ backgroundColor: "#FDF2F8", borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ color: "#9D174D", fontSize: 11, fontWeight: "800" }}>TOTAL KEUNTUNGAN AKUMULATIF</Text>
                  <Text style={{ fontSize: 22, fontWeight: "800", color: "#9D174D", marginTop: 2 }}>
                    {formatCurrencyValue(profitSummary.itemProfit + profitSummary.poProfit)}
                  </Text>
                </View>
                <Ionicons name="ribbon" size={36} color="#9D174D" />
              </View>

              {/* AI Consultant Margin Card */}
              {(() => {
                const totalProfitVal = profitSummary.itemProfit + profitSummary.poProfit;
                const totalIncomeVal = profitSummary.totalRevenue;
                
                let marginPct = 0;
                let statusColor = "#EF4444";
                let statusBg = "#FEE2E2";
                let statusLabel = "KRITIS";
                let adviceText = "Peringatan: Margin negatif atau nol. Pengeluaran pengadaan barang (PO) atau biaya operasional melebihi laba kotor. Segera audit harga modal barang dan hentikan pengadaan barang yang lambat berputar (slow-moving).";
                
                if (totalIncomeVal > 0) {
                  marginPct = (totalProfitVal / totalIncomeVal) * 100;
                  if (marginPct >= 30) {
                    statusColor = "#10B981";
                    statusBg = "#D1FAE5";
                    statusLabel = "SANGAT SEHAT";
                    adviceText = "Keuntungan bisnis Anda sangat tinggi dibanding omzet pendapatan. Efisiensi biaya operasional sangat baik. Pertahankan strategi harga saat ini dan pertimbangkan untuk mereinvestasikan profit guna ekspansi stok.";
                  } else if (marginPct >= 15) {
                    statusColor = "#0284C7";
                    statusBg = "#E0F2FE";
                    statusLabel = "NORMAL / SEHAT";
                    adviceText = "Margin keuntungan berada pada rata-rata sehat untuk bisnis ritel/grosir. Untuk meningkatkan profitabilitas, coba lakukan negosiasi harga modal dengan supplier PO Anda atau kurangi biaya operasional.";
                  } else if (marginPct > 0) {
                    statusColor = "#F59E0B";
                    statusBg = "#FEF3C7";
                    statusLabel = "RENDAH (PERLU PERHATIAN)";
                    adviceText = "Margin tipis. Bisnis Anda beroperasi dengan biaya yang cukup tinggi dibanding laba bersih. Disarankan untuk meninjau kembali harga jual produk fast-moving Anda (naikkan 2-5%) atau menekan biaya modal supplier.";
                  }
                } else {
                  statusColor = "#64748B";
                  statusBg = "#F1F5F9";
                  statusLabel = "BELUM ADA OMZET";
                  adviceText = "Belum ada transaksi pendapatan (pembukuan kas masuk) yang tercatat. Silakan lakukan pencatatan uang kas masuk terlebih dahulu untuk menganalisis margin keuntungan usaha Anda.";
                }

                return (
                  <View style={{ backgroundColor: "#0F172A", borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "#1E293B", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Ionicons name="sparkles" size={18} color="#818CF8" />
                        <Text style={{ color: "#818CF8", fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>ASISTEN BISNIS PINTAR</Text>
                      </View>
                      <View style={{ backgroundColor: statusBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ color: statusColor, fontSize: 9, fontWeight: "800" }}>{statusLabel}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: "rgba(255, 255, 255, 0.08)", paddingBottom: 14, marginBottom: 14 }}>
                      <View>
                        <Text style={{ color: "#94A3B8", fontSize: 11 }}>Margin Profit Bersih</Text>
                        <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "800", marginTop: 4 }}>
                          {totalIncomeVal > 0 ? `${marginPct.toFixed(1)}%` : "-"}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: "#64748B", fontSize: 11 }}>Total Pendapatan</Text>
                        <Text style={{ color: "#E2E8F0", fontSize: 14, fontWeight: "700", marginTop: 4 }}>
                          {formatCurrencyValue(totalIncomeVal)}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ color: "#94A3B8", fontSize: 12, lineHeight: 18, fontStyle: "italic" }}>
                      "{adviceText}"
                    </Text>
                  </View>
                );
              })()}

              {/* Profit Source Comparison (Donut Chart) */}
              {renderProfitCompareChart()}

              {/* Item Profit Leaderboard */}
              <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#F1F5F9", marginTop: 16 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 12 }}>
                  <Ionicons name="trophy" size={20} color="#F59E0B" />
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>
                    Top Produk Menguntungkan
                  </Text>
                </View>

                {itemProfitLeaders.length === 0 ? (
                  <Text style={{ color: "#94A3B8", fontSize: 12 }}>Belum ada data profit barang</Text>
                ) : (
                  itemProfitLeaders.map((item, index) => (
                    <View
                      key={`${item.name}-${index}`}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingVertical: 10,
                        borderBottomWidth: index === itemProfitLeaders.length - 1 ? 0 : 1,
                        borderBottomColor: "#F1F5F9",
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                          {index + 1}. {item.name}
                        </Text>
                        <Text style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>
                          {item.category} • Terjual {item.qty} pcs
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: "#10B981" }}>
                        +{formatCurrencyValue(item.profit)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
