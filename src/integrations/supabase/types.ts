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
      admin_state: {
        Row: {
          data: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          data?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_step: number
          first_message_id: string | null
          id: string
          last_error: string | null
          lead_id: string
          mailbox_id: string | null
          next_send_at: string
          replied_at: string | null
          sequence_id: string
          status: string
          thread_id: string | null
          unsub_token: string
          updated_at: string
          variant: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          first_message_id?: string | null
          id?: string
          last_error?: string | null
          lead_id: string
          mailbox_id?: string | null
          next_send_at?: string
          replied_at?: string | null
          sequence_id: string
          status?: string
          thread_id?: string | null
          unsub_token?: string
          updated_at?: string
          variant?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: number
          first_message_id?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string
          mailbox_id?: string | null
          next_send_at?: string
          replied_at?: string | null
          sequence_id?: string
          status?: string
          thread_id?: string | null
          unsub_token?: string
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          ciphertext: string
          name: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          ciphertext: string
          name: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          ciphertext?: string
          name?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          city: string
          company: string
          contact_name: string
          contact_title: string
          created_at: string
          created_by: string | null
          domain: string | null
          email: string | null
          email_guessed: boolean
          email_source: string
          email_verified: string
          id: string
          industry: string
          linkedin: string
          notes: string
          phone: string
          place_id: string | null
          raw_id: string | null
          region: string
          score: number
          score_reasons: string[]
          signals: Json
          source: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string
          company?: string
          contact_name?: string
          contact_title?: string
          created_at?: string
          created_by?: string | null
          domain?: string | null
          email?: string | null
          email_guessed?: boolean
          email_source?: string
          email_verified?: string
          id?: string
          industry?: string
          linkedin?: string
          notes?: string
          phone?: string
          place_id?: string | null
          raw_id?: string | null
          region?: string
          score?: number
          score_reasons?: string[]
          signals?: Json
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string
          company?: string
          contact_name?: string
          contact_title?: string
          created_at?: string
          created_by?: string | null
          domain?: string | null
          email?: string | null
          email_guessed?: boolean
          email_source?: string
          email_verified?: string
          id?: string
          industry?: string
          linkedin?: string
          notes?: string
          phone?: string
          place_id?: string | null
          raw_id?: string | null
          region?: string
          score?: number
          score_reasons?: string[]
          signals?: Json
          source?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      mailbox_tokens: {
        Row: {
          access_token: string | null
          expires_at: string | null
          ghl_api_key: string | null
          ghl_company_id: string | null
          ghl_location_id: string | null
          mailbox_id: string
          refresh_token: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          expires_at?: string | null
          ghl_api_key?: string | null
          ghl_company_id?: string | null
          ghl_location_id?: string | null
          mailbox_id: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          expires_at?: string | null
          ghl_api_key?: string | null
          ghl_company_id?: string | null
          ghl_location_id?: string | null
          mailbox_id?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_tokens_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: true
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      mailboxes: {
        Row: {
          created_at: string
          created_by: string | null
          daily_cap: number
          display_name: string
          email: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          provider: string
          send_days: number[]
          signature: string
          status: string
          timezone: string
          updated_at: string
          window_end: number
          window_start: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_cap?: number
          display_name?: string
          email: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          send_days?: number[]
          signature?: string
          status?: string
          timezone?: string
          updated_at?: string
          window_end?: number
          window_start?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_cap?: number
          display_name?: string
          email?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          send_days?: number[]
          signature?: string
          status?: string
          timezone?: string
          updated_at?: string
          window_end?: number
          window_start?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          body_text: string | null
          direction: string
          draft_reply: string | null
          enrollment_id: string | null
          error: string | null
          from_header: string | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          handled_at: string | null
          id: string
          intent: string | null
          kind: string
          lead_id: string | null
          mailbox_id: string | null
          rfc_message_id: string | null
          sent_at: string
          snippet: string
          status: string
          step_position: number | null
          subject: string
          variant: string | null
        }
        Insert: {
          body_text?: string | null
          direction: string
          draft_reply?: string | null
          enrollment_id?: string | null
          error?: string | null
          from_header?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          handled_at?: string | null
          id?: string
          intent?: string | null
          kind?: string
          lead_id?: string | null
          mailbox_id?: string | null
          rfc_message_id?: string | null
          sent_at?: string
          snippet?: string
          status?: string
          step_position?: number | null
          subject?: string
          variant?: string | null
        }
        Update: {
          body_text?: string | null
          direction?: string
          draft_reply?: string | null
          enrollment_id?: string | null
          error?: string | null
          from_header?: string | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          handled_at?: string | null
          id?: string
          intent?: string | null
          kind?: string
          lead_id?: string | null
          mailbox_id?: string | null
          rfc_message_id?: string | null
          sent_at?: string
          snippet?: string
          status?: string
          step_position?: number | null
          subject?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_settings: {
        Row: {
          company_name: string
          eu_notice: string
          id: string
          postal_address: string
          updated_at: string
          us_notice: string
          website: string
        }
        Insert: {
          company_name?: string
          eu_notice?: string
          id?: string
          postal_address?: string
          updated_at?: string
          us_notice?: string
          website?: string
        }
        Update: {
          company_name?: string
          eu_notice?: string
          id?: string
          postal_address?: string
          updated_at?: string
          us_notice?: string
          website?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          auto_enroll_sequence_id: string | null
          created_at: string
          created_by: string | null
          filters: Json
          geo: Json | null
          id: string
          industry: string
          last_result: Json
          last_run_at: string | null
          location: string
          min_score: number
          name: string
          next_run_at: string | null
          per_page: number
          providers: string[]
          region: string
          schedule: string
          updated_at: string
        }
        Insert: {
          auto_enroll_sequence_id?: string | null
          created_at?: string
          created_by?: string | null
          filters?: Json
          geo?: Json | null
          id?: string
          industry?: string
          last_result?: Json
          last_run_at?: string | null
          location: string
          min_score?: number
          name: string
          next_run_at?: string | null
          per_page?: number
          providers?: string[]
          region?: string
          schedule?: string
          updated_at?: string
        }
        Update: {
          auto_enroll_sequence_id?: string | null
          created_at?: string
          created_by?: string | null
          filters?: Json
          geo?: Json | null
          id?: string
          industry?: string
          last_result?: Json
          last_run_at?: string | null
          location?: string
          min_score?: number
          name?: string
          next_run_at?: string | null
          per_page?: number
          providers?: string[]
          region?: string
          schedule?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_auto_enroll_sequence_id_fkey"
            columns: ["auto_enroll_sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      search_seen: {
        Row: {
          company: string
          created_at: string
          key: string
          search_id: string
        }
        Insert: {
          company?: string
          created_at?: string
          key: string
          search_id: string
        }
        Update: {
          company?: string
          created_at?: string
          key?: string
          search_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_seen_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "saved_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          body: string
          delay_days: number
          id: string
          position: number
          sequence_id: string
          subject: string
          subject_b: string
        }
        Insert: {
          body?: string
          delay_days?: number
          id?: string
          position: number
          sequence_id: string
          subject?: string
          subject_b?: string
        }
        Update: {
          body?: string
          delay_days?: number
          id?: string
          position?: number
          sequence_id?: string
          subject?: string
          subject_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string
          created_by: string | null
          gap_max_sec: number
          gap_min_sec: number
          id: string
          mailbox_ids: string[]
          name: string
          settings: Json
          status: string
          stop_on_reply: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gap_max_sec?: number
          gap_min_sec?: number
          id?: string
          mailbox_ids?: string[]
          name: string
          settings?: Json
          status?: string
          stop_on_reply?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gap_max_sec?: number
          gap_min_sec?: number
          id?: string
          mailbox_ids?: string[]
          name?: string
          settings?: Json
          status?: string
          stop_on_reply?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      site_cache: {
        Row: {
          data: Json
          domain: string
          fetched_at: string
        }
        Insert: {
          data: Json
          domain: string
          fetched_at?: string
        }
        Update: {
          data?: Json
          domain?: string
          fetched_at?: string
        }
        Relationships: []
      }
      suppressions: {
        Row: {
          created_at: string
          domain: string | null
          email: string | null
          id: string
          note: string
          reason: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          email?: string | null
          id?: string
          note?: string
          reason: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          email?: string | null
          id?: string
          note?: string
          reason?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _uid: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "ceo"
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
      app_role: ["admin", "user", "ceo"],
    },
  },
} as const
