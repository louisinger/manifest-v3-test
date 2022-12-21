chrome.storage.local.onChanged.addListener(function(changes, namespace) {
    console.log('storage changed')
})

document.getElementById('clear').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
        message: "reset"
    });
    document.getElementById('address_restored').innerText = "";
});

// on click of the button, send a message to the background script
document.getElementById('restore').addEventListener('click', async () => {
    const resp = await chrome.runtime.sendMessage({
        message: "restore",
        data: { mnemonic: document.querySelector('input').value }
    });
    if (resp.error) { 
        document.getElementById('address_restored').innerText = resp.error;
        return;
    }
    const numAddresses = resp.lastUsed.internal + resp.lastUsed.external;
    document.getElementById('address_restored').innerText = "number of addresses restored: " + numAddresses;
    // set the number of address restored to <p> element id address_restored
});

document.getElementById('subscribe').addEventListener('click', async () => {
    const resp = await chrome.runtime.sendMessage({
        message: "subscribe",
        data: { mnemonic: document.querySelector('input').value }
    });
    console.log('resp: ', resp)
    document.getElementById('address_restored').innerText = "";
});

document.getElementById('getNextAddress').addEventListener('click', async () => {
    const resp = await chrome.runtime.sendMessage({
        message: "getNextAddress",
        data: { mnemonic: document.querySelector('input').value }
    });
    console.log('resp: ', resp)
    document.getElementById('address_restored').innerText = resp;
});