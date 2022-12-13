import { networks, crypto, payments } from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory, BIP32Interface } from 'bip32';
import * as bip39 from 'bip39';
import { SLIP77Factory } from 'slip77';


const bip32 = BIP32Factory(ecc);
const slip77 = SLIP77Factory(ecc);
const GAP_LIMIT = 20;

/* 
MainAccount m/84'/1776'/0'

0. counter external/internal 0 - 0 
1. pubkey > scriptHash - parent - store 
2. get_history - worker - store > 0 txs
3. tx.get - worker
4. unblind - worker 
*/


chrome.storage.onChanged.addListener((changes, areaName) => {
  console.debug('storage changed', changes, areaName);
});


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  const network = networks.testnet;

  if (request.message === 'start_restore') {
    console.log('start restore');

    return new Promise(async (resolve, reject) => {
      const mnemonic = request.mnemonic;

      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const node = bip32.fromSeed(seed, network);
    
      const account = new Account(node, network);
      const electrum = new ElectrumWS(
        new WebSocket('wss://blockstream.info/liquidtestnet/electrum-websocket/api')
      );

      const { lastUsed, historyTxsId, heightsSet, txidHeight } = await sync(account, electrum);
  
      chrome.storage.local.set({ lastUsed, historyTxsId, heightsSet, txidHeight });
      resolve({ lastUsed, historyTxsId, heightsSet, txidHeight });
    });
  }
  return true;
});



async function sync(account: Account, electrum: ElectrumWS): Promise<{ 
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
      const batch = account.deriveBatch(batchCount, GAP_LIMIT, isInternal);
      const histories = await electrum.batchScriptGetHistory(batch);

      let max = histories
        .map((v, i) => v.length > 0 ? i : -1)
        .reduce((a, b) => Math.max(a, b));
      if (max >= 0) {
        if (isInternal) {
          lastUsed.internal = max + batchCount * GAP_LIMIT;
        } else {
          lastUsed.external = max + batchCount * GAP_LIMIT;
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
    }
  }

  return { lastUsed, historyTxsId, heightsSet, txidHeight };
}

class Account {
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
  deriveBatch(start: number, end: number, isInternal: boolean): string[] {
    const chain = isInternal ? 1 : 0;
    let scripts = [];
    for (let i = start; i < end; i++) {
      const child = this.node.derive(chain).derive(i);
      const p2wpkh = payments.p2wpkh({ pubkey: child.publicKey, network: this.network });
      const script = p2wpkh.output;
      if (!script) continue;
      const scriptHex = hashScriptAndReverse(script).toString('hex');
      this.cache[scriptHex] = `${this.baseDerivationPath}/${chain}/${i}`;
      scripts.push(scriptHex);
    }
    return scripts;
  }
}

interface GetHistoryResponse {
  tx_hash: string;
  height: number;
}

class ElectrumWS {
  constructor(private ws: WebSocket) { }

  async batchScriptGetHistory(scripts: string[]): Promise<GetHistoryResponse[][]> {
    const requests = scripts.map((script) => ({ method: 'blockchain.scripthash.get_history', params: [script] }));
    const histories = await this.batchedWebsocketRequest(requests);
    return histories;
  }

  private async batchedWebsocketRequest(requests: { method: string; params: any[] }[]): Promise<any[]> {
    const ws = this.ws;
    let argumentsByID: Record<number, any> = {};
    // wait for ws to be connected
    if (ws.readyState !== WebSocket.OPEN) {
      return new Promise((resolve) => {
        ws.onopen = () => {
          resolve(this.batchedWebsocketRequest(requests));
        };
      });
    }

    let id = Math.ceil(Math.random() * 1e5);

    const payloads = requests.map(({ method, params }) => {
      id++;
      argumentsByID[id] = params[0];
      return {
        jsonrpc: '2.0',
        method,
        params,
        id,
      };
    });

    //console.debug('ElectrumWS SEND:', requests);
    ws.send(JSON.stringify(payloads));


    return new Promise((resolve, reject) => {
      ws.onmessage = (event) => {
        const { result, error } = JSON.parse(event.data);
        if (result && Array.isArray(result) && result[0] && result[0].id) {
          // this is a batch request response
          for (let r of result) {
            r.param = argumentsByID[r.id];
          }
        }
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };
    });
  }
}


function hashScriptAndReverse(script: Buffer): Buffer {
  return crypto.sha256(script).reverse();
}
