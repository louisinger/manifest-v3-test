import { address, AddressInterface, ChainAPI, crypto, EsploraTx, EsploraUtxo, IdentityInterface, IdentityType, MasterPublicKey, Mnemonic, Output, Restorer, restorerFromState, TxInterface } from 'ldk';
import * as ecc from 'tiny-secp256k1';


// storage key
const HistoryKey = (scripthash: string) => `history:${scripthash}`;
const AddressInfosKey = (scripthash: string) => `address_infos:${scripthash}`;

const isHistoryKey = (key: string) => key.startsWith('history:');
const isAddressInfosKey = (key: string) => key.startsWith('address_infos:');


/* 
MainAccount m/84'/1776'/0'

0. counter external/internal 0 - 0 
1. pubkey > scriptHash - parent - store 
2. get_history - worker - store > 0 txs
3. tx.get - worker
4. unblind - worker 


*/



chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return; // skip non local changes

    for (const key in changes) {
        const change = changes[key];
        console.log('storage changed', key, change);
        // change { newValue: '', oldValue: '' }
        if (isHistoryKey(key)) {
            // handle counter
            // get txs hexes
            // get prevouts
        } else if (isAddressInfosKey(key)) {
            // unblind utxos 
        }
    }
});


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.message === 'start_restore') {
        const mnemonic = request.mnemonic;

        // bip32.derive
        // get_history 30
        // storage.outpoints

        // blockchain.transaction.get
        // storage.{outpoint: prevouts}

        // unblinding with key
        // storage.{outpint: unblindData}

        return new Promise(async (resolve, reject) => {
            console.log('start restore', mnemonic)
            console.time('restore');
            const identity = new Mnemonic({
                chain: 'testnet',
                ecclib: ecc,
                type: IdentityType.Mnemonic,
                opts: {
                    mnemonic: mnemonic,
                }
            });

            const ws = new WebSocket('wss://blockstream.info/liquidtestnet/electrum-websocket/api');


            const GAP_LIMIT = 20;
            let count = 0;
            let index = 0;
            let restoredIndex = 0;
            while (count < GAP_LIMIT) {
                const addr = identity.getAddress(false, index);
                index++;
                const history = await getHistory(ws, addr.address.confidentialAddress);
                if (history.length > 0) {
                    count = 0;
                    restoredIndex = index;
                } else {
                    count++;
                }
            }

            // regenerate the address
            for (let i = 0; i < restoredIndex; i++) {
                await identity.getNextAddress();
            }

            count = 0;
            index = 0;
            restoredIndex = 0;
            while (count < GAP_LIMIT) {
                const addr = identity.getAddress(true, index);
                index++;
                const history = await getHistory(ws, addr.address.confidentialAddress);
                if (history.length > 0) {
                    count = 0;
                    restoredIndex = index;
                } else {
                    count++;
                }
            }

            // regenerate the address
            for (let i = 0; i < restoredIndex; i++) {
                await identity.getNextChangeAddress();
            }
            console.timeEnd('restore');

            const addresses = await identity.getAddresses();

            const keys: Record<string, AddressInterface> = {}
            for (const addr of addresses) {
                keys[AddressInfosKey(hashScriptAndReverse(addr.confidentialAddress))] = addr;
            }
            await chrome.storage.local.set(keys);

            resolve(addresses);
        });

    }
    return true;
});

async function getHistory(ws: WebSocket, address: string): Promise<Array<{ tx_hash: string }>> {
    const scripthash = hashScriptAndReverse(address);
    const history = await websocketRequest(ws, 'blockchain.scripthash.get_history', [scripthash]);
    if (history.length > 0) {
        await chrome.storage.local.set({ [HistoryKey(scripthash)]: history });
    }
    return history;
}

function hashScriptAndReverse(addr: string): string {
    return crypto.sha256(address.toOutputScript(addr)).reverse().toString('hex');
}

function websocketRequest(ws: WebSocket, method: string, params: any[]): Promise<any> {
    // wait for ws to be connected
    if (ws.readyState !== WebSocket.OPEN) {
        return new Promise((resolve) => {
            ws.onopen = () => {
                resolve(websocketRequest(ws, method, params));
            };
        });
    }

    const id = Math.ceil(Math.random() * 1e5);

    const payload = {
        jsonrpc: '2.0',
        method,
        params,
        id,
    };

    console.debug('ElectrumWS SEND:', method, ...params);
    ws.send(JSON.stringify(payload));

    return new Promise((resolve, reject) => {
        ws.onmessage = (event) => {
            const { result, error } = JSON.parse(event.data);
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        };
    });

}    