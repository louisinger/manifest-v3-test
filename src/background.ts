import { networks } from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import Account from './account';
import ElectrumWS from './electrum';
import { sync } from './syncer';


const bip32 = BIP32Factory(ecc);


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



