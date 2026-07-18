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
      affiliate_commissions: {
        Row: {
          amount: number
          created_at: string
          id: string
          level: number
          paid_at: string | null
          rate: number
          referred_by_id: string
          status: string | null
          subscriber_id: string
          subscription_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          level: number
          paid_at?: string | null
          rate: number
          referred_by_id: string
          status?: string | null
          subscriber_id: string
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          level?: number
          paid_at?: string | null
          rate?: number
          referred_by_id?: string
          status?: string | null
          subscriber_id?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_referred_by_id_fkey"
            columns: ["referred_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          created_at: string
          direct_referrals: number | null
          id: string
          is_approved: boolean | null
          is_recurring_eligible: boolean | null
          parent_affiliate_id: string | null
          payout_method: Json | null
          rank: string
          referral_code: string
          referred_by: string | null
          total_earned: number | null
          total_paid: number | null
          total_pending: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direct_referrals?: number | null
          id?: string
          is_approved?: boolean | null
          is_recurring_eligible?: boolean | null
          parent_affiliate_id?: string | null
          payout_method?: Json | null
          rank?: string
          referral_code: string
          referred_by?: string | null
          total_earned?: number | null
          total_paid?: number | null
          total_pending?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          direct_referrals?: number | null
          id?: string
          is_approved?: boolean | null
          is_recurring_eligible?: boolean | null
          parent_affiliate_id?: string | null
          payout_method?: Json | null
          rank?: string
          referral_code?: string
          referred_by?: string | null
          total_earned?: number | null
          total_paid?: number | null
          total_pending?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_parent_affiliate_id_fkey"
            columns: ["parent_affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string
          actor_id: string
          actor_role: string
          created_at: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_email: string
          actor_id: string
          actor_role: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string
          actor_role?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      backtest_runs: {
        Row: {
          completed_at: string | null
          config: Json
          created_at: string
          end_date: string
          error: string | null
          fee_pct: number
          id: string
          initial_balance: number
          name: string
          optimizer_run_id: string | null
          progress: number
          start_date: string
          started_at: string | null
          status: string
          summary: Json | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          end_date: string
          error?: string | null
          fee_pct?: number
          id?: string
          initial_balance?: number
          name: string
          optimizer_run_id?: string | null
          progress?: number
          start_date: string
          started_at?: string | null
          status?: string
          summary?: Json | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          config?: Json
          created_at?: string
          end_date?: string
          error?: string | null
          fee_pct?: number
          id?: string
          initial_balance?: number
          name?: string
          optimizer_run_id?: string | null
          progress?: number
          start_date?: string
          started_at?: string | null
          status?: string
          summary?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_runs_optimizer_run_id_fkey"
            columns: ["optimizer_run_id"]
            isOneToOne: false
            referencedRelation: "risk_optimizer_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_trades: {
        Row: {
          created_at: string
          entry_price: number
          entry_time: string
          exit_price: number | null
          exit_reason: string | null
          exit_time: string | null
          id: string
          leverage: number | null
          pnl: number | null
          pnl_pct: number | null
          qty: number
          risk_snapshot: Json | null
          run_id: string
          side: string
          symbol: string
        }
        Insert: {
          created_at?: string
          entry_price: number
          entry_time: string
          exit_price?: number | null
          exit_reason?: string | null
          exit_time?: string | null
          id?: string
          leverage?: number | null
          pnl?: number | null
          pnl_pct?: number | null
          qty: number
          risk_snapshot?: Json | null
          run_id: string
          side: string
          symbol: string
        }
        Update: {
          created_at?: string
          entry_price?: number
          entry_time?: string
          exit_price?: number | null
          exit_reason?: string | null
          exit_time?: string | null
          id?: string
          leverage?: number | null
          pnl?: number | null
          pnl_pct?: number | null
          qty?: number
          risk_snapshot?: Json | null
          run_id?: string
          side?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_trades_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_risk_settings: {
        Row: {
          allocation_percent: number
          channel_id: string
          created_at: string
          exchange_account_id: string | null
          id: string
          is_active: boolean
          leverage: number
          stop_loss_percent: number | null
          take_profit_percent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allocation_percent?: number
          channel_id: string
          created_at?: string
          exchange_account_id?: string | null
          id?: string
          is_active?: boolean
          leverage?: number
          stop_loss_percent?: number | null
          take_profit_percent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allocation_percent?: number
          channel_id?: string
          created_at?: string
          exchange_account_id?: string | null
          id?: string
          is_active?: boolean
          leverage?: number
          stop_loss_percent?: number | null
          take_profit_percent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_risk_settings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "personal_signal_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_risk_settings_exchange_account_id_fkey"
            columns: ["exchange_account_id"]
            isOneToOne: false
            referencedRelation: "exchange_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_accounts: {
        Row: {
          created_at: string
          encrypted_api_key: string
          encrypted_api_secret: string
          exchange_code: string
          execution_mode: string
          id: string
          label: string
          last_balance_error: string | null
          last_balance_sync_at: string | null
          last_error: string | null
          passphrase: string | null
          permissions: Json | null
          status: string
          updated_at: string
          user_id: string
          validated_at: string | null
        }
        Insert: {
          created_at?: string
          encrypted_api_key: string
          encrypted_api_secret: string
          exchange_code: string
          execution_mode?: string
          id?: string
          label: string
          last_balance_error?: string | null
          last_balance_sync_at?: string | null
          last_error?: string | null
          passphrase?: string | null
          permissions?: Json | null
          status?: string
          updated_at?: string
          user_id: string
          validated_at?: string | null
        }
        Update: {
          created_at?: string
          encrypted_api_key?: string
          encrypted_api_secret?: string
          exchange_code?: string
          execution_mode?: string
          id?: string
          label?: string
          last_balance_error?: string | null
          last_balance_sync_at?: string | null
          last_error?: string | null
          passphrase?: string | null
          permissions?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_balances: {
        Row: {
          asset: string
          created_at: string
          exchange_account_id: string
          free: number
          id: string
          snapshot_at: string
          total: number
          updated_at: string
          usd_value: number | null
          used: number
          user_id: string
        }
        Insert: {
          asset: string
          created_at?: string
          exchange_account_id: string
          free?: number
          id?: string
          snapshot_at?: string
          total?: number
          updated_at?: string
          usd_value?: number | null
          used?: number
          user_id: string
        }
        Update: {
          asset?: string
          created_at?: string
          exchange_account_id?: string
          free?: number
          id?: string
          snapshot_at?: string
          total?: number
          updated_at?: string
          usd_value?: number | null
          used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_balances_exchange_account_id_fkey"
            columns: ["exchange_account_id"]
            isOneToOne: false
            referencedRelation: "exchange_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          due_at: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          paid_at: string | null
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string | null
          due_at?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          due_at?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_verifications: {
        Row: {
          created_at: string
          external_reference_id: string | null
          id: string
          provider: string | null
          rejected_reason: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          external_reference_id?: string | null
          id?: string
          provider?: string | null
          rejected_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          external_reference_id?: string | null
          id?: string
          provider?: string | null
          rejected_reason?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      live_prices: {
        Row: {
          exchange_code: string
          price: number
          symbol: string
          updated_at: string
        }
        Insert: {
          exchange_code: string
          price: number
          symbol: string
          updated_at?: string
        }
        Update: {
          exchange_code?: string
          price?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dispatch_attempts: number
          email_dispatched_at: string | null
          event_type: string
          id: string
          last_dispatch_error: string | null
          metadata: Json
          read_at: string | null
          telegram_dispatched_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dispatch_attempts?: number
          email_dispatched_at?: string | null
          event_type: string
          id?: string
          last_dispatch_error?: string | null
          metadata?: Json
          read_at?: string | null
          telegram_dispatched_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dispatch_attempts?: number
          email_dispatched_at?: string | null
          event_type?: string
          id?: string
          last_dispatch_error?: string | null
          metadata?: Json
          read_at?: string | null
          telegram_dispatched_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          order_id: string
          payload: Json
          to_status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          order_id: string
          payload?: Json
          to_status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          order_id?: string
          payload?: Json
          to_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancel_requested: boolean
          client_order_id: string | null
          created_at: string
          error_message: string | null
          exchange_account_id: string | null
          exchange_order_id: string | null
          fill_price: number | null
          filled_quantity: number | null
          id: string
          idempotency_key: string | null
          last_event_at: string | null
          leverage: number | null
          modify_requested: boolean
          order_type: string
          parent_order_id: string | null
          pnl: number | null
          price: number | null
          quantity: number
          side: string
          signal_id: string | null
          status: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          tp_levels: Json | null
          tp_levels_hit: number
          trailing_high_watermark: number | null
          trailing_stop_active: boolean
          trailing_stop_distance: number | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          cancel_requested?: boolean
          client_order_id?: string | null
          created_at?: string
          error_message?: string | null
          exchange_account_id?: string | null
          exchange_order_id?: string | null
          fill_price?: number | null
          filled_quantity?: number | null
          id?: string
          idempotency_key?: string | null
          last_event_at?: string | null
          leverage?: number | null
          modify_requested?: boolean
          order_type: string
          parent_order_id?: string | null
          pnl?: number | null
          price?: number | null
          quantity: number
          side: string
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          tp_levels?: Json | null
          tp_levels_hit?: number
          trailing_high_watermark?: number | null
          trailing_stop_active?: boolean
          trailing_stop_distance?: number | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          cancel_requested?: boolean
          client_order_id?: string | null
          created_at?: string
          error_message?: string | null
          exchange_account_id?: string | null
          exchange_order_id?: string | null
          fill_price?: number | null
          filled_quantity?: number | null
          id?: string
          idempotency_key?: string | null
          last_event_at?: string | null
          leverage?: number | null
          modify_requested?: boolean
          order_type?: string
          parent_order_id?: string | null
          pnl?: number | null
          price?: number | null
          quantity?: number
          side?: string
          signal_id?: string | null
          status?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          tp_levels?: Json | null
          tp_levels_hit?: number
          trailing_high_watermark?: number | null
          trailing_stop_active?: boolean
          trailing_stop_distance?: number | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_exchange_account_id_fkey"
            columns: ["exchange_account_id"]
            isOneToOne: false
            referencedRelation: "exchange_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          external_payment_ref: string | null
          id: string
          invoice_id: string | null
          paid_at: string | null
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string | null
          external_payment_ref?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          provider: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          external_payment_ref?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          id: string
          method: string
          notes: string | null
          processed_at: string | null
          requested_at: string
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          id?: string
          method: string
          notes?: string | null
          processed_at?: string | null
          requested_at?: string
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          id?: string
          method?: string
          notes?: string | null
          processed_at?: string | null
          requested_at?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_signal_channels: {
        Row: {
          channel_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_signal_source: boolean
          last_signal_at: string | null
          name: string
          published_source_id: string | null
          signals_count: number
          telegram_account_id: string | null
          tg_chat_id: number | null
          updated_at: string
          user_id: string
          username: string | null
          webhook_token: string | null
          win_rate: number | null
        }
        Insert: {
          channel_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_signal_source?: boolean
          last_signal_at?: string | null
          name: string
          published_source_id?: string | null
          signals_count?: number
          telegram_account_id?: string | null
          tg_chat_id?: number | null
          updated_at?: string
          user_id: string
          username?: string | null
          webhook_token?: string | null
          win_rate?: number | null
        }
        Update: {
          channel_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_signal_source?: boolean
          last_signal_at?: string | null
          name?: string
          published_source_id?: string | null
          signals_count?: number
          telegram_account_id?: string | null
          tg_chat_id?: number | null
          updated_at?: string
          user_id?: string
          username?: string | null
          webhook_token?: string | null
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_signal_channels_published_source_id_fkey"
            columns: ["published_source_id"]
            isOneToOne: false
            referencedRelation: "signal_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_signal_channels_telegram_account_id_fkey"
            columns: ["telegram_account_id"]
            isOneToOne: false
            referencedRelation: "telegram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          max_daily_trades: number | null
          max_open_positions: number | null
          max_trade_size_percentage: number | null
          monthly_price: number | null
          name: string
          sort_order: number | null
          updated_at: string
          yearly_price: number | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_daily_trades?: number | null
          max_open_positions?: number | null
          max_trade_size_percentage?: number | null
          monthly_price?: number | null
          name: string
          sort_order?: number | null
          updated_at?: string
          yearly_price?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_daily_trades?: number | null
          max_open_positions?: number | null
          max_trade_size_percentage?: number | null
          monthly_price?: number | null
          name?: string
          sort_order?: number | null
          updated_at?: string
          yearly_price?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          locale: string | null
          referral_code: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          is_active?: boolean | null
          last_login_at?: string | null
          locale?: string | null
          referral_code?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          locale?: string | null
          referral_code?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      risk_optimizer_runs: {
        Row: {
          best_backtest_run_id: string | null
          completed_at: string | null
          completed_combos: number
          config: Json
          created_at: string
          end_date: string
          error: string | null
          fee_pct: number
          grid: Json
          id: string
          initial_balance: number
          name: string
          objective: string
          results: Json | null
          start_date: string
          status: string
          total_combos: number
          user_id: string
        }
        Insert: {
          best_backtest_run_id?: string | null
          completed_at?: string | null
          completed_combos?: number
          config?: Json
          created_at?: string
          end_date: string
          error?: string | null
          fee_pct?: number
          grid?: Json
          id?: string
          initial_balance?: number
          name: string
          objective?: string
          results?: Json | null
          start_date: string
          status?: string
          total_combos: number
          user_id: string
        }
        Update: {
          best_backtest_run_id?: string | null
          completed_at?: string | null
          completed_combos?: number
          config?: Json
          created_at?: string
          end_date?: string
          error?: string | null
          fee_pct?: number
          grid?: Json
          id?: string
          initial_balance?: number
          name?: string
          objective?: string
          results?: Json | null
          start_date?: string
          status?: string
          total_combos?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_optimizer_runs_best_backtest_run_id_fkey"
            columns: ["best_backtest_run_id"]
            isOneToOne: false
            referencedRelation: "backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_sources: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_platform_managed: boolean | null
          is_published: boolean
          name: string
          owner_user_id: string | null
          plan_minimum: string | null
          published_at: string | null
          source_type: string
          status: string
          updated_at: string
          win_rate: number | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_platform_managed?: boolean | null
          is_published?: boolean
          name: string
          owner_user_id?: string | null
          plan_minimum?: string | null
          published_at?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          win_rate?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_platform_managed?: boolean | null
          is_published?: boolean
          name?: string
          owner_user_id?: string | null
          plan_minimum?: string | null
          published_at?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      signals: {
        Row: {
          confidence: number | null
          created_at: string
          entry_price: number | null
          error: string | null
          id: string
          leverage: number | null
          parser_version: string | null
          raw_text: string
          side: string | null
          source_id: string | null
          status: string
          stop_loss: number | null
          symbol: string | null
          take_profit: number[] | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          entry_price?: number | null
          error?: string | null
          id?: string
          leverage?: number | null
          parser_version?: string | null
          raw_text: string
          side?: string | null
          source_id?: string | null
          status?: string
          stop_loss?: number | null
          symbol?: string | null
          take_profit?: number[] | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          entry_price?: number | null
          error?: string | null
          id?: string
          leverage?: number | null
          parser_version?: string | null
          raw_text?: string
          side?: string | null
          source_id?: string | null
          status?: string
          stop_loss?: number | null
          symbol?: string | null
          take_profit?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "signals_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "signal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_blocked_networks: {
        Row: {
          cidr: unknown
          country_code: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          reason: string | null
        }
        Insert: {
          cidr: unknown
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reason?: string | null
        }
        Update: {
          cidr?: unknown
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          auto_renew: boolean | null
          billing_interval: string
          created_at: string
          current_period_ends_at: string | null
          current_period_starts_at: string | null
          external_reference: string | null
          id: string
          plan_code: string
          status: string
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          billing_interval?: string
          created_at?: string
          current_period_ends_at?: string | null
          current_period_starts_at?: string | null
          external_reference?: string | null
          id?: string
          plan_code: string
          status?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean | null
          billing_interval?: string
          created_at?: string
          current_period_ends_at?: string | null
          current_period_starts_at?: string | null
          external_reference?: string | null
          id?: string
          plan_code?: string
          status?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string
          id: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_accounts: {
        Row: {
          created_at: string
          encrypted_session: string | null
          id: string
          label: string
          last_error: string | null
          masked_phone: string | null
          phone_code_hash: string | null
          phone_e164: string | null
          requires_2fa: boolean
          session_ref: string | null
          status: string
          sync_info: Json | null
          tg_user_id: number | null
          tg_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_session?: string | null
          id?: string
          label: string
          last_error?: string | null
          masked_phone?: string | null
          phone_code_hash?: string | null
          phone_e164?: string | null
          requires_2fa?: boolean
          session_ref?: string | null
          status?: string
          sync_info?: Json | null
          tg_user_id?: number | null
          tg_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_session?: string | null
          id?: string
          label?: string
          last_error?: string | null
          masked_phone?: string | null
          phone_code_hash?: string | null
          phone_e164?: string | null
          requires_2fa?: boolean
          session_ref?: string | null
          status?: string
          sync_info?: Json | null
          tg_user_id?: number | null
          tg_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_blocks: {
        Row: {
          blocked_until: string
          created_at: string
          reason: string
          user_id: string
        }
        Insert: {
          blocked_until: string
          created_at?: string
          reason: string
          user_id: string
        }
        Update: {
          blocked_until?: string
          created_at?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          order_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          order_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_balances: {
        Row: {
          available_balance: number | null
          pending_commission: number | null
          pending_withdrawal: number | null
          total_earned: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          available_balance?: number | null
          pending_commission?: number | null
          pending_withdrawal?: number | null
          total_earned?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          available_balance?: number | null
          pending_commission?: number | null
          pending_withdrawal?: number | null
          total_earned?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_prefs: {
        Row: {
          channel_email: boolean
          channel_inapp: boolean
          channel_telegram: boolean
          created_at: string
          email: string | null
          evt_error: boolean
          evt_fill: boolean
          evt_invalid_keys: boolean
          evt_new_signal: boolean
          evt_sl_tp: boolean
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_email?: boolean
          channel_inapp?: boolean
          channel_telegram?: boolean
          created_at?: string
          email?: string | null
          evt_error?: boolean
          evt_fill?: boolean
          evt_invalid_keys?: boolean
          evt_new_signal?: boolean
          evt_sl_tp?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_email?: boolean
          channel_inapp?: boolean
          channel_telegram?: boolean
          created_at?: string
          email?: string | null
          evt_error?: boolean
          evt_fill?: boolean
          evt_invalid_keys?: boolean
          evt_new_signal?: boolean
          evt_sl_tp?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_risk_settings: {
        Row: {
          allowed_source_ids: string[] | null
          auto_stop_after_losses: number | null
          auto_trade_enabled: boolean
          break_even_enabled: boolean | null
          cooldown_minutes_after_loss: number | null
          created_at: string
          daily_loss_limit_percent: number | null
          default_exchange_account_id: string | null
          default_order_type: string
          entry_distribution: string
          entry_levels_count: number
          entry_mode: string
          entry_range_percent: number | null
          id: string
          market_fallback: boolean
          max_concurrent_trades: number | null
          max_drawdown_percent: number | null
          max_leverage: number | null
          max_open_positions: number | null
          max_slippage_percent: number | null
          max_trade_size_percent: number | null
          min_leverage: number | null
          partial_tp_enabled: boolean
          risk_per_trade_percent: number | null
          slippage_tolerance_pct: number
          stop_loss_type: string | null
          symbol_allowlist: string[] | null
          symbol_denylist: string[] | null
          take_profit_type: string | null
          trailing_sl_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_source_ids?: string[] | null
          auto_stop_after_losses?: number | null
          auto_trade_enabled?: boolean
          break_even_enabled?: boolean | null
          cooldown_minutes_after_loss?: number | null
          created_at?: string
          daily_loss_limit_percent?: number | null
          default_exchange_account_id?: string | null
          default_order_type?: string
          entry_distribution?: string
          entry_levels_count?: number
          entry_mode?: string
          entry_range_percent?: number | null
          id?: string
          market_fallback?: boolean
          max_concurrent_trades?: number | null
          max_drawdown_percent?: number | null
          max_leverage?: number | null
          max_open_positions?: number | null
          max_slippage_percent?: number | null
          max_trade_size_percent?: number | null
          min_leverage?: number | null
          partial_tp_enabled?: boolean
          risk_per_trade_percent?: number | null
          slippage_tolerance_pct?: number
          stop_loss_type?: string | null
          symbol_allowlist?: string[] | null
          symbol_denylist?: string[] | null
          take_profit_type?: string | null
          trailing_sl_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_source_ids?: string[] | null
          auto_stop_after_losses?: number | null
          auto_trade_enabled?: boolean
          break_even_enabled?: boolean | null
          cooldown_minutes_after_loss?: number | null
          created_at?: string
          daily_loss_limit_percent?: number | null
          default_exchange_account_id?: string | null
          default_order_type?: string
          entry_distribution?: string
          entry_levels_count?: number
          entry_mode?: string
          entry_range_percent?: number | null
          id?: string
          market_fallback?: boolean
          max_concurrent_trades?: number | null
          max_drawdown_percent?: number | null
          max_leverage?: number | null
          max_open_positions?: number | null
          max_slippage_percent?: number | null
          max_trade_size_percent?: number | null
          min_leverage?: number | null
          partial_tp_enabled?: boolean
          risk_per_trade_percent?: number | null
          slippage_tolerance_pct?: number
          stop_loss_type?: string | null
          symbol_allowlist?: string[] | null
          symbol_denylist?: string[] | null
          take_profit_type?: string | null
          trailing_sl_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_risk_settings_default_exchange_account_id_fkey"
            columns: ["default_exchange_account_id"]
            isOneToOne: false
            referencedRelation: "exchange_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_risk_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      user_symbol_risk_caps: {
        Row: {
          asset_class: string | null
          created_at: string
          enabled: boolean
          id: string
          max_exposure_pct: number | null
          max_leverage: number | null
          max_open_positions: number | null
          symbol: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_class?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          max_exposure_pct?: number | null
          max_leverage?: number | null
          max_open_positions?: number | null
          symbol?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_class?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          max_exposure_pct?: number | null
          max_leverage?: number | null
          max_open_positions?: number | null
          symbol?: string | null
          updated_at?: string
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
      hook_restrict_signup_by_network: { Args: { event: Json }; Returns: Json }
      plan_rank: { Args: { code: string }; Returns: number }
      user_has_plan_at_least: {
        Args: { _min: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
