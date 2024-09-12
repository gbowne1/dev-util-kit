const WebSocket = require('ws');
const readline = require('readline');

let messageId = 1;
const pendingCommands = new Map();
let isPaused = false;

// Create a readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function promptForUUID() {
    return new Promise((resolve) => {
        rl.question('Enter the UUID from node --inspect: ', (uuid) => {
            resolve(uuid.trim());
        });
    });
}

async function sendCommand(ws, method, params = {}) {
    const id = messageId++;
    return new Promise((resolve, reject) => {
        pendingCommands.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function connectToInspector() {
    try {
        const uuid = await promptForUUID();
        const inspectorUrl = `ws://127.0.0.1:9229/${uuid}`;
        const ws = new WebSocket(inspectorUrl);

        await new Promise((resolve, reject) => {
            ws.on('open', resolve);
            ws.on('error', reject);
        });

        console.log("Connected to Node.js inspector");

        await sendCommand(ws, "Debugger.enable");
        await sendCommand(ws, "Runtime.runIfWaitingForDebugger");

        ws.on('message', handleMessage);
        ws.on('close', () => {
            console.log('Disconnected from Node.js inspector');
            rl.close();
        });

        commandLoop(ws);
    } catch (error) {
        console.error('Failed to connect:', error.message);
        rl.close();
    }
}

function handleMessage(message) {
    console.log("Received message:", JSON.stringify(message, null, 2));

    if (message.id && pendingCommands.has(message.id)) {
        const { resolve, reject } = pendingCommands.get(message.id);
        pendingCommands.delete(message.id);
        if (message.error) {
            reject(new Error(message.error.message));
        } else {
            resolve(message.result);
        }
    }

    if (message.method === "Debugger.paused") {
        isPaused = true;
        console.log(`Debugger paused at: ${message.params.callFrames[0].location}`);
    } else if (message.method === "Debugger.resumed") {
        isPaused = false;
        console.log("Debugger resumed");
    }

    if (message.error) {
        console.error(`Error: ${message.error.message}`);
        if (message.error.code === -32000) {
            console.log("Tip: Make sure the debugger is paused before stepping or continuing.");
        }
    }
}

async function commandLoop(ws) {
    async function executeCommand(command) {
        try {
            switch (command) {
                case 'continue':
                    if (!isPaused) {
                        throw new Error("Cannot continue: debugger is not paused.");
                    }
                    await sendCommand(ws, "Debugger.resume");
                    break;
                case 'step':
                    if (!isPaused) {
                        throw new Error("Cannot step: debugger is not paused.");
                    }
                    await sendCommand(ws, "Debugger.stepOver");
                    break;
                case 'breakpoint':
                    const fileName = await promptForFileName();
                    const line = await promptForLineNumber(fileName);
                    try {
                        const result = await sendCommand(ws, "Debugger.setBreakpointByUrl", {
                            lineNumber: parseInt(line) - 1,
                            urlRegex: fileName
                        });
                        console.log(`Breakpoint set: ${JSON.stringify(result)}`);
                    } catch (error) {
                        console.error(`Failed to set breakpoint: ${error.message}`);
                    }
                    break;
                case 'quit':
                    ws.close();
                    rl.close();
                    return;
                default:
                    throw new Error('Unknown command');
            }
        } catch (error) {
            console.error('Command execution failed:', error.message);
        }
    }

    while (true) {
        const command = await promptUserInput();
        await executeCommand(command);
    }
}

async function promptUserInput() {
    return new Promise((resolve) => {
        rl.question('Enter command (continue/step/breakpoint/quit): ', (command) => {
            resolve(command.trim());
        });
    });
}

async function promptForFileName() {
    return new Promise((resolve) => {
        rl.question('Enter file name: ', (fileName) => {
            resolve(fileName.trim());
        });
    });
}

async function promptForLineNumber(fileName) {
    return new Promise((resolve) => {
        rl.question(`Enter line number for ${fileName}: `, (line) => {
            resolve(line.trim());
        });
    });
}

// Start the connection process
connectToInspector().catch(console.error);
