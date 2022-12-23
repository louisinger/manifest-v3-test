import { ListUnspentResponse } from "./chainsource";
import { UnblindingData } from "./unblinding";

type MaybeNull<T> = Promise<T | null>;

export interface TxDetails {
  height?: number;
  hex?: string;
}

export interface ScriptDetails {
  derivationPath?: string;
  blindingPrivateKey?: string;
}

export interface WalletRepository {
  addWalletTransactions(...txIDs: string[]): Promise<void>;
  setLastUsedIndex(index: number, isInternal: boolean): Promise<void>;
  getLastUsedIndexes(): MaybeNull<{ internal?: number, external?: number }>;
  getWalletTransactions(): MaybeNull<Array<string>>;
  getUtxos(): Promise<{ txID: string, vout: number, blindingData?: UnblindingData }[]>;
  getScriptDetails(...scripts: string[]): Promise<Record<string, ScriptDetails>>;
  getTxDetails(...txIDs: string[]): Promise<Record<string, TxDetails>>;
  updateScriptDetails(scriptToDetails: Record<string, ScriptDetails>): Promise<void>;
  updateTxDetails(txIDtoDetails: Record<string, TxDetails>): Promise<void>;
  updateScriptUnspents(scriptToUnspents: Record<string, ListUnspentResponse>): Promise<void>;
  updateOutpointBlindingData(outpointToBlindingData: Array<[{ txID: string, vout: number }, UnblindingData]>): Promise<void>;
}

// static keys
export enum StaticStorageKey {
  TX_IDS = 'txids',
  SCRIPTS = 'scripts',
  INTERNAL_INDEX = 'internalIndex',
  EXTERNAL_INDEX = 'externalIndex',
}

// dynamic keys
const TxDetailsKey = (txid: string) => `txdetails-${txid}`;
const ScriptUnspentsKey = (script: string) => `unspents-${script}`;
const ScriptDetailsKey = (script: string) => `details-${script}`;
const OutpointBlindingDataKey = (txid: string, vout: number) => `blinding-data-${txid}-${vout}`;

export function isScriptUnspentKey(key: string): boolean {
  return key.startsWith('unspents-');
}

/**
 * Browser storage is a key-value store
 * 
 * TX_IDS => all wallet transactions ids
 * SCRIPTS => get an array of all wallet scripts (useful for getting all data)
 * INTERNAL_INDEX => last used internal index for the main account
 * EXTERNAL_INDEX => last used external index for the main account
 * TxDetailsKey(txid) => tx details (height, hex) for a given txid
 * ScriptUnspentsKey(script) => list of unspents (as outpoint) for a given script
 * ScriptDetailsKey(script) => script details (derivation path, blinding private key) for a given script
 * OutpointBlindingDataKey(txid, vout) => blinding data (asset, value, asset blinding factor, value blinding factor) for a given outpoint
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
  async getScriptDetails(...scripts: string[]): Promise<Record<string, ScriptDetails>> {
    const keys = scripts.map(ScriptDetailsKey);
    const details = await chrome.storage.local.get(keys);
    return Object.fromEntries(
      Object.entries(details)
        .filter(([_, value]) => value !== null)
        .map(([key, value]) => [key.replace('details-', ''), value])
    ) as Record<string, ScriptDetails>;
  },
  async getTxDetails(...txIDs: string[]): Promise<Record<string, TxDetails>> {
    const keys = txIDs.map(TxDetailsKey);
    const details = await chrome.storage.local.get(keys);
    return Object.fromEntries(
      Object.entries(details)
        .filter(([_, value]) => value !== null)
        .map(([key, value]) => [key.replace('txdetails-', ''), value])
    ) as Record<string, TxDetails>;
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
  async updateScriptDetails(scriptToDetails: Record<string, ScriptDetails>): Promise<void> {
    await Promise.allSettled([
      addScripts(...Object.keys(scriptToDetails)), 
      chrome.storage.local.set(Object.fromEntries(Object.entries(scriptToDetails).map(([script, details]) => [ScriptDetailsKey(script), details])))
    ]);
  },
  updateScriptUnspents(scriptToUnspents: Record<string, ListUnspentResponse>): Promise<void> {
    return chrome.storage.local.set(Object.fromEntries(
      Object.entries(scriptToUnspents)
        .map(([script, unspents]) => [ScriptUnspentsKey(script), unspents])
    ));
  },
  updateOutpointBlindingData(outpointToBlindingData: Array<[{ txID: string; vout: number; }, UnblindingData]>): Promise<void> {
    return chrome.storage.local.set(Object.fromEntries(
      outpointToBlindingData.map(([outpoint, blindingData]) => [OutpointBlindingDataKey(outpoint.txID, outpoint.vout), blindingData])
    ));
  },
  async getUtxos(): Promise<{ txID: string; vout: number; blindingData?: UnblindingData }[]> {
    const scripts = await getScripts();
    const keys = scripts.map(ScriptUnspentsKey);
    const scriptToUnspent: Record<string, ListUnspentResponse> = await chrome.storage.local.get(keys);
    const outpoints = Object.values(scriptToUnspent).flat();
    const outpointsKeys = outpoints.map(outpoint => OutpointBlindingDataKey(outpoint.tx_hash, outpoint.tx_pos));
    const outpointsToBlindingData: Record<string, UnblindingData> = await chrome.storage.local.get(outpointsKeys);
    return outpoints.map(outpoint => ({
      txID: outpoint.tx_hash,
      vout: outpoint.tx_pos,
      blindingData: outpointsToBlindingData[OutpointBlindingDataKey(outpoint.tx_hash, outpoint.tx_pos)],
    }));
  }, 
}

async function getScripts(): Promise<Array<string>> {
  const data = await chrome.storage.local.get([StaticStorageKey.SCRIPTS]);
  return data[StaticStorageKey.SCRIPTS] as Array<string> ?? [];
}

async function addScripts(...scripts: string[]): Promise<void> {
  const data = await chrome.storage.local.get([StaticStorageKey.SCRIPTS]);
  const scriptsInStorage = new Set(data[StaticStorageKey.SCRIPTS] as Array<string> ?? []);
  for (const script of scripts) {
    scriptsInStorage.add(script);
  }
  return await chrome.storage.local.set({ [StaticStorageKey.SCRIPTS]: Array.from(scriptsInStorage) });
}