import {logger} from './logger'

export class RateController {
  private readonly promiseQueue: Promise<void>[] = []
  constructor(queueSize = 20) {
    if (queueSize < 1)
      throw `Invalid queueSize(${queueSize}): must be 1 or greater`
    for (let a = 0; a < queueSize; a++) {
      // All promises in the initial queue are pre-resolved
      this.promiseQueue.push(Promise.resolve())
    }
  }
  async fire<T>(desc: string, callback: () => Promise<T>): Promise<T> {
    // Add a new promise to the queue; this promise will
    // remain unresolved until we finish our task here.
    logger.log(`fire(${desc}): launching`)
    let resolver: () => void
    const next = new Promise<void>(resolve => (resolver = resolve))
    this.promiseQueue.push(next)
    try {
      // Take one queue for me
      const myturn = this.promiseQueue.shift()
      if (!myturn) throw `Queue depleted (${desc})`
      // Wait for my turn and then fire the action
      logger.log(`fire(${desc}): about to wait for my turn`)
      await myturn
      const res = await callback()
      // await myturn.then(async _ => res = await callback()).catch(err => logger.log(JSON.stringify(err)));
      logger.log(`fire(${desc}): finished waiting for my turn`)
      return res!
    } catch (err) {
      logger.error(`fire(${desc}): error found:\n${JSON.stringify(err)}`)
      throw err
    } finally {
      // Fire the next item in the queue
      logger.log(`fire(${desc}): about to resolve next`)
      resolver!()
      logger.log(`fire(${desc}): next resolved`)
    }
  }
}
