import { exec } from "./database";

// Menambahkan notifikasi baru ke database
export async function addNotification(title, message, category) {
  try {
    await exec(
      "INSERT INTO notifications (title, message, category, is_read) VALUES (?, ?, ?, 0)",
      [title, message, category]
    );
    console.log(`NOTIFICATION ADDED: ${title}`);
  } catch (error) {
    console.log("Error adding notification:", error);
  }
}

// Mendapatkan seluruh daftar notifikasi (terbaru di atas)
export async function getNotifications() {
  try {
    const res = await exec("SELECT * FROM notifications ORDER BY id DESC LIMIT 100");
    return res.rows._array || [];
  } catch (error) {
    console.log("Error fetching notifications:", error);
    return [];
  }
}

// Mengubah status satu notifikasi menjadi sudah dibaca
export async function markNotificationAsRead(id) {
  try {
    await exec("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
  } catch (error) {
    console.log("Error marking notification read:", error);
  }
}

// Mengubah status seluruh notifikasi menjadi sudah dibaca
export async function markAllNotificationsAsRead() {
  try {
    await exec("UPDATE notifications SET is_read = 1 WHERE is_read = 0");
  } catch (error) {
    console.log("Error marking all notifications read:", error);
  }
}

// Mendapatkan jumlah notifikasi yang belum dibaca
export async function getUnreadNotificationCount() {
  try {
    const res = await exec("SELECT COUNT(*) as count FROM notifications WHERE is_read = 0");
    return res.rows.item(0).count || 0;
  } catch (error) {
    console.log("Error getting unread count:", error);
    return 0;
  }
}

// Mengecek kondisi dan membuat notifikasi/alert secara otomatis dengan detail lengkap
export async function checkAndGenerateAlerts() {
  try {
    // 1. Cek Purchase Orders (PO) Jatuh Tempo (H-1 sebelum Close atau Ready)
    const poRes = await exec(
      "SELECT id, supplier_name, item_name, quantity, price, close_po_date, estimated_ready_date FROM purchase_orders WHERE status = 'PROGRESS'"
    );
    const activePOs = poRes.rows._array || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (const po of activePOs) {
      const totalPoValue = (po.quantity || 0) * (po.price || 0);
      const formattedTotal = totalPoValue.toLocaleString("id-ID");

      // Cek Tanggal Close PO (H-1)
      if (po.close_po_date) {
        const closeDate = new Date(po.close_po_date);
        closeDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((closeDate.getTime() - today.getTime()) / oneDayMs);

        if (diffDays === 1) {
          const signature = `[PO-CLOSE-ID-${po.id}]`;
          const existsRes = await exec("SELECT COUNT(*) as count FROM notifications WHERE message LIKE ?", [`%${signature}%`]);
          if (existsRes.rows.item(0).count === 0) {
            await addNotification(
              "PO Akan Close Besok",
              `Purchase Order #${po.id} senilai Rp ${formattedTotal} (${po.quantity} pcs "${po.item_name}") dari pemasok ${po.supplier_name || "-"} akan segera ditutup (Close PO) besok pada tanggal ${po.close_po_date}. Mohon segera lakukan konfirmasi pemesanan ke supplier. ${signature}`,
              "po"
            );
          }
        }
      }

      // Cek Tanggal Estimasi Ready Barang (H-1)
      if (po.estimated_ready_date) {
        const readyDate = new Date(po.estimated_ready_date);
        readyDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((readyDate.getTime() - today.getTime()) / oneDayMs);

        if (diffDays === 1) {
          const signature = `[PO-READY-ID-${po.id}]`;
          const existsRes = await exec("SELECT COUNT(*) as count FROM notifications WHERE message LIKE ?", [`%${signature}%`]);
          if (existsRes.rows.item(0).count === 0) {
            await addNotification(
              "Barang PO Ready Besok",
              `Pesanan PO #${po.id} ("${po.item_name}" sebanyak ${po.quantity} pcs) diestimasikan siap dikirim/diambil besok pada tanggal ${po.estimated_ready_date} dari pemasok ${po.supplier_name || "-"}. Harap persiapkan penerimaan barang dengan baik. ${signature}`,
              "po"
            );
          }
        }
      }
    }

    // 2. Cek Stok Barang Habis (Hanya stok = 0)
    const itemsRes = await exec("SELECT id, name, category, price, stock FROM items WHERE stock = 0");
    const outOfStockItems = itemsRes.rows._array || [];

    for (const item of outOfStockItems) {
      const signature = `[ITEM-OUT-ID-${item.id}]`;
      const existsRes = await exec("SELECT COUNT(*) as count FROM notifications WHERE message LIKE ?", [`%${signature}%`]);
      if (existsRes.rows.item(0).count === 0) {
        const formattedPrice = (item.price || 0).toLocaleString("id-ID");
        const categoryLabel = item.category ? `Kategori: ${item.category}` : "Tanpa Kategori";
        await addNotification(
          "Stok Habis!",
          `Barang "${item.name}" (${categoryLabel}, Harga Jual: Rp ${formattedPrice}) saat ini kosong (stok: 0 pcs). Segera lakukan pemesanan ulang (PO) ke pemasok untuk menghindari kehilangan potensi transaksi penjualan. ${signature}`,
          "barang"
        );
      }
    }

    // 3. Cek Keuangan - Pengingat Tutup Buku Harian (Daily Cash Reminder)
    const todayStr = today.toLocaleDateString("sv-SE"); // Format YYYY-MM-DD
    const dailyRes = await exec("SELECT COUNT(*) as count FROM bookkeeping_entries WHERE entry_date = ?", [todayStr]);
    const dailyCount = dailyRes.rows.item(0).count || 0;

    if (dailyCount === 0) {
      const signature = `[KAS-DAILY-ALERT-${todayStr}]`;
      const existsRes = await exec("SELECT COUNT(*) as count FROM notifications WHERE message LIKE ?", [`%${signature}%`]);
      if (existsRes.rows.item(0).count === 0) {
        await addNotification(
          "Pengingat Tutup Buku",
          `Anda belum mencatat transaksi keuangan hari ini (tanggal ${todayStr}). Segera catat pemasukan atau pengeluaran kas hari ini agar pembukuan keuangan toko Anda tetap rapi dan akurat! ${signature}`,
          "keuangan"
        );
      }
    }

    // 4. Cek Keuangan - Laporan Ringkasan Bulanan (Monthly Cash Summary)
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = String(prevMonthDate.getMonth() + 1).padStart(2, "0");
    const prevMonthStr = `${prevYear}-${prevMonth}`; // Format YYYY-MM

    const summarySignature = `[KAS-MONTHLY-SUMMARY-${prevMonthStr}]`;
    const existsRes = await exec("SELECT COUNT(*) as count FROM notifications WHERE message LIKE ?", [`%${summarySignature}%`]);
    if (existsRes.rows.item(0).count === 0) {
      // Ambil ringkasan kas bulan lalu
      const incomeRes = await exec("SELECT IFNULL(SUM(amount), 0) as total FROM bookkeeping_entries WHERE amount > 0 AND entry_date LIKE ?", [`${prevMonthStr}%`]);
      const expenseRes = await exec("SELECT IFNULL(SUM(amount), 0) as total FROM bookkeeping_entries WHERE amount < 0 AND entry_date LIKE ?", [`${prevMonthStr}%`]);
      
      const totalIncome = incomeRes.rows.item(0).total || 0;
      const totalExpense = Math.abs(expenseRes.rows.item(0).total || 0);
      
      // Jika ada transaksi, buat ringkasan
      if (totalIncome > 0 || totalExpense > 0) {
        const netFlow = totalIncome - totalExpense;
        const formattedIncome = totalIncome.toLocaleString("id-ID");
        const formattedExpense = totalExpense.toLocaleString("id-ID");
        const formattedNet = Math.abs(netFlow).toLocaleString("id-ID");
        const flowLabel = netFlow >= 0 ? "Surplus (Untung)" : "Defisit (Rugi)";

        // Format nama bulan untuk bahasa Indonesia
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const monthName = monthNames[prevMonthDate.getMonth()];

        await addNotification(
          "Laporan Keuangan Bulanan",
          `Ringkasan keuangan toko Anda pada bulan ${monthName} ${prevYear}: Total Pemasukan Rp ${formattedIncome}, Total Pengeluaran Rp ${formattedExpense}. Arus kas bersih mengalami ${flowLabel} sebesar Rp ${formattedNet}. ${summarySignature}`,
          "keuangan"
        );
      }
    }
  } catch (error) {
    console.log("Error checking alerts:", error);
  }
}

// Menghapus satu notifikasi berdasarkan ID
export async function deleteNotification(id) {
  try {
    await exec("DELETE FROM notifications WHERE id = ?", [id]);
  } catch (error) {
    console.log("Error deleting notification:", error);
    throw error;
  }
}

// Menghapus semua notifikasi
export async function deleteAllNotifications() {
  try {
    await exec("DELETE FROM notifications");
  } catch (error) {
    console.log("Error deleting all notifications:", error);
    throw error;
  }
}
