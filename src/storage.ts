import { ListUnspentResponse } from "./chainsource";

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
  updateTxDetails(txIDtoDetails: Record<string, TxDetails>): Promise<void>;
  updateScriptUnspents(scriptToUnspents: Record<string, ListUnspentResponse>): Promise<void>;
}

// static keys
export enum StaticStorageKey {
  TX_IDS = 'txids',
  INTERNAL_INDEX = 'internalIndex',
  EXTERNAL_INDEX = 'externalIndex',
}

// dynamic keys
const TxDetailsKey = (txid: string) => `txdetails-${txid}`;
const ScriptUnspentsKey = (script: string) => `unspents-${script}`;

/**
 * Browser storage is a key-value store
 * 
 * TX_IDS => all wallet transactions ids
 * INTERNAL_INDEX => last used internal index for the main account
 * EXTERNAL_INDEX => last used external index for the main account
 * TxDetailsKey(txid) => tx details (height, hex) for a given txid
 * ScriptUnspentsKey(script) => list of unspents (as outpoint) for a given script
 */


export const ChromeRepository: WalletRepository = {
  async getWalletTransactions(): MaybeNull<Array<string>> {
    const tx = await chrome.storage.local.get([StaticStorageKey.TX_IDS]);
    return tx[StaticStorageKey.TX_IDS] as Array<string> ?? null;
  },
  async getLastUsedIndexes(): MaybeNull<{ internal?: number; external?: number; }> {
    const indexes = await chrome.storage.local.get([StaticStorageKey.INTERNAL_INDEX, StaticStorageKey.EXTERNAL_INDEX]);
    return {
      internal: indexes[StaticStorageKey.INTERNAL_INDEX] as number ?? undefined,
      external: indexes[StaticStorageKey.EXTERNAL_INDEX] as number ?? undefined,
    };
  },
  async addWalletTransactions(...txIDs: string[]): Promise<void> {
    const data = await chrome.storage.local.get([StaticStorageKey.TX_IDS]);
    const txids = new Set(data[StaticStorageKey.TX_IDS] as Array<string> ?? []);
    for (const txid of txIDs) {
      txids.add(txid);
    }
    await chrome.storage.local.set({ [StaticStorageKey.TX_IDS]: Array.from(txids) });
  },
  setLastUsedIndex(index: number, isInternal: boolean): Promise<void> {
    const key = isInternal ? StaticStorageKey.INTERNAL_INDEX : StaticStorageKey.EXTERNAL_INDEX;
    return chrome.storage.local.set({ [key]: index });
  },
  async updateTxDetails(txIDtoDetails: Record<string, TxDetails>): Promise<void> {
    const keys = Object.keys(txIDtoDetails).map(TxDetailsKey);
    const detailsInStorage = await chrome.storage.local.get(keys);

    return chrome.storage.local.set(Object.fromEntries(
        Object.entries(txIDtoDetails)
          .map(([txid, details]) => [TxDetailsKey(txid), { ...detailsInStorage[TxDetailsKey(txid)], ...details }])
      )
    );
  },
  setScriptHexDerivationPath: function (script: string, path: string): Promise<void> {
    return chrome.storage.local.set({ [script]: path });
  },
  updateScriptUnspents(scriptToUnspents: Record<string, ListUnspentResponse>): Promise<void> {
    return chrome.storage.local.set(Object.fromEntries(
      Object.entries(scriptToUnspents)
        .map(([script, unspents]) => [ScriptUnspentsKey(script), unspents])
    ));
  },
}
