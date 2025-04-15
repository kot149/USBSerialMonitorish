document.getElementById('connectButton').addEventListener('click', async () => {
    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        const reader = port.readable.getReader();
        const outputDiv = document.getElementById('output');
        const filterInput = document.getElementById('filterInput');
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                reader.releaseLock();
                break;
            } const textDecoder = new TextDecoder();
            const decodedValue = textDecoder.decode(value);
            const regex = new RegExp(filterInput.value);
            if (regex.test(decodedValue)) {
                outputDiv.innerText += decodedValue;
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
});
document.addEventListener('keydown', (event) => {
    const keyInfoDiv = document.getElementById('keyInfo');
    keyInfoDiv.innerText = `Key: ${event.key}, KeyCode: ${event.keyCode}`;
});
