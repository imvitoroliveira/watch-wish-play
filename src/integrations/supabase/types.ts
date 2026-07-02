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
      api_keys: {
        Row: {
          api_key: string
          cooldown_until: string | null
          created_at: string
          id: string
          key_name: string
          last_used_at: string | null
          provider: string
          status: string
          total_calls: number
        }
        Insert: {
          api_key: string
          cooldown_until?: string | null
          created_at?: string
          id?: string
          key_name: string
          last_used_at?: string | null
          provider?: string
          status?: string
          total_calls?: number
        }
        Update: {
          api_key?: string
          cooldown_until?: string | null
          created_at?: string
          id?: string
          key_name?: string
          last_used_at?: string | null
          provider?: string
          status?: string
          total_calls?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          billing_enabled: boolean
          id: string
          updated_at: string
        }
        Insert: {
          billing_enabled?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          billing_enabled?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients_list: {
        Row: {
          clients: Json
          id: string
          uploaded_at: string
        }
        Insert: {
          clients?: Json
          id?: string
          uploaded_at?: string
        }
        Update: {
          clients?: Json
          id?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      content_alerts: {
        Row: {
          client_username: string
          created_at: string
          id: string
          movie_id: number
          movie_title: string
          notified: boolean
          original_title: string | null
        }
        Insert: {
          client_username: string
          created_at?: string
          id?: string
          movie_id: number
          movie_title: string
          notified?: boolean
          original_title?: string | null
        }
        Update: {
          client_username?: string
          created_at?: string
          id?: string
          movie_id?: number
          movie_title?: string
          notified?: boolean
          original_title?: string | null
        }
        Relationships: []
      }
      football_cache: {
        Row: {
          cache_date: string
          fetched_at: string
          id: string
          matches: Json
        }
        Insert: {
          cache_date?: string
          fetched_at?: string
          id?: string
          matches?: Json
        }
        Update: {
          cache_date?: string
          fetched_at?: string
          id?: string
          matches?: Json
        }
        Relationships: []
      }
      jogos_ativos: {
        Row: {
          atualizado_em: string
          data_jogo: string
          elapsed: number | null
          emblema_casa: string
          emblema_fora: string
          fonte: string
          horario_inicio: string
          id: string
          id_partida: number
          liga_id: number
          liga_logo: string
          liga_nome: string
          placar_casa: number | null
          placar_fora: number | null
          rodada: string | null
          status: string
          time_casa: string
          time_fora: string
          transmissao: string[]
        }
        Insert: {
          atualizado_em?: string
          data_jogo?: string
          elapsed?: number | null
          emblema_casa?: string
          emblema_fora?: string
          fonte?: string
          horario_inicio?: string
          id?: string
          id_partida: number
          liga_id?: number
          liga_logo?: string
          liga_nome?: string
          placar_casa?: number | null
          placar_fora?: number | null
          rodada?: string | null
          status?: string
          time_casa: string
          time_fora: string
          transmissao?: string[]
        }
        Update: {
          atualizado_em?: string
          data_jogo?: string
          elapsed?: number | null
          emblema_casa?: string
          emblema_fora?: string
          fonte?: string
          horario_inicio?: string
          id?: string
          id_partida?: number
          liga_id?: number
          liga_logo?: string
          liga_nome?: string
          placar_casa?: number | null
          placar_fora?: number | null
          rodada?: string | null
          status?: string
          time_casa?: string
          time_fora?: string
          transmissao?: string[]
        }
        Relationships: []
      }
      m3u_catalog: {
        Row: {
          id: string
          source_url: string | null
          titles: Json
          updated_at: string
        }
        Insert: {
          id?: string
          source_url?: string | null
          titles?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          source_url?: string | null
          titles?: Json
          updated_at?: string
        }
        Relationships: []
      }
      m3u_updates: {
        Row: {
          current_count: number
          id: string
          new_titles: Json
          previous_count: number
          total_new: number
          updated_at: string
        }
        Insert: {
          current_count?: number
          id?: string
          new_titles?: Json
          previous_count?: number
          total_new?: number
          updated_at?: string
        }
        Update: {
          current_count?: number
          id?: string
          new_titles?: Json
          previous_count?: number
          total_new?: number
          updated_at?: string
        }
        Relationships: []
      }
      match_reminders: {
        Row: {
          away_team: string
          client_username: string
          created_at: string
          home_team: string
          id: string
          league_name: string
          match_date: string
          match_id: number
          notified: boolean
        }
        Insert: {
          away_team: string
          client_username: string
          created_at?: string
          home_team: string
          id?: string
          league_name: string
          match_date: string
          match_id: number
          notified?: boolean
        }
        Update: {
          away_team?: string
          client_username?: string
          created_at?: string
          home_team?: string
          id?: string
          league_name?: string
          match_date?: string
          match_id?: number
          notified?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          expires_at: string | null
          id: string
          sent_at: string
          target_user: string | null
          title: string
          type: string
        }
        Insert: {
          body: string
          expires_at?: string | null
          id?: string
          sent_at?: string
          target_user?: string | null
          title: string
          type?: string
        }
        Update: {
          body?: string
          expires_at?: string | null
          id?: string
          sent_at?: string
          target_user?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          activated_at: string | null
          client_username: string
          created_at: string
          days: number
          id: string
          natv_activated: boolean
          plan: string
          provider: string
          provider_transaction_id: string | null
          status: string
        }
        Insert: {
          activated_at?: string | null
          client_username: string
          created_at?: string
          days: number
          id?: string
          natv_activated?: boolean
          plan: string
          provider?: string
          provider_transaction_id?: string | null
          status?: string
        }
        Update: {
          activated_at?: string | null
          client_username?: string
          created_at?: string
          days?: number
          id?: string
          natv_activated?: boolean
          plan?: string
          provider?: string
          provider_transaction_id?: string | null
          status?: string
        }
        Relationships: []
      }
      team_badges: {
        Row: {
          badge_url: string
          created_at: string
          id: string
          source: string
          team_name: string
          updated_at: string
        }
        Insert: {
          badge_url?: string
          created_at?: string
          id?: string
          source?: string
          team_name: string
          updated_at?: string
        }
        Update: {
          badge_url?: string
          created_at?: string
          id?: string
          source?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      test_results: {
        Row: {
          duration_ms: number
          failed: number
          id: string
          passed: number
          results: Json
          run_at: string
          run_id: string
          total_tests: number
          trigger_type: string
        }
        Insert: {
          duration_ms?: number
          failed?: number
          id?: string
          passed?: number
          results?: Json
          run_at?: string
          run_id: string
          total_tests?: number
          trigger_type?: string
        }
        Update: {
          duration_ms?: number
          failed?: number
          id?: string
          passed?: number
          results?: Json
          run_at?: string
          run_id?: string
          total_tests?: number
          trigger_type?: string
        }
        Relationships: []
      }
      trailer_challenge: {
        Row: {
          challenge_date: string
          client_username: string
          created_at: string
          id: string
          point_earned: boolean
          trailers_watched: number
        }
        Insert: {
          challenge_date?: string
          client_username: string
          created_at?: string
          id?: string
          point_earned?: boolean
          trailers_watched?: number
        }
        Update: {
          challenge_date?: string
          client_username?: string
          created_at?: string
          id?: string
          point_earned?: boolean
          trailers_watched?: number
        }
        Relationships: []
      }
      trailer_challenge_completions: {
        Row: {
          challenge_month: string
          client_username: string
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          total_points: number
        }
        Insert: {
          challenge_month: string
          client_username: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          total_points?: number
        }
        Update: {
          challenge_month?: string
          client_username?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          total_points?: number
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          client_username: string
          id: string
          last_seen: string
        }
        Insert: {
          client_username: string
          id?: string
          last_seen?: string
        }
        Update: {
          client_username?: string
          id?: string
          last_seen?: string
        }
        Relationships: []
      }
      user_push_subscriptions: {
        Row: {
          auth: string
          client_username: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
        }
        Insert: {
          auth: string
          client_username: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
        }
        Update: {
          auth?: string
          client_username?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      upsert_jogo_ativo: {
        Args: {
          p_data_jogo: string
          p_elapsed: number
          p_emblema_casa: string
          p_emblema_fora: string
          p_fonte: string
          p_horario_inicio: string
          p_id_partida: number
          p_liga_id: number
          p_liga_logo: string
          p_liga_nome: string
          p_placar_casa: number
          p_placar_fora: number
          p_rodada: string
          p_status: string
          p_time_casa: string
          p_time_fora: string
          p_transmissao: string[]
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
