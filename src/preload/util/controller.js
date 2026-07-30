/* Controller abstraction for browser Gamepad API plus Windows.Gaming.Input bridge. */
const { ipcRenderer } = require('vacuumtube-host')
const { EventEmitter } = require('tseep/lib/ee-safe')
const emitter = new EventEmitter()

const buttonRepeatInterval = 100
const buttonRepeatDelay = 500
const pressedButtons = {}
let buttonRepeatTimer = null
let focused = true
let nativeGamepads = []

ipcRenderer.on('focus', () => { focused = true })
ipcRenderer.on('blur', () => { focused = false })
ipcRenderer.on('xbox-gamepad-state', (_event, state) => {
    nativeGamepads = state ? [state] : []
})

requestAnimationFrame(pollGamepads)

function pollGamepads() {
    let gamepads = nativeGamepads
    if (!gamepads.length) {
        try { gamepads = Array.from(navigator.getGamepads?.() || []) } catch { gamepads = [] }
    }

    for (const index in pressedButtons) {
        if (!gamepads.find(gamepad => gamepad && String(gamepad.index) === String(index))) delete pressedButtons[index]
    }

    for (const gamepad of gamepads) {
        if (gamepad?.connected !== false) handleGamepad(gamepad)
    }
    requestAnimationFrame(pollGamepads)
}

function handleGamepad(gamepad) {
    const index = gamepad.index || 0
    if (!pressedButtons[index]) pressedButtons[index] = { buttons: {}, axes: {} }
    const state = pressedButtons[index]

    for (let i = 0; i < (gamepad.buttons || []).length; i++) {
        const button = gamepad.buttons[i]
        const isPressed = typeof button === 'number' ? button > 0.5 : !!button.pressed
        const wasPressed = !!state.buttons[i]
        if (isPressed && !wasPressed) {
            state.buttons[i] = true
            buttonDown(i)
            startRepeat(i)
        } else if (!isPressed && wasPressed) {
            state.buttons[i] = false
            buttonUp(i)
            stopRepeat()
        }
    }

    const axes = gamepad.axes || []
    const axisCodes = [
        [1011, 1013], // left X: negative/positive
        [1012, 1014], // left Y: negative/positive
        [1015, 1017], // right X
        [1016, 1018]  // right Y
    ]

    for (let i = 0; i < Math.min(axes.length, axisCodes.length); i++) {
        const value = axes[i]
        const nextCode = value < -0.5 ? axisCodes[i][0] : value > 0.5 ? axisCodes[i][1] : null
        const previousCode = state.axes[i] || null
        if (nextCode === previousCode) continue
        if (previousCode !== null) buttonUp(previousCode)
        state.axes[i] = nextCode
        stopRepeat()
        if (nextCode !== null) {
            buttonDown(nextCode)
            startRepeat(nextCode)
        }
    }
}

function buttonDown(code) { if (focused) emitter.emit('down', { code }) }
function buttonUp(code) { if (focused && code !== null) emitter.emit('up', { code }) }
function startRepeat(code) {
    stopRepeat()
    buttonRepeatTimer = setTimeout(() => {
        buttonRepeatTimer = setInterval(() => buttonDown(code), buttonRepeatInterval)
    }, buttonRepeatDelay)
}
function stopRepeat() {
    clearTimeout(buttonRepeatTimer)
    clearInterval(buttonRepeatTimer)
    buttonRepeatTimer = null
}

module.exports = emitter
