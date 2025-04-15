async function connectSerial() {
    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        const reader = port.readable.getReader();
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            console.log(new TextDecoder().decode(value));
        }
    } catch (error) {
        console.error("Serial connection error:", error);
    }
}