import { ChromeRepository } from "./storage";

document.getElementById('clear')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
        message: "reset"
    });
    document.getElementById('address_restored')!.innerText = "";
    document.getElementById('balances')!.innerText = "";
});

// on click of the button, send a message to the background script
document.getElementById('restore')?.addEventListener('click', async () => {
    const resp = await chrome.runtime.sendMessage({
        message: "restore",
        data: { mnemonic: document.querySelector('input')?.value }
    });
    if (resp.error) { 
        document.getElementById('address_restored')!.innerText = resp.error;
        return;
    }
    const numAddresses = resp.lastUsed.internal + resp.lastUsed.external;
    document.getElementById('address_restored')!.innerText = "number of addresses restored: " + numAddresses;
    // set the number of address restored to <p> element id address_restored
});

document.getElementById('subscribe')!.addEventListener('click', async () => {
    const resp = await chrome.runtime.sendMessage({
        message: "subscribe",
        data: { mnemonic: document.querySelector('input')!.value }
    });
    console.log('resp: ', resp)
    document.getElementById('address_restored')!.innerText = "";
});

document.getElementById('getNextAddress')!.addEventListener('click', async () => {
    const resp = await chrome.runtime.sendMessage({
        message: "getNextAddress",
        data: { mnemonic: document.querySelector('input')!.value }
    });
    console.log('resp: ', resp)
    document.getElementById('address_restored')!.innerText = resp;
});

document.getElementById('getBalance')!.addEventListener('click', async () => {
    const utxos = await ChromeRepository.getUtxos();
    console.log('utxos: ', utxos)
    const balances: Record<string, number> = {};
    utxos.forEach(utxo => {
        if (!utxo.blindingData) return;
        if (!balances[utxo.blindingData.asset]) {
            balances[utxo.blindingData.asset] = utxo.blindingData.value;
        } else {
            balances[utxo.blindingData.asset] += utxo.blindingData.value;
        }
    });
    console.log('balances: ', balances)
    document.getElementById('balances')!.innerText = "balance computed!";
});