type MaybeNull<T> = Promise<T | null>;

export interface TxDetails {
  height?: number;
  hex?: string;
}

export interface WalletRepository {
  addWalletTransactions(...txIDs: string[]): Promise<void>;
  setLastUsedIndex(index: number, isInternal: boolean): Promise<void>;
  getLastUsedIndexes(): MaybeNull<{ internal?: number, external?: number }>;
  getWalletTransactions(): MaybeNull<Array<string>>;
  setScriptHexDerivationPath(script: string, path: string): Promise<void>;
  updateTxDetails(txID: string, details: TxDetails): Promise<void>;
}

// static keys
enum Keys {
  TX_IDS = 'txids',
  INTERNAL_INDEX = 'internalIndex',
  EXTERNAL_INDEX = 'externalIndex',
}

// dynamic keys
const TxDetailsKey = (txid: string) => `txdetails-${txid}`;

export const ChromeRepository: WalletRepository = {
  async getWalletTransactions(): MaybeNull<Array<string>> {
    const tx = await chrome.storage.local.get([Keys.TX_IDS]);
    return tx[Keys.TX_IDS] as Array<string> ?? null;
  },
  async getLastUsedIndexes(): MaybeNull<{ internal?: number; external?: number; }> {
    const indexes = await chrome.storage.local.get([Keys.INTERNAL_INDEX, Keys.EXTERNAL_INDEX]);
    return {
      internal: indexes[Keys.INTERNAL_INDEX] as number ?? undefined,
      external: indexes[Keys.EXTERNAL_INDEX] as number ?? undefined,
    };
  },
  async addWalletTransactions(...txIDs: string[]): Promise<void> {
    const data = await chrome.storage.local.get([Keys.TX_IDS]);
    const txids = new Set(data[Keys.TX_IDS] as Array<string> ?? []);
    for (const txid of txIDs) {
      txids.add(txid);
    }
    await chrome.storage.local.set({ [Keys.TX_IDS]: Array.from(txids) });
  },
  setLastUsedIndex(index: number, isInternal: boolean): Promise<void> {
    const key = isInternal ? Keys.INTERNAL_INDEX : Keys.EXTERNAL_INDEX;
    return chrome.storage.local.set({ [key]: index });
  },
  async updateTxDetails(txID: string, details: TxDetails): Promise<void> {
    const key = TxDetailsKey(txID);
    const currentDetails = (await chrome.storage.local.get([key]))[key] as TxDetails ?? {};
    return chrome.storage.local.set({ [key]: { ...currentDetails, ...details } });
  },
  setScriptHexDerivationPath: function (script: string, path: string): Promise<void> {
    return chrome.storage.local.set({ [script]: path });
  }
}
