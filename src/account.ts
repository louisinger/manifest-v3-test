import { BIP32Interface } from "bip32";
import { networks, payments, crypto } from "liquidjs-lib";

export default class Account {
  node: BIP32Interface;
  cache: Record<string, string>;

  static BASE_DERIVATION_PATH = "m/84'/1776'/0'";
  static BASE_DERIVATION_PATH_LEGACY = "m/84'/0'/0'";
  static BASE_DERIVATIONT_PATH_TESTNET = "m/84'/1'/0'";


  constructor(node: BIP32Interface, private network: networks.Network, private baseDerivationPath: string = Account.BASE_DERIVATION_PATH_LEGACY) {
    this.node = node.derivePath(baseDerivationPath);
    this.cache = {};
  }

  // Derive a range from start to end index of public keys applying the base derivation path
  deriveBatch(start: number, end: number, isInternal: boolean): Buffer[] {
    const chain = isInternal ? 1 : 0;
    let scripts = [];
    for (let i = start; i < end; i++) {
      const child = this.node.derive(chain).derive(i);
      const p2wpkh = payments.p2wpkh({ pubkey: child.publicKey, network: this.network });
      const script = p2wpkh.output;
      if (!script) continue;
      this.cache[script.toString('hex')] = `${this.baseDerivationPath}/${chain}/${i}`;
      scripts.push(script);
    }
    return scripts;
  }
}