import { BIP32Interface } from "bip32";
import { networks, payments } from "liquidjs-lib";
import { ChainSource } from "./chainsource";
import { ChromeRepository, WalletRepository } from "./storage";


const GAP_LIMIT = 20;

export default class Account {
  public chainSource: ChainSource;
  public network: networks.Network;
  private node: BIP32Interface;
  private cache: WalletRepository;
  private baseDerivationPath: string;

  static BASE_DERIVATION_PATH = "m/84'/1776'/0'";
  static BASE_DERIVATION_PATH_LEGACY = "m/84'/0'/0'";
  static BASE_DERIVATION_PATH_TESTNET = "m/84'/1'/0'";

  constructor({
    node,
    chainSource,
    network = networks.liquid,
    storage = ChromeRepository,
    baseDerivationPath = Account.BASE_DERIVATION_PATH_LEGACY,
  }: {
    node: BIP32Interface,
    chainSource: ChainSource,
    network?: networks.Network,
    storage?: WalletRepository,
    baseDerivationPath?: string,
  }) {
    this.node = node.derivePath(baseDerivationPath);
    this.network = network;
    this.chainSource = chainSource;
    this.cache = storage;
    this.baseDerivationPath = baseDerivationPath;
  }

  // Derive a range from start to end index of public keys applying the base derivation path
  async deriveBatch(start: number, end: number, isInternal: boolean): Promise<Buffer[]> {
    const chain = isInternal ? 1 : 0;
    let scripts = [];
    for (let i = start; i < end; i++) {
      const child = this.node.derive(chain).derive(i);
      const p2wpkh = payments.p2wpkh({ pubkey: child.publicKey, network: this.network });
      const script = p2wpkh.output;
      if (!script) continue;
      scripts.push(script);
      await this.cache.setScriptHexDerivationPath(script.toString('hex'), `${this.baseDerivationPath}/${chain}/${i}`);
    }
    return scripts;
  }


  async sync(gapLimit = GAP_LIMIT): Promise<{
    lastUsed: { internal: number, external: number },
  }> {

    let historyTxsId: Set<string> = new Set();
    let heightsSet: Set<number> = new Set();
    let txidHeight: Map<string, number | undefined> = new Map();

    const cachedLastUsed = await this.cache.getLastUsedIndexes();
    let lastUsed = {
      internal: cachedLastUsed?.internal || 0,
      external: cachedLastUsed?.external || 0,
    }

    const walletChains = [0, 1];
    for (const i of walletChains) {
      const isInternal = i === 1;
      let batchCount = isInternal ? lastUsed.internal : lastUsed.external;
      let unusedScriptCounter = 0;

      while (unusedScriptCounter < gapLimit) {
        const scripts = await this.deriveBatch(batchCount, batchCount + gapLimit, isInternal);
        const histories = await this.chainSource.batchScriptGetHistory(scripts);
        console.log(`${isInternal ? "internal" : "external"}/batch(${batchCount}) ${histories.flat().length}`);

        for (const [index, history] of histories.entries()) {
          if (history.length > 0) {
            unusedScriptCounter = 0; // reset counter
            const newMaxIndex = index + batchCount;
            if (isInternal) lastUsed.internal = newMaxIndex;
            else lastUsed.external = newMaxIndex;

            // update the history set
            for (const { tx_hash, height } of history) {
              historyTxsId.add(tx_hash);
              if (height !== undefined) heightsSet.add(height);
              txidHeight.set(tx_hash, height);
            }
          } else {
            unusedScriptCounter++;
          }
        }
        console.log('consecutive unused script:', unusedScriptCounter)
        batchCount += gapLimit;
      }
    }

    await Promise.all([
      this.cache.addWalletTransactions(...historyTxsId),
      this.cache.setLastUsedIndex(lastUsed.internal, true),
      this.cache.setLastUsedIndex(lastUsed.external, false),
      ...Array.from(txidHeight.entries()).map(([txid, height]) => this.cache.updateTxDetails(txid, { height })),
    ]);

    return {
      lastUsed: {
        internal: lastUsed.internal,
        external: lastUsed.external,
      }
    };
  }

  // subscribe to addresses in a range
  async subscribeBatch(start: number, end: number, isInternal: boolean): Promise<void> {
    const scripts = await this.deriveBatch(start, end, isInternal);
    for (const script of scripts) {
      await this.chainSource.subscribeScriptStatus(script, async (scripthash: string, status: string | null) => { 
        console.log('script status changed', script.toString('hex'), status)
        const history = await this.chainSource.batchScriptGetHistory([script]);
        const historyTxId = history[0].map(({ tx_hash }) => tx_hash);
        const txidHeight = new Map(history[0].map(({ tx_hash, height }) => [tx_hash, height]));

        await Promise.all([
          this.cache.addWalletTransactions(...historyTxId),
          ...Array.from(txidHeight.entries()).map(([txid, height]) => this.cache.updateTxDetails(txid, { height })),
        ]);

      });
    }
  }

  async unsubscribeBatch(start: number, end: number, isInternal: boolean): Promise<void> {
    const scripts = await this.deriveBatch(start, end, isInternal);
    for (const script of scripts) {
      await this.chainSource.unsubscribeScriptStatus(script);
    }
  }

  async subscribeAll(): Promise<void> {
    const cachedLastUsed = await this.cache.getLastUsedIndexes();
    const lastUsed = {
      internal: cachedLastUsed?.internal || 0,
      external: cachedLastUsed?.external || 0,
    }

    const walletChains = [0, 1];
    for (const i of walletChains) {
      const isInternal = i === 1;
      let batchCount = isInternal ? lastUsed.internal : lastUsed.external;
      await this.subscribeBatch(batchCount, batchCount + GAP_LIMIT, isInternal);
    }
  }

  async unsubscribeAll(): Promise<void> {
    const cachedLastUsed = await this.cache.getLastUsedIndexes();
    const lastUsed = {
      internal: cachedLastUsed?.internal || 0,
      external: cachedLastUsed?.external || 0,
    }

    const walletChains = [0, 1];
    for (const i of walletChains) {
      const isInternal = i === 1;
      let batchCount = isInternal ? lastUsed.internal : lastUsed.external;
      await this.unsubscribeBatch(batchCount, batchCount + GAP_LIMIT, isInternal);
    }
  }
}