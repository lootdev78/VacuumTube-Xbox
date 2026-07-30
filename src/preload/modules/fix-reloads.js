//when it sends a RELOAD_PAGE command, youtube's service worker can intercept it and break VacuumTube's preload injection. this script fixes that by telling the main process to reload through the native WebView2 host, bypassing the service worker

const { ipcRenderer } = require('vacuumtube-host')
const rcMod = require('../util/resolveCommandModifiers')

module.exports = () => {
    rcMod.addInputModifier((command) => {
        if (!command.signalAction || !command.signalAction.signal || command.signalAction.signal !== 'RELOAD_PAGE') return command;

        ipcRenderer.invoke('reload')
        return false;
    })
}