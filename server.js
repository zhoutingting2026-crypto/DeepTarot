const fs = require('node:fs');
const path = require('node:path');
if(fs.existsSync(path.join(__dirname,'.env')))process.loadEnvFile(path.join(__dirname,'.env'));
require('./server-runtime.cjs').startServer();
