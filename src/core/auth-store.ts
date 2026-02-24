const SERVICE_NAME = "mcms-cli";

type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
};

async function loadKeytar(verbose = false): Promise<KeytarModule | null> {
  try {
    const mod = await import("keytar");
    return (mod.default ?? mod) as KeytarModule;
  } catch (error) {
    logVerbose(verbose, "keytar is unavailable", error);
    return null;
  }
}

function getAccount(serviceDomain: string): string {
  return `service:${serviceDomain}`;
}

function getProfileAccount(profile: string): string {
  return `profile:${profile}`;
}

export async function canUseKeychain(verbose = false): Promise<boolean> {
  const keytar = await loadKeytar(verbose);
  return keytar !== null;
}

export async function saveApiKey(
  serviceDomain: string,
  apiKey: string,
  verbose = false,
): Promise<{ stored: boolean; reason?: string }> {
  const keytar = await loadKeytar(verbose);
  if (!keytar) {
    return {
      stored: false,
      reason: "keychain_unavailable",
    };
  }

  try {
    await keytar.setPassword(SERVICE_NAME, getAccount(serviceDomain), apiKey);
    return { stored: true };
  } catch (error) {
    logVerbose(verbose, `failed to save API key for service domain ${serviceDomain}`, error);
    return {
      stored: false,
      reason: "keychain_write_failed",
    };
  }
}

export async function readApiKey(serviceDomain: string, verbose = false): Promise<string | null> {
  const keytar = await loadKeytar(verbose);
  if (!keytar) {
    return null;
  }

  try {
    return await keytar.getPassword(SERVICE_NAME, getAccount(serviceDomain));
  } catch (error) {
    logVerbose(verbose, `failed to read API key for service domain ${serviceDomain}`, error);
    return null;
  }
}

export async function saveApiKeyForProfile(
  profile: string,
  apiKey: string,
  verbose = false,
): Promise<{ stored: boolean; reason?: string }> {
  const keytar = await loadKeytar(verbose);
  if (!keytar) {
    return {
      stored: false,
      reason: "keychain_unavailable",
    };
  }

  try {
    await keytar.setPassword(SERVICE_NAME, getProfileAccount(profile), apiKey);
    return { stored: true };
  } catch (error) {
    logVerbose(verbose, `failed to save API key for profile ${profile}`, error);
    return {
      stored: false,
      reason: "keychain_write_failed",
    };
  }
}

export async function readApiKeyForProfile(
  profile: string,
  verbose = false,
): Promise<string | null> {
  const keytar = await loadKeytar(verbose);
  if (!keytar) {
    return null;
  }

  try {
    return await keytar.getPassword(SERVICE_NAME, getProfileAccount(profile));
  } catch (error) {
    logVerbose(verbose, `failed to read API key for profile ${profile}`, error);
    return null;
  }
}

function logVerbose(verbose: boolean, message: string, error: unknown): void {
  if (!verbose) {
    return;
  }

  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[auth-store] ${message}: ${detail}\n`);
}
