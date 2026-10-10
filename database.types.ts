/**
 * تایپ‌های دیتابیس Supabase برای این پروژه.
 * این فایل معادل خروجی `supabase gen types typescript` است و
 * برای تایپ‌دار شدن فراخوانی‌های کلاینت استفاده می‌شود.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      app_data: {
        Row: {
          id: string;
          user_id: string;
          collection_name: string;
          document_id: string;
          payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          collection_name: string;
          document_id: string;
          payload: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          collection_name?: string;
          document_id?: string;
          payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_request_log: {
        Row: {
          id: number;
          user_key: string;
          endpoint: string;
          created_at: string;
        };
        Insert: {
          user_key: string;
          endpoint: string;
        };
        Update: {
          user_key?: string;
          endpoint?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      replace_collection: {
        Args: {
          p_collection: string;
          p_rows: { document_id: string; payload: Json }[];
        };
        Returns: undefined;
      };
      try_consume_ai_quota: {
        Args: {
          p_user_key: string;
          p_endpoint: string;
          p_max_requests?: number;
          p_window_seconds?: number;
        };
        Returns: boolean;
      };
    };
  };
}
