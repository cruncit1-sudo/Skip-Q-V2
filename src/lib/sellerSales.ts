import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { rangeBounds, type RangeKey } from "@/lib/sellerStats";

export type SaleItem = {
  itemId: string;
  name: string;
  price: number;
  qty: number;
  category?: string;
  icon?: string;
  canteenId?: string;
  canteenIcon?: string;
};

export type SaleDocument = {
  uid: string;
  orderId: string;
  totalAmount: number;
  timestamp: any;
  collectedAt: string;
  items: SaleItem[];
};

export const getSellerSalesStats = async (sellerUid: string, range?: RangeKey) => {
  try {
    // Reference to the 'sales' subcollection for a specific seller
    const salesRef = collection(db, "sellers", sellerUid, "sales");
    
    let q = query(salesRef);
    
    // Apply date filtering if a range (e.g., "today") is provided
    if (range) {
      const { from, to } = rangeBounds(range);
      q = query(
        salesRef,
        where("timestamp", ">=", Timestamp.fromMillis(from)),
        where("timestamp", "<=", Timestamp.fromMillis(to))
      );
    }

    const salesSnapshot = await getDocs(q);
    
    let totalRevenue = 0;
    let totalOrders = 0;
    
    // Using an Object to track how many of each item was sold
    const itemStats: Record<string, { name: string; qtySold: number; revenueGenerated: number }> = {};
    
    salesSnapshot.forEach((doc) => {
      const data = doc.data() as SaleDocument;
      
      totalOrders += 1;
      totalRevenue += data.totalAmount || 0;
      
      // Calculate per-item statistics
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item) => {
          if (!itemStats[item.itemId]) {
            itemStats[item.itemId] = {
              name: item.name,
              qtySold: 0,
              revenueGenerated: 0,
            };
          }
          itemStats[item.itemId].qtySold += item.qty;
          itemStats[item.itemId].revenueGenerated += (item.qty * item.price);
        });
      }
    });

    return {
      totalRevenue,
      totalOrders,
      // Convert to array so it's easy to map over in your React components (.map)
      itemStats: Object.values(itemStats), 
    };
    
  } catch (error) {
    console.error("Error calculating sales:", error);
    throw error;
  }
};