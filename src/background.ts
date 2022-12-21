import { networks } from 'liquidjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import Account from './account';
import { WsElectrumChainSource } from './chainsource';
import { isResetMessage, isRestoreMessage, isSubscribeMessage } from './types';

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

chrome.storage.onChanged.addListener((changes) => {
  console.debug('storage changed', changes);
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
  } 
});


