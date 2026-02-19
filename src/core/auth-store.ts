const SERVICE_NAME = "mcms-cli";

type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
};

async function loadKeytar(): Promise<KeytarModule | null> {
  try {
    const mod = await import("keytar");
    return (mod.default ?? mod) as KeytarModule;
  } catch {
    return null;
  }
}

function getAccount(serviceDomain: string): string {
  return `service:${serviceDomain}`;
}

function getProfileAccount(profile: string): string {
  return `profile:${profile}`;
}

export async function canUseKeychain(): Promise<boolean> {
  const keytar = await loadKeytar();
  return keytar !== null;
}

export async function saveApiKey(serviceDomain: string, apiKey: string): Promise<{ stored: boolean; reason?: string }> {
  const keytar = await loadKeytar();
  if (!keytar) {
    return {
      stored: false,
      reason: "keychain_unavailable"
    };
  }

  try {
    await keytar.setPassword(SERVICE_NAME, getAccount(serviceDomain), apiKey);
    return { stored: true };
  } catch {
    return {
      stored: false,
      reason: "keychain_write_failed"
    };
  }
}

export async function readApiKey(serviceDomain: string): Promise<string | null> {
  const keytar = await loadKeytar();
  if (!keytar) {
    return null;
  }

  try {
    return await keytar.getPassword(SERVICE_NAME, getAccount(serviceDomain));
  } catch {
    return null;
  }
}

export async function saveApiKeyForProfile(profile: string, apiKey: string): Promise<{ stored: boolean; reason?: string }> {
  const keytar = await loadKeytar();
  if (!keytar) {
    return {
      stored: false,
      reason: "keychain_unavailable"
    };
  }

  try {
    await keytar.setPassword(SERVICE_NAME, getProfileAccount(profile), apiKey);
    return { stored: true };
  } catch {
    return {
      stored: false,
      reason: "keychain_write_failed"
    };
  }
}

export async function readApiKeyForProfile(profile: string): Promise<string | null> {
  const keytar = await loadKeytar();
  if (!keytar) {
    return null;
  }

  try {
    return await keytar.getPassword(SERVICE_NAME, getProfileAccount(profile));
  } catch {
    return null;
  }
}
