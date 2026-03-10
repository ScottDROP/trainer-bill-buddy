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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      company_settings: {
        Row: {
          address: string
          bank_details: string | null
          company_number: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string
          bank_details?: string | null
          company_number?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string
          bank_details?: string | null
          company_number?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          id: string
          invoice_date: string
          invoice_number: string
          pay_run_row_id: string
          pdf_file_path: string | null
          service_period_end: string
          service_period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total_due: number
          trainer_id: string
          updated_at: string
          vat_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number: string
          pay_run_row_id: string
          pdf_file_path?: string | null
          service_period_end: string
          service_period_start: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total_due?: number
          trainer_id: string
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          pay_run_row_id?: string
          pdf_file_path?: string | null
          service_period_end?: string
          service_period_start?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total_due?: number
          trainer_id?: string
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_pay_run_row_id_fkey"
            columns: ["pay_run_row_id"]
            isOneToOne: false
            referencedRelation: "pay_run_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      pay_run_line_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          location_name: string
          pay_run_row_id: string
          rate: number
          sessions: number
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          location_name: string
          pay_run_row_id: string
          rate?: number
          sessions?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          location_name?: string
          pay_run_row_id?: string
          rate?: number
          sessions?: number
        }
        Relationships: [
          {
            foreignKeyName: "pay_run_line_items_pay_run_row_id_fkey"
            columns: ["pay_run_row_id"]
            isOneToOne: false
            referencedRelation: "pay_run_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_run_rows: {
        Row: {
          created_at: string
          hourly_rate_csv: number
          id: string
          match_status: Database["public"]["Enums"]["match_status"]
          matched_trainer_id: string | null
          pay_run_id: string
          total_cost: number
          total_sessions: number
          trainer_name_csv: string
          validation_warnings: Json | null
        }
        Insert: {
          created_at?: string
          hourly_rate_csv?: number
          id?: string
          match_status?: Database["public"]["Enums"]["match_status"]
          matched_trainer_id?: string | null
          pay_run_id: string
          total_cost?: number
          total_sessions?: number
          trainer_name_csv: string
          validation_warnings?: Json | null
        }
        Update: {
          created_at?: string
          hourly_rate_csv?: number
          id?: string
          match_status?: Database["public"]["Enums"]["match_status"]
          matched_trainer_id?: string | null
          pay_run_id?: string
          total_cost?: number
          total_sessions?: number
          trainer_name_csv?: string
          validation_warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pay_run_rows_matched_trainer_id_fkey"
            columns: ["matched_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_run_rows_pay_run_id_fkey"
            columns: ["pay_run_id"]
            isOneToOne: false
            referencedRelation: "pay_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_runs: {
        Row: {
          created_at: string
          csv_file_path: string | null
          id: string
          month: number
          status: Database["public"]["Enums"]["pay_run_status"]
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          csv_file_path?: string | null
          id?: string
          month: number
          status?: Database["public"]["Enums"]["pay_run_status"]
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          csv_file_path?: string | null
          id?: string
          month?: number
          status?: Database["public"]["Enums"]["pay_run_status"]
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      trainers: {
        Row: {
          aliases: string[] | null
          bank_account_number: string | null
          bank_sort_code: string | null
          company_name: string | null
          company_number: string | null
          created_at: string
          default_hourly_rate: number | null
          email: string | null
          full_name: string
          guarantee_amount: number | null
          id: string
          invoicing_address: string | null
          payment_terms: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          aliases?: string[] | null
          bank_account_number?: string | null
          bank_sort_code?: string | null
          company_name?: string | null
          company_number?: string | null
          created_at?: string
          default_hourly_rate?: number | null
          email?: string | null
          full_name: string
          guarantee_amount?: number | null
          id?: string
          invoicing_address?: string | null
          payment_terms?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          aliases?: string[] | null
          bank_account_number?: string | null
          bank_sort_code?: string | null
          company_name?: string | null
          company_number?: string | null
          created_at?: string
          default_hourly_rate?: number | null
          email?: string | null
          full_name?: string
          guarantee_amount?: number | null
          id?: string
          invoicing_address?: string | null
          payment_terms?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      invoice_status: "draft" | "final"
      match_status: "auto_matched" | "alias_matched" | "manual" | "unmatched"
      pay_run_status: "uploaded" | "matched" | "reviewed" | "invoiced"
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
      invoice_status: ["draft", "final"],
      match_status: ["auto_matched", "alias_matched", "manual", "unmatched"],
      pay_run_status: ["uploaded", "matched", "reviewed", "invoiced"],
    },
  },
} as const
