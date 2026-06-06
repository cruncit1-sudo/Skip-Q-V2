export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          created_at: string
          id: string
          is_default: boolean
          label: string | null
          latitude: number | null
          line1: string
          line2: string | null
          longitude: number | null
          phone: string
          pincode: string
          recipient: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          line1: string
          line2?: string | null
          longitude?: number | null
          phone: string
          pincode: string
          recipient: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          line1?: string
          line2?: string | null
          longitude?: number | null
          phone?: string
          pincode?: string
          recipient?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action_type: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      master_admin: {
        Row: {
          created_at: string
          id: string
          password_hash: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          password_hash: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          password_hash?: string
          username?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          is_veg: boolean
          name: string
          prep_minutes: number | null
          price: number
          seller_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_veg?: boolean
          name: string
          prep_minutes?: number | null
          price: number
          seller_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_veg?: boolean
          name?: string
          prep_minutes?: number | null
          price?: number
          seller_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          menu_item_id: string | null
          name: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          menu_item_id?: string | null
          name: string
          order_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          menu_item_id?: string | null
          name?: string
          order_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          delivery_address: Json
          delivery_fee: number
          discount: number
          id: string
          notes: string | null
          order_number: string
          placed_at: string
          seller_id: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          delivery_address: Json
          delivery_fee?: number
          discount?: number
          id?: string
          notes?: string | null
          order_number?: string
          placed_at?: string
          seller_id: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax?: number
          total: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          delivery_address?: Json
          delivery_fee?: number
          discount?: number
          id?: string
          notes?: string | null
          order_number?: string
          placed_at?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_attempts: {
        Row: {
          created_at: string
          id: string
          identifier: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string
          error_code: string | null
          error_description: string | null
          id: string
          method: string | null
          order_id: string
          raw_response: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_id: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          method?: string | null
          order_id: string
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string
          error_code?: string | null
          error_description?: string | null
          id?: string
          method?: string | null
          order_id?: string
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_offers: {
        Row: {
          condition: string
          created_at: string
          discount_pct: number
          end_date: string | null
          id: string
          is_active: boolean
          item_ids: string[]
          kind: string
          name: string
          seller_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          condition?: string
          created_at?: string
          discount_pct?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          item_ids?: string[]
          kind?: string
          name: string
          seller_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          condition?: string
          created_at?: string
          discount_pct?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          item_ids?: string[]
          kind?: string
          name?: string
          seller_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seller_products: {
        Row: {
          available_from: string | null
          available_to: string | null
          available_until: string | null
          category: string | null
          created_at: string
          emoji: string | null
          id: string
          inventory_type: string
          is_active: boolean
          last_sold_at: string | null
          price: number
          product_name: string
          seller_id: string | null
          stock_limit: number | null
          stock_quantity: number | null
          total_revenue: number
          total_sold: number
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          available_to?: string | null
          available_until?: string | null
          category?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          inventory_type?: string
          is_active?: boolean
          last_sold_at?: string | null
          price: number
          product_name: string
          seller_id?: string | null
          stock_limit?: number | null
          stock_quantity?: number | null
          total_revenue?: number
          total_sold?: number
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          available_to?: string | null
          available_until?: string | null
          category?: string | null
          created_at?: string
          emoji?: string | null
          id?: string
          inventory_type?: string
          is_active?: boolean
          last_sold_at?: string | null
          price?: number
          product_name?: string
          seller_id?: string | null
          stock_limit?: number | null
          stock_quantity?: number | null
          total_revenue?: number
          total_sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_profiles: {
        Row: {
          address_line: string | null
          approved_at: string | null
          approved_by: string | null
          business_name: string
          city: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          invited_by: string | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          pincode: string | null
          state: string | null
          status: Database["public"]["Enums"]["seller_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_name: string
          city?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invited_by?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          pincode?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_name?: string
          city?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invited_by?: string | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          pincode?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["seller_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_sales: {
        Row: {
          created_at: string
          date: string
          id: string
          seller_id: string | null
          total_orders: number
          total_revenue: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          seller_id?: string | null
          total_orders?: number
          total_revenue?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          seller_id?: string | null
          total_orders?: number
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "seller_sales_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_sessions: {
        Row: {
          id: string
          ip_address: string | null
          logged_in_at: string
          logged_out_at: string | null
          seller_id: string | null
        }
        Insert: {
          id?: string
          ip_address?: string | null
          logged_in_at?: string
          logged_out_at?: string | null
          seller_id?: string | null
        }
        Update: {
          id?: string
          ip_address?: string | null
          logged_in_at?: string
          logged_out_at?: string | null
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_sessions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          canteen_location: string
          canteen_name: string
          canteen_type: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean
          is_suspended: boolean
          name: string
          password_hash: string
          phone: string
          upi_id: string | null
          username: string | null
        }
        Insert: {
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          canteen_location: string
          canteen_name: string
          canteen_type?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean
          is_suspended?: boolean
          name: string
          password_hash: string
          phone: string
          upi_id?: string | null
          username?: string | null
        }
        Update: {
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          canteen_location?: string
          canteen_name?: string
          canteen_type?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean
          is_suspended?: boolean
          name?: string
          password_hash?: string
          phone?: string
          upi_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      user_analytics: {
        Row: {
          created_at: string
          dwell_seconds: number
          event_type: string
          id: string
          metadata: Json | null
          screen_name: string
          scroll_depth_pct: number
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          dwell_seconds?: number
          event_type: string
          id?: string
          metadata?: Json | null
          screen_name: string
          scroll_depth_pct?: number
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          dwell_seconds?: number
          event_type?: string
          id?: string
          metadata?: Json | null
          screen_name?: string
          scroll_depth_pct?: number
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_spend: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string | null
          payment_method: string | null
          product_names: string[] | null
          seller_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id?: string | null
          payment_method?: string | null
          product_names?: string[] | null
          seller_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          payment_method?: string | null
          product_names?: string[] | null
          seller_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_spend_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          college_name: string
          created_at: string
          full_name: string
          id: string
          phone: string
          pin_hash: string
          razorpay_customer_id: string | null
          user_id: string
        }
        Insert: {
          college_name: string
          created_at?: string
          full_name: string
          id?: string
          phone: string
          pin_hash: string
          razorpay_customer_id?: string | null
          user_id: string
        }
        Update: {
          college_name?: string
          created_at?: string
          full_name?: string
          id?: string
          phone?: string
          pin_hash?: string
          razorpay_customer_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_password: { Args: { p_password: string }; Returns: string }
      is_cod_allowed: { Args: never; Returns: boolean }
      is_item_available: { Args: { product_id: string }; Returns: boolean }
      reduce_seller_stock: {
        Args: { p_product_id: string; p_qty: number }
        Returns: undefined
      }
      update_time_based_availability: { Args: never; Returns: undefined }
      verify_master_admin: {
        Args: { p_password: string; p_username: string }
        Returns: boolean
      }
      verify_seller_password: {
        Args: { p_password: string; p_seller_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "seller" | "customer"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      payment_status:
        | "created"
        | "authorized"
        | "captured"
        | "failed"
        | "refunded"
      seller_status: "pending" | "approved" | "suspended" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "seller", "customer"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      payment_status: [
        "created",
        "authorized",
        "captured",
        "failed",
        "refunded",
      ],
      seller_status: ["pending", "approved", "suspended", "rejected"],
    },
  },
} as const
