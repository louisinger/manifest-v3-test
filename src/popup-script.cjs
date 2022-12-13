chrome.storage.local.onChanged.addListener(function(changes, namespace) {
    console.log('storage changed')
})

// on click of the button, send a message to the background script
document.getElementById('restore').addEventListener('click', () => {
    const mnemonic = document.querySelector('input').value;
    console.log('restore button clicked: ', mnemonic)
    

    chrome.runtime.sendMessage({ 
        message: "start_restore",
        mnemonic: document.querySelector('input').value
    }, function(response) {
        console.log('response: ', response)
    });

});

