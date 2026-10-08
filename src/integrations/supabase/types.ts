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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          area: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          level: string
          path: string | null
          source: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          area?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          level?: string
          path?: string | null
          source?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          area?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          level?: string
          path?: string | null
          source?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          event_id: string | null
          id: string
          max_uses: number | null
          min_amount: number | null
          percent: number
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          event_id?: string | null
          id?: string
          max_uses?: number | null
          min_amount?: number | null
          percent: number
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          event_id?: string | null
          id?: string
          max_uses?: number | null
          min_amount?: number | null
          percent?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string
          id: string
          kind: string
          order_id: string | null
          recipient: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          order_id?: string | null
          recipient: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          order_id?: string | null
          recipient?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      event_documents: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_file: boolean
          kind: string
          position: number
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_file?: boolean
          kind?: string
          position?: number
          title: string
          url: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          is_file?: boolean
          kind?: string
          position?: number
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_documents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          event_id: string
          id: string
          image_url: string | null
          name: string
          position: number
          price: number
          sizes: string[]
          sold: number
          stock: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          image_url?: string | null
          name: string
          position?: number
          price?: number
          sizes?: string[]
          sold?: number
          stock?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          image_url?: string | null
          name?: string
          position?: number
          price?: number
          sizes?: string[]
          sold?: number
          stock?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_products_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: Database["public"]["Enums"]["event_category"]
          city: string | null
          cover_url: string | null
          created_at: string
          custom_fields: Json
          description: string | null
          ends_at: string | null
          featured: boolean
          fee_fixed: number | null
          fee_percent: number | null
          id: string
          producer_id: string
          registration_ends_at: string | null
          registration_limit: number | null
          registrations_open_at: string | null
          route_map_url: string | null
          shirt_enabled: boolean
          shirt_sizes: string[]
          short_description: string | null
          slug: string
          starts_at: string
          state: string | null
          status: Database["public"]["Enums"]["event_status"]
          terms: Json
          title: string
          venue: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["event_category"]
          city?: string | null
          cover_url?: string | null
          created_at?: string
          custom_fields?: Json
          description?: string | null
          ends_at?: string | null
          featured?: boolean
          fee_fixed?: number | null
          fee_percent?: number | null
          id?: string
          producer_id: string
          registration_ends_at?: string | null
          registration_limit?: number | null
          registrations_open_at?: string | null
          route_map_url?: string | null
          shirt_enabled?: boolean
          shirt_sizes?: string[]
          short_description?: string | null
          slug: string
          starts_at: string
          state?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          terms?: Json
          title: string
          venue?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["event_category"]
          city?: string | null
          cover_url?: string | null
          created_at?: string
          custom_fields?: Json
          description?: string | null
          ends_at?: string | null
          featured?: boolean
          fee_fixed?: number | null
          fee_percent?: number | null
          id?: string
          producer_id?: string
          registration_ends_at?: string | null
          registration_limit?: number | null
          registrations_open_at?: string | null
          route_map_url?: string | null
          shirt_enabled?: boolean
          shirt_sizes?: string[]
          short_description?: string | null
          slug?: string
          starts_at?: string
          state?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          terms?: Json
          title?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_terms: Json
          asaas_fee_estimate: number
          asaas_payment_id: string | null
          bank_slip_url: string | null
          code: string
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          custom_answers: Json
          discount: number
          due_date: string | null
          event_id: string
          id: string
          invoice_url: string | null
          items: Json
          paid_at: string | null
          participant_birth_date: string | null
          participant_cpf: string
          participant_email: string
          participant_gender: string | null
          participant_name: string
          participant_phone: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          pix_payload: string | null
          pix_qr_image: string | null
          platform_amount: number
          producer_amount: number
          producer_id: string
          products_total: number
          receipt_url: string | null
          service_fee: number
          shirt_size: string | null
          status: Database["public"]["Enums"]["order_status"]
          team: string | null
          ticket_price: number
          ticket_type_id: string
          total: number
          user_id: string
        }
        Insert: {
          accepted_terms?: Json
          asaas_fee_estimate?: number
          asaas_payment_id?: string | null
          bank_slip_url?: string | null
          code?: string
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          custom_answers?: Json
          discount?: number
          due_date?: string | null
          event_id: string
          id?: string
          invoice_url?: string | null
          items?: Json
          paid_at?: string | null
          participant_birth_date?: string | null
          participant_cpf: string
          participant_email: string
          participant_gender?: string | null
          participant_name: string
          participant_phone?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          pix_payload?: string | null
          pix_qr_image?: string | null
          platform_amount: number
          producer_amount: number
          producer_id: string
          products_total?: number
          receipt_url?: string | null
          service_fee?: number
          shirt_size?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          team?: string | null
          ticket_price: number
          ticket_type_id: string
          total: number
          user_id: string
        }
        Update: {
          accepted_terms?: Json
          asaas_fee_estimate?: number
          asaas_payment_id?: string | null
          bank_slip_url?: string | null
          code?: string
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          custom_answers?: Json
          discount?: number
          due_date?: string | null
          event_id?: string
          id?: string
          invoice_url?: string | null
          items?: Json
          paid_at?: string | null
          participant_birth_date?: string | null
          participant_cpf?: string
          participant_email?: string
          participant_gender?: string | null
          participant_name?: string
          participant_phone?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          pix_payload?: string | null
          pix_qr_image?: string | null
          platform_amount?: number
          producer_amount?: number
          producer_id?: string
          products_total?: number
          receipt_url?: string | null
          service_fee?: number
          shirt_size?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          team?: string | null
          ticket_price?: number
          ticket_type_id?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          asaas_api_key: string | null
          asaas_env: string
          asaas_fee_boleto: number
          asaas_fee_card_fixed: number
          asaas_fee_card_percent: number
          asaas_fee_paid_by: string
          asaas_fee_pix: number
          asaas_webhook_token: string | null
          boleto_due_days: number
          card_release_days: number
          email_from_address: string | null
          email_from_name: string | null
          enable_boleto: boolean
          enable_card: boolean
          enable_pix: boolean
          fee_fixed: number
          fee_paid_by_buyer: boolean
          fee_percent: number
          home_images: Json
          id: number
          max_installments: number
          platform_wallet_id: string | null
          site_domain: string | null
          site_favicon: string | null
          site_logo: string | null
          site_name: string
          support_email: string | null
          updated_at: string
        }
        Insert: {
          asaas_api_key?: string | null
          asaas_env?: string
          asaas_fee_boleto?: number
          asaas_fee_card_fixed?: number
          asaas_fee_card_percent?: number
          asaas_fee_paid_by?: string
          asaas_fee_pix?: number
          asaas_webhook_token?: string | null
          boleto_due_days?: number
          card_release_days?: number
          email_from_address?: string | null
          email_from_name?: string | null
          enable_boleto?: boolean
          enable_card?: boolean
          enable_pix?: boolean
          fee_fixed?: number
          fee_paid_by_buyer?: boolean
          fee_percent?: number
          home_images?: Json
          id?: number
          max_installments?: number
          platform_wallet_id?: string | null
          site_domain?: string | null
          site_favicon?: string | null
          site_logo?: string | null
          site_name?: string
          support_email?: string | null
          updated_at?: string
        }
        Update: {
          asaas_api_key?: string | null
          asaas_env?: string
          asaas_fee_boleto?: number
          asaas_fee_card_fixed?: number
          asaas_fee_card_percent?: number
          asaas_fee_paid_by?: string
          asaas_fee_pix?: number
          asaas_webhook_token?: string | null
          boleto_due_days?: number
          card_release_days?: number
          email_from_address?: string | null
          email_from_name?: string | null
          enable_boleto?: boolean
          enable_card?: boolean
          enable_pix?: boolean
          fee_fixed?: number
          fee_paid_by_buyer?: boolean
          fee_percent?: number
          home_images?: Json
          id?: number
          max_installments?: number
          platform_wallet_id?: string | null
          site_domain?: string | null
          site_favicon?: string | null
          site_logo?: string | null
          site_name?: string
          support_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      producer_bank_accounts: {
        Row: {
          account: string
          account_digit: string | null
          account_type: string
          agency: string
          agency_digit: string | null
          bank_code: string
          bank_name: string
          owner_document: string
          owner_name: string
          producer_id: string
          updated_at: string
        }
        Insert: {
          account: string
          account_digit?: string | null
          account_type?: string
          agency: string
          agency_digit?: string | null
          bank_code: string
          bank_name: string
          owner_document: string
          owner_name: string
          producer_id: string
          updated_at?: string
        }
        Update: {
          account?: string
          account_digit?: string | null
          account_type?: string
          agency?: string
          agency_digit?: string | null
          bank_code?: string
          bank_name?: string
          owner_document?: string
          owner_name?: string
          producer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_bank_accounts_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: true
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_secrets: {
        Row: {
          asaas_api_key: string | null
          producer_id: string
          updated_at: string
        }
        Insert: {
          asaas_api_key?: string | null
          producer_id: string
          updated_at?: string
        }
        Update: {
          asaas_api_key?: string | null
          producer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_secrets_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: true
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      producers: {
        Row: {
          address: string | null
          address_number: string | null
          asaas_account_id: string | null
          asaas_wallet_id: string | null
          birth_date: string | null
          company_name: string
          company_type: string | null
          created_at: string
          document: string
          email: string
          fee_fixed: number | null
          fee_percent: number | null
          id: string
          income_value: number | null
          phone: string | null
          postal_code: string | null
          province: string | null
          status: Database["public"]["Enums"]["producer_status"]
          user_id: string
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          asaas_account_id?: string | null
          asaas_wallet_id?: string | null
          birth_date?: string | null
          company_name: string
          company_type?: string | null
          created_at?: string
          document: string
          email: string
          fee_fixed?: number | null
          fee_percent?: number | null
          id?: string
          income_value?: number | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["producer_status"]
          user_id: string
        }
        Update: {
          address?: string | null
          address_number?: string | null
          asaas_account_id?: string | null
          asaas_wallet_id?: string | null
          birth_date?: string | null
          company_name?: string
          company_type?: string | null
          created_at?: string
          document?: string
          email?: string
          fee_fixed?: number | null
          fee_percent?: number | null
          id?: string
          income_value?: number | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: Database["public"]["Enums"]["producer_status"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          asaas_customer_id: string | null
          birth_date: string | null
          city: string | null
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string | null
          gender: string | null
          id: string
          phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          asaas_customer_id?: string | null
          birth_date?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          birth_date?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ticket_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          event_id: string
          id: string
          name: string
          position: number
          price: number
          quantity: number
          sales_end: string | null
          sales_start: string | null
          sold: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          name: string
          position?: number
          price: number
          quantity?: number
          sales_end?: string | null
          sales_start?: string | null
          sold?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          name?: string
          position?: number
          price?: number
          quantity?: number
          sales_end?: string | null
          sales_start?: string | null
          sold?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          asaas_transfer_id: string | null
          attempts: number
          bank: Json
          code_expires_at: string | null
          code_hash: string | null
          confirmed_at: string | null
          created_at: string
          error: string | null
          id: string
          processed_at: string | null
          producer_id: string
          status: string
        }
        Insert: {
          amount: number
          asaas_transfer_id?: string | null
          attempts?: number
          bank?: Json
          code_expires_at?: string | null
          code_hash?: string | null
          confirmed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          processed_at?: string | null
          producer_id: string
          status?: string
        }
        Update: {
          amount?: number
          asaas_transfer_id?: string | null
          attempts?: number
          bank?: Json
          code_expires_at?: string | null
          code_hash?: string | null
          confirmed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          processed_at?: string | null
          producer_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      financial_summary: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_producer_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "super_admin" | "producer" | "athlete"
      event_category: "esporte" | "show" | "congresso" | "curso" | "outro"
      event_status: "rascunho" | "publicado" | "encerrado" | "cancelado"
      order_status: "pendente" | "pago" | "vencido" | "estornado" | "cancelado"
      payment_method: "PIX" | "BOLETO" | "CREDIT_CARD"
      producer_status: "pendente" | "aprovado" | "suspenso"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["super_admin", "producer", "athlete"],
      event_category: ["esporte", "show", "congresso", "curso", "outro"],
      event_status: ["rascunho", "publicado", "encerrado", "cancelado"],
      order_status: ["pendente", "pago", "vencido", "estornado", "cancelado"],
      payment_method: ["PIX", "BOLETO", "CREDIT_CARD"],
      producer_status: ["pendente", "aprovado", "suspenso"],
    },
  },
} as const
