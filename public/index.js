const worker1 = new Worker('first-worker.js');
worker1.onmessage = (event) => {
    console.log(event.data);
}
worker1.onerror = (event) => {
    console.error('error received from workerFor => ', event);
}

worker1.postMessage('Hello from main thread');