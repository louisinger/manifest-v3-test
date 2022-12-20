chrome.storage.local.onChanged.addListener(function(changes, namespace) {
    console.log('storage changed')
})

// on click of the button, send a message to the background script
document.getElementById('restore').addEventListener('click', async () => {
    const mnemonic = document.querySelector('input').value;
    console.log('restore button clicked: ', mnemonic)
    

    const resp = await chrome.runtime.sendMessage({
        message: "start_restore",
        mnemonic: document.querySelector('input').value
    });
    console.log('resp: ', resp)
    const numAddresses = resp.lastUsed.internal + resp.lastUsed.external;
    document.getElementById('address_restored').innerText = "number of addresses restored: " + numAddresses;
    // set the number of address restored to <p> element id address_restored
});

