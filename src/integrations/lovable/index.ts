// Lovable Cloud Auth removed for self-hosted deployments.
// Use supabase.auth.signInWithOAuth({ provider: 'google' }) directly (see auth.tsx).

export const lovable = {
  auth: {
    signInWithOAuth: async () => {
      return {
        error: new Error(
          "Lovable Cloud Auth is disabled. Configure Google OAuth in Supabase Auth providers.",
        ),
        redirected: false,
      };
    },
  },
};
