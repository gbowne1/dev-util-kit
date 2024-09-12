# debugClient

This is node --inspect debug client.

It needs ws installed, so npm -i, npm install or use yarn, pnpm, etc. to install ws.

## Usage

In one terminal window, `node --inspect fileName.js`

It will print Debugger listening on ws://127.0.0.1:9229/<UUID>

in a separate terminal window, `node fileName.js`

copy and paste the UUID it gives you in the window with the node --inspect command run
