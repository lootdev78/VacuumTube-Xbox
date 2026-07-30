// Route YouTube's EXIT_APP command to the UWP host.
const { ipcRenderer } = require('vacuumtube-host')
const rcMod = require('../util/resolveCommandModifiers')
module.exports = () => {
    rcMod.addInputModifier(command => {
        const commands = command.commandExecutorCommand?.commands
        if (!commands?.some(item => item.signalAction?.signal === 'EXIT_APP')) return command
        ipcRenderer.invoke('exit-app')
        return false
    })
}
