import { BIP32Interface } from "bip32";
import { networks, payments, crypto } from "liquidjs-lib";
import ElectrumWS, { ElectrumClient, GetHistoryResponse } from "./electrum";
import { ChromeStorage, StorageInterface } from "./storage";


const GAP_LIMIT = 20;

export default class Account {
  public electrum: ElectrumClient;
  public network: networks.Network;
  private node: BIP32Interface;
  private cache: StorageInterface;
  private baseDerivationPath: string;

  static BASE_DERIVATION_PATH = "m/84'/1776'/0'";
  static BASE_DERIVATION_PATH_LEGACY = "m/84'/0'/0'";
  static BASE_DERIVATION_PATH_TESTNET = "m/84'/1'/0'";

  constructor({
    node,
    electrum,
    network = networks.liquid,
    storage = new ChromeStorage(),
    baseDerivationPath = Account.BASE_DERIVATION_PATH_LEGACY,
  }: {
    node: BIP32Interface,
    electrum: ElectrumClient,
    network?: networks.Network,
    storage?: StorageInterface,
    baseDerivationPath?: string,
  }) {
    this.node = node.derivePath(baseDerivationPath);
    this.network = network;
    this.electrum = electrum;
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
      //store
      const kv = { [script.toString('hex')]: `${this.baseDerivationPath}/${chain}/${i}` };
      await this.cache.set({ scriptHexToDerivationPath: kv });
    }
    return scripts;
  }


  async sync(gapLimit = GAP_LIMIT): Promise<{
    lastUsed: { internal: number, external: number },
    historyTxsId: Set<string>,
    heightsSet: Set<number>,
    txidHeight: Map<string, number | undefined>
  }> {

    let historyTxsId: Set<string> = new Set();
    let heightsSet: Set<number> = new Set();
    let txidHeight: Map<string, number | undefined> = new Map();

    let lastUsed = { internal: 0, external: 0 };
    const walletChains = [0, 1];
    for (const i of walletChains) {
      const isInternal = i === 1;
      let batchCount = 0;

      while (true) {
        const batch = await this.deriveBatch(batchCount, gapLimit, isInternal);
        try {
          const histories = await this.electrum.batchScriptGetHistory(batch);
          let max = histories
            .map((v, i) => v.length > 0 ? i : -1)
            .reduce((a, b) => Math.max(a, b), -1);
          if (max >= 0) {
            if (isInternal) {
              lastUsed.internal = max + batchCount * gapLimit;
            } else {
              lastUsed.external = max + batchCount * gapLimit;
            }
          }


          let flattened: GetHistoryResponse[] = histories.flat();
          console.log(`${i}/batch(${batchCount}) ${flattened.length}`);

          if (flattened.length === 0) {
            break;
          }


          for (let el of flattened) {
            let height = Math.max(el.height, 0);
            heightsSet.add(height as number);
            if (height === 0) {
              txidHeight.set(el.tx_hash, undefined);
            } else {
              txidHeight.set(el.tx_hash, height as number);
            }

            historyTxsId.add(el.tx_hash);
          }

          batchCount += 1;
        } catch (error: any) {
          throw new Error(error);
        }
      }
    }

    await this.cache.set({ lastUsed, historyTxsId, heightsSet, txidHeight });
    return { lastUsed, historyTxsId, heightsSet, txidHeight };
  }

}