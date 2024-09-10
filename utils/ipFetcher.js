const os = require('os');

const getServerIpAddress = () => {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        for (const iface of networkInterfaces[interfaceName]) {
            // Check for IPv4 and not loopback address
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return -1;
}

module.exports = { getServerIpAddress };