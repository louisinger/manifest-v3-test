chrome.runtime.onInstalled.addListener(async () => {
    //console.log(navigator)
    //await navigator.serviceWorker.register('first-worker.js');
    //await navigator.serviceWorker.register('second-worker.js');
    const worker1 = new Worker('first-worker.js');
    worker1.onmessage = (event) => {
        console.log(event.data);
    }
    worker1.onerror = (event) => {
        console.error('error received from workerFor => ', event);
    }

    worker1.postMessage('Hello from main thread');
    
});

export {};