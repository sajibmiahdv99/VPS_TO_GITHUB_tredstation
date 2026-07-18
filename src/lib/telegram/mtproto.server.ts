// Server-only MTProto wrapper around gramjs.
// Each call spins up a fresh client, performs one action, then disconnects.
//
// Requires env: TELEGRAM_API_ID, TELEGRAM_API_HASH.

import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";

function getCreds() {
  const apiIdRaw = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiIdRaw || !apiHash) {
    throw new Error("Telegram is not configured (missing API id/hash)");
  }
  const apiId = Number(apiIdRaw);
  if (!Number.isFinite(apiId)) throw new Error("TELEGRAM_API_ID must be a number");
  return { apiId, apiHash };
}

async function makeClient(sessionString = "") {
  const { apiId, apiHash } = getCreds();
  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 2,
    useWSS: true,
    deviceModel: "AGENT TRED",
    appVersion: "1.0",
    systemVersion: "web",
  });
  await client.connect();
  return client;
}

export type SendCodeResult = {
  sessionString: string;
  phoneCodeHash: string;
};

/** Step 1: ask Telegram to dispatch a login code to the user. */
export async function sendLoginCode(phone: string): Promise<SendCodeResult> {
  const { apiId, apiHash } = getCreds();
  const client = await makeClient("");
  try {
    const result = await client.sendCode({ apiId, apiHash }, phone);
    return {
      sessionString: (client.session.save() as unknown as string) ?? "",
      phoneCodeHash: result.phoneCodeHash,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

export type VerifyResult =
  | { kind: "ok"; sessionString: string; userId: string; username: string | null; firstName: string | null }
  | { kind: "needs_password"; sessionString: string };

/** Step 2: submit the code. May indicate that a 2FA password is required. */
export async function verifyLoginCode(args: {
  partialSession: string;
  phone: string;
  phoneCodeHash: string;
  code: string;
}): Promise<VerifyResult> {
  const client = await makeClient(args.partialSession);
  try {
    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: args.phone,
          phoneCodeHash: args.phoneCodeHash,
          phoneCode: args.code,
        }),
      );
      const user = "user" in result ? (result.user as Api.User) : null;
      return {
        kind: "ok",
        sessionString: (client.session.save() as unknown as string) ?? "",
        userId: user?.id?.toString() ?? "",
        username: user?.username ?? null,
        firstName: user?.firstName ?? null,
      };
    } catch (err: any) {
      const msg: string = err?.errorMessage ?? err?.message ?? "";
      if (msg === "SESSION_PASSWORD_NEEDED") {
        return {
          kind: "needs_password",
          sessionString: (client.session.save() as unknown as string) ?? "",
        };
      }
      throw err;
    }
  } finally {
    await client.disconnect().catch(() => {});
  }
}

/** Step 2b: 2FA cloud password. */
export async function verifyLoginPassword(args: {
  partialSession: string;
  password: string;
}): Promise<Extract<VerifyResult, { kind: "ok" }>> {
  const client = await makeClient(args.partialSession);
  try {
    await client.signInWithPassword(
      { apiId: getCreds().apiId, apiHash: getCreds().apiHash },
      { password: async () => args.password, onError: (e) => { throw e; } },
    );
    const me = (await client.getMe()) as Api.User;
    return {
      kind: "ok",
      sessionString: (client.session.save() as unknown as string) ?? "",
      userId: me?.id?.toString() ?? "",
      username: me?.username ?? null,
      firstName: me?.firstName ?? null,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

/** Log out a stored session (best-effort). */
export async function logOutSession(sessionString: string): Promise<void> {
  if (!sessionString) return;
  try {
    const client = await makeClient(sessionString);
    try {
      await client.invoke(new Api.auth.LogOut());
    } finally {
      await client.disconnect().catch(() => {});
    }
  } catch {
    // Ignore — best effort.
  }
}

export type DialogChannel = {
  chatId: string;
  name: string;
  username: string | null;
  isBroadcast: boolean;
  participantsCount: number | null;
};

/** List the user's subscribed channels, supergroups & groups via MTProto. */
export async function listDialogChannels(sessionString: string): Promise<DialogChannel[]> {
  const client = await makeClient(sessionString);
  const out: DialogChannel[] = [];
  const seen = new Set<string>();
  try {
    const dialogs = await client.getDialogs({ limit: 1000, archived: false });
    for (const d of dialogs) {
      const e: any = d.entity;
      if (!e) continue;
      // Include Channels (broadcast + supergroups) and basic Chats (small groups).
      // Skip Users (1-on-1 DMs) — those are not signal sources.
      const cls = e.className;
      if (cls !== "Channel" && cls !== "Chat") continue;
      const chatId = e.id?.toString() ?? "";
      if (!chatId || seen.has(chatId)) continue;
      seen.add(chatId);
      out.push({
        chatId,
        name: e.title ?? "(untitled)",
        username: e.username ?? null,
        isBroadcast: !!e.broadcast,
        participantsCount: typeof e.participantsCount === "number" ? e.participantsCount : null,
      });
    }
  } finally {
    await client.disconnect().catch(() => {});
  }
  return out;
}

/** Translate raw gramjs errors into user-friendly messages. */
export function friendlyTelegramError(err: unknown): string {
  const raw = (err as any)?.errorMessage ?? (err as any)?.message ?? String(err);
  const map: Record<string, string> = {
    PHONE_CODE_INVALID: "That code is incorrect. Please try again.",
    PHONE_CODE_EXPIRED: "That code has expired. Please resend a new one.",
    PHONE_NUMBER_INVALID: "That phone number is not valid.",
    PHONE_NUMBER_BANNED: "This phone number has been banned by Telegram.",
    PASSWORD_HASH_INVALID: "Incorrect 2FA password.",
    AUTH_RESTART: "Login was interrupted. Please start again.",
  };
  if (map[raw]) return map[raw];
  const flood = /^FLOOD_WAIT_(\d+)$/.exec(raw);
  if (flood) {
    const secs = Number(flood[1]);
    const mins = Math.ceil(secs / 60);
    return `Telegram is rate-limiting this number. Try again in ${secs < 60 ? `${secs}s` : `${mins} min`}.`;
  }
  return raw || "Telegram login failed.";
}
