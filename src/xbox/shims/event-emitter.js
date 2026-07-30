class EventEmitter {
    constructor() { this.listeners = new Map() }
    on(name, fn) {
        const list = this.listeners.get(name) || []
        list.push(fn)
        this.listeners.set(name, list)
        return this
    }
    off(name, fn) {
        const list = this.listeners.get(name) || []
        this.listeners.set(name, list.filter(item => item !== fn))
        return this
    }
    once(name, fn) {
        const wrapped = (...args) => { this.off(name, wrapped); fn(...args) }
        return this.on(name, wrapped)
    }
    emit(name, ...args) {
        for (const fn of [...(this.listeners.get(name) || [])]) {
            try { fn(...args) } catch (error) { console.error('[VacuumTube Xbox] event listener failed', error) }
        }
        return true
    }
}
module.exports = { EventEmitter }
