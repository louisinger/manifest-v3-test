import { networks } from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import Account from './account';
import ElectrumWS from './electrum';
import { ChromeStorage } from './storage';


const bip32 = BIP32Factory(ecc);


/* 
MainAccount m/84'/1776'/0'

0. counter external/internal 0 - 0 
1. pubkey > scriptHash - parent - store 
2. get_history - worker - store > 0 txs
3. tx.get - worker
4. unblind - worker 
*/


chrome.storage.onChanged.addListener((changes) => {
  console.debug('storage changed', changes);
});


chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
  
  console.log(sender.tab ?
    "from a content script:" + sender.tab.url :
    "from the extension");

  if (request.message === 'start_restore') {
    console.log('start restore');
    
      const network = networks.testnet;
      const mnemonic = request.mnemonic;

      console.log('mnemonic', mnemonic);

      if (!bip39.validateMnemonic(mnemonic))
        throw new Error('Invalid mnemonic');

      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const node = bip32.fromSeed(seed, network);
    
      const electrum = new ElectrumWS(ElectrumWS.ElectrumBlockstreamTestnet);
      const account = new Account({
        node, 
        electrum, 
        network,  
      });

      //console.log('account', account);
      const { lastUsed, historyTxsId, heightsSet, txidHeight } = await account.sync(1);
      //console.log(lastUsed, historyTxsId, heightsSet, txidHeight);
      //Promise.resolve({ lastUsed, historyTxsId, heightsSet, txidHeight }).then((res) => sendResponse(res));
      sendResponse({ lastUsed, historyTxsId, heightsSet, txidHeight });
  }
  return true;
});



