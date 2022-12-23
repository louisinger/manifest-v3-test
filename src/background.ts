import { networks, Transaction } from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';
import zkp from '@vulpemventures/secp256k1-zkp'
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import Account from './account';
import { ListUnspentResponse, WsElectrumChainSource } from './chainsource';
import { isGetNextAddressMessage, isResetMessage, isRestoreMessage, isSubscribeMessage } from './messages';
import { ChromeRepository, isScriptUnspentKey, StaticStorageKey } from './storage';
import { SLIP77Factory } from 'slip77';
import { UnblindingData, WalletRepositoryUnblinder } from './unblinding';

const bip32 = BIP32Factory(ecc);
const slip77 = SLIP77Factory(ecc);

// this is OK because we set topLevelAwait to true in webpack.common.cjs
const zkpLib = await zkp();
const unblinder = new WalletRepositoryUnblinder(ChromeRepository, zkpLib);


const NETWORK = networks.testnet;

// instantiate the websocket client
const chainSource = WsElectrumChainSource.fromNetwork(NETWORK.name);

function createAccount(mnemonic: string): Account {
  if (!bip39.validateMnemonic(mnemonic))
    throw new Error('Invalid mnemonic');
  
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const node = bip32.fromSeed(seed, NETWORK);
  const slip77node = slip77.fromSeed(seed);

  return new Account({
    node,
    blindingKeyNode: slip77node,
    chainSource,
    network: NETWORK,
  });
}

function handleError(sendResponse: Function) {
  return function(error: unknown) {
    console.error(error);
    sendResponse({ error });
  }
}

chrome.storage.onChanged.addListener(async (changes: Record<string, chrome.storage.StorageChange>) => {
  console.info('Storage changed', changes);
  for (const key in changes) {
    if (StaticStorageKey.TX_IDS === key) {
      const newTxIDs = changes[key].newValue as string[] | undefined;
      if (!newTxIDs) continue; // it means we just deleted the key
      const oldTxIDs = changes[key].oldValue ? changes[key].oldValue as string[] : [];
      
      // for all new txs, we need to fetch the tx hex
      const oldTxIDsSet = new Set(oldTxIDs);
      const txIDsToFetch = newTxIDs.filter(txID => !oldTxIDsSet.has(txID));
      const transactions = await chainSource.fetchTransactions(txIDsToFetch);
      await ChromeRepository.updateTxDetails(Object.fromEntries(transactions.map((tx, i) => [txIDsToFetch[i], tx])));
    } else if (isScriptUnspentKey(key)) {
      console.time('handle new unspents')
      const newUnspents = changes[key].newValue as ListUnspentResponse | undefined;
      if (!newUnspents) continue; // it means we just deleted the key
      const oldUnspents = changes[key].oldValue ? changes[key].oldValue as ListUnspentResponse : [];
      
      // for all new unspents, we need to fetch the tx hex
      const oldUnspentsSet = new Set(oldUnspents);
      const utxosToUnblind = newUnspents.filter(unspent => !oldUnspentsSet.has(unspent));

      // get the tx hexes in order to unblind their Output
      const txIDs = utxosToUnblind.map(unspent => unspent.tx_hash);
      const fromCache = await ChromeRepository.getTxDetails(...txIDs);

      const txMapToHex = new Map<string, string>();
      const missingTxs = [];

      for (const [ID, details] of Object.entries(fromCache)) {
        if (details?.hex) txMapToHex.set(ID, details.hex);
        else missingTxs.push(ID);
      }

      // if not found in cache, fetch them from the chain source
      if (missingTxs.length > 0) {
        const txs = await chainSource.fetchTransactions(missingTxs);
        for (const tx of txs) {
          txMapToHex.set(tx.txID, tx.hex);
        }
      }

      const outputs = utxosToUnblind.map(unspent => {
        const txHex = txMapToHex.get(unspent.tx_hash);
        if (!txHex) throw new Error('Tx hex not found');
        const tx = Transaction.fromHex(txHex);
        return tx.outs[unspent.tx_pos];
      });

      const unblindedResults = await unblinder.unblind(...outputs);
      const successfullyUnblinded = unblindedResults.filter(u => !(u instanceof Error)) as UnblindingData[];

      await ChromeRepository.updateOutpointBlindingData(successfullyUnblinded.map((unblinded, i) => {
        const utxo = utxosToUnblind[i];
        return [{ txID: utxo.tx_hash, vout: utxo.tx_pos }, unblinded];
      }))
      console.timeEnd('handle new unspents')
    }
  }
});

chrome.runtime.onMessage.addListener(function (request, _, sendResponse) {
  if (isResetMessage(request)) {
    chrome.storage.local.clear();
    sendResponse();
  } else if (isRestoreMessage(request)) {
    const mnemonic = request.data.mnemonic;
    const account = createAccount(mnemonic);
    account.sync(20)
      .then(sendResponse)
      .catch(handleError(sendResponse));  
    return true;
  } else if (isSubscribeMessage(request)) {
    const mnemonic = request.data.mnemonic;
    const account = createAccount(mnemonic);
    account.unsubscribeAll()
      .then(() => account.subscribeAll())
      .then(sendResponse)
      .catch(handleError(sendResponse));
    return true;
  } else if (isGetNextAddressMessage(request)) {
    const mnemonic = request.data.mnemonic;
    const account = createAccount(mnemonic);
    account.getNextAddress(false)
      .then(sendResponse)
      .catch(handleError(sendResponse));
    return true;
  }
});


