import { networks } from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import Account from './account';
import { WsElectrumChainSource } from './chainsource';
import { isGetNextAddressMessage, isResetMessage, isRestoreMessage, isSubscribeMessage } from './messages';
import { ChromeRepository, StaticStorageKey } from './storage';

const bip32 = BIP32Factory(ecc);

const NETWORK = networks.testnet;

// instantiate the websocket client
const chainSource = WsElectrumChainSource.fromNetwork(NETWORK.name);

function createAccount(mnemonic: string): Account {
  if (!bip39.validateMnemonic(mnemonic))
    throw new Error('Invalid mnemonic');
  
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const node = bip32.fromSeed(seed, NETWORK);

  return new Account({
    node,
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


