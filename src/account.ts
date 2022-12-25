import { BIP32Interface } from "bip32";
import { networks, payments } from "liquidjs-lib";
import { Slip77Interface } from "slip77";
import { ChainSource } from "./chainsource";
import { ChromeRepository, WalletRepository } from "./storage";

const GAP_LIMIT = 20;

export default class Account {
  public chainSource: ChainSource;
  public network: networks.Network;
  private node: BIP32Interface;
  private blindingKeyNode: Slip77Interface;
  private cache: WalletRepository;
  private baseDerivationPath: string;

  static BASE_DERIVATION_PATH = "m/84'/1776'/0'";
  static BASE_DERIVATION_PATH_LEGACY = "m/84'/0'/0'";
  static BASE_DERIVATION_PATH_TESTNET = "m/84'/1'/0'";

  constructor({
    node,
    blindingKeyNode,
    chainSource,
    network = networks.liquid,
    storage = ChromeRepository,
    baseDerivationPath = Account.BASE_DERIVATION_PATH_LEGACY,
  }: {
    node: BIP32Interface,
    blindingKeyNode: Slip77Interface,
    chainSource: ChainSource,
    network?: networks.Network,
    storage?: WalletRepository,
    baseDerivationPath?: string,
  }) {
    this.node = node.derivePath(baseDerivationPath);
    this.blindingKeyNode = blindingKeyNode;
    this.network = network;
    this.chainSource = chainSource;
    this.cache = storage;
    this.baseDerivationPath = baseDerivationPath;
  }

  deriveBlindingKey(script: Buffer): { publicKey: Buffer, privateKey: Buffer } {
    const derived = this.blindingKeyNode.derive(script);
    if (!derived.publicKey || !derived.privateKey) throw new Error('Could not derive blinding key');
    return { publicKey: derived.publicKey, privateKey: derived.privateKey }
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
    }

    // persist the derived details
    await this.cache.updateScriptDetails(Object.fromEntries(scripts.map(script => [script.toString('hex'), {
      derivationPath: `${this.baseDerivationPath}/${chain}/${start}`,
      blindingPrivateKey: this.deriveBlindingKey(script).privateKey.toString('hex'),
    }])));

    return scripts;
  }

  async getNextAddress(isInternal: boolean): Promise<string> {
    const lastIndexes = await this.cache.getLastUsedIndexes();
    const lastUsed = lastIndexes ? lastIndexes[isInternal ? 'internal' : 'external'] ?? 0 : 0;
    const scripts = await this.deriveBatch(lastUsed, lastUsed + 1, isInternal);
    const script = scripts[0];
    const { publicKey } = this.deriveBlindingKey(script);
    const address = payments.p2wpkh({ output: script, network: this.network, blindkey: publicKey }).address;
    if (!address) throw new Error('Could not derive address');
    return address;
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

    // we need to cache the restored script in order to fetch the unspents once we have the whole history
    const scriptsRestored: Buffer[] = [];

    const walletChains = [0, 1];
    for (const i of walletChains) {
      const isInternal = i === 1;
      let batchCount = isInternal ? lastUsed.internal : lastUsed.external;
      let unusedScriptCounter = 0;


      while (unusedScriptCounter < gapLimit) {
        const scripts = await this.deriveBatch(batchCount, batchCount + gapLimit, isInternal);
        const histories = await this.chainSource.fetchHistories(scripts);
        console.log(`${isInternal ? "internal" : "external"}/batch(${batchCount}) ${histories.flat().length}`);

        for (const [index, history] of histories.entries()) {
          if (history.length > 0) {
            scriptsRestored.push(scripts[index]);
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
        batchCount += gapLimit;
      }
    }

    // fetch the unspents
    const unspents = await this.chainSource.fetchUnspentOutputs(scriptsRestored);

    await Promise.allSettled([
      this.cache.addWalletTransactions(...historyTxsId),
      this.cache.setLastUsedIndex(lastUsed.internal, true),
      this.cache.setLastUsedIndex(lastUsed.external, false),
      this.cache.updateScriptUnspents(Object.fromEntries(unspents.filter(ls => ls.length > 0).map((utxos, index) => [scriptsRestored[index].toString('hex'), utxos]))),
      this.cache.updateTxDetails(Object.fromEntries(Array.from(historyTxsId).map(txid => [txid, { height: txidHeight.get(txid) }]))),
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
      await this.chainSource.subscribeScriptStatus(script, async (_: string, status: string | null) => {
        console.log('script status changed', script.toString('hex'), status)
        const history = await this.chainSource.fetchHistories([script]);
        const historyTxId = history[0].map(({ tx_hash }) => tx_hash);

        await Promise.all([
          this.cache.addWalletTransactions(...historyTxId),
          this.cache.updateTxDetails(Object.fromEntries(history[0].map(({ tx_hash, height }) => [tx_hash, { height }]))),
        ]);

        const unspents = await this.chainSource.fetchUnspentOutputs([script]);
        const unspentForScript = unspents[0];
        await this.cache.updateScriptUnspents({ [script.toString('hex')]: unspentForScript });
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