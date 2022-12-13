import { ChainAPI, crypto, EsploraTx, EsploraUtxo, IdentityInterface, IdentityType, MasterPublicKey, Mnemonic, Output, Restorer, restorerFromState, TxInterface } from 'ldk';
import * as ecc from 'tiny-secp256k1';

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.message === 'start_restore') {
        const mnemonic = request.mnemonic;

        const identity = new Mnemonic({
            chain: 'testnet',
            ecclib: ecc,
            type: IdentityType.Mnemonic,
            opts: {
                mnemonic: mnemonic,
            }
        })

        const watchonlyIdentity = new MasterPublicKey({
            chain: 'testnet',
            ecclib: ecc,
            type: IdentityType.MasterPublicKey,
            opts: {
                masterPublicKey: identity.masterPublicKey,
                masterBlindingKey: identity.masterBlindingKey,
            }
        })

        const restorer = makeRestorerFromChainAPI(
            watchonlyIdentity,
            (isChange, index) => watchonlyIdentity.getAddress(isChange, index).address.confidentialAddress
        )

        return new Promise(async (resolve, reject) => {
            try {
                const masterPubKey = await restorer({ api: new BatchServerFetchAPI('https://electrs-batch-testnet.vulpem.com'), gapLimit: 30 })
                const addresses = await masterPubKey.getAddresses()
                console.log('addresses', addresses)
                resolve({ masterPubKey: masterPubKey })
            } catch (err) {
                console.log('error', err)
                reject({ error: err })
            }
        })
    }
});

class BatchServerFetchAPI implements ChainAPI {
    constructor(private batchServerURL: string = 'https://electrs-batch-blockstream.vulpem.com') { }

    fetchUtxos(addresses: string[], skip?: ((utxo: EsploraUtxo) => boolean) | undefined): Promise<Output[]> {
        throw new Error('Method not implemented.');
    }
    fetchTxs(addresses: string[], skip?: ((esploraTx: EsploraTx) => boolean) | undefined): Promise<TxInterface[]> {
        throw new Error('Method not implemented.');
    }
    fetchTxsHex(txids: string[]): Promise<{ txid: string; hex: string; }[]> {
        throw new Error('Method not implemented.');
    }

    async addressesHasBeenUsed(addresses: string[]): Promise<boolean[]> {
        const response = await fetch(
            `${this.batchServerURL}/addresses/transactions`,
            { method: 'POST', body: JSON.stringify({ addresses: addresses }), headers: { 'Content-Type': 'application/json' } }
        );
        if (response.ok) {
            const results = [];
            const resp = await response.json();
            for (const { transaction } of resp) {
                results.push(transaction.length > 0);
            }
            return results;
        }
        return Array(addresses.length).fill(false);
    }
}


function makeRestorerFromChainAPI<T extends IdentityInterface>(
    id: T,
    getAddress: (isChange: boolean, index: number) => string
): Restorer<{ api: ChainAPI; gapLimit: number }, IdentityInterface> {
    return async ({ gapLimit, api }) => {
        const restoreFunc = async function (
            getAddrFunc: (index: number) => Promise<string>
        ): Promise<number | undefined> {
            let counter = 0;
            let next = 0;
            let maxIndex: number | undefined = undefined;

            while (counter < gapLimit) {
                const cpyNext = next;
                // generate a set of addresses from next to (next + gapLimit - 1)
                const addrs = await Promise.all(
                    Array.from(Array(gapLimit).keys())
                        .map((i) => i + cpyNext)
                        .map(getAddrFunc)
                );

                const hasBeenUsedArray = await api.addressesHasBeenUsed(addrs);

                let indexInArray = 0;
                for (const hasBeenUsed of hasBeenUsedArray) {
                    if (hasBeenUsed) {
                        maxIndex = indexInArray + next;
                        counter = 0;
                    } else {
                        counter++;
                        if (counter === gapLimit) return maxIndex; // duplicate the stop condition
                    }
                    indexInArray++;
                }

                next += gapLimit; // increase next
            }

            return maxIndex;
        };
        const restorerExternal = restoreFunc((index: number) => {
            return Promise.resolve(getAddress(false, index));
        });

        const restorerInternal = restoreFunc((index: number) => {
            return Promise.resolve(getAddress(true, index));
        });

        const [lastUsedExternalIndex, lastUsedInternalIndex] = await Promise.all([
            restorerExternal,
            restorerInternal,
        ]);

        return restorerFromState(id)({
            lastUsedExternalIndex,
            lastUsedInternalIndex,
        });
    };
}