// Manual mock for the `bullmq` package used automatically by Jest during
// tests, so unit/integration tests never try to open a real Redis TCP
// connection for the webhook retry queue/worker.
class Queue {
  constructor() {}
  async add() {
    return { id: 'mock-job-id' };
  }
  async close() {}
}

class Worker {
  constructor() {}
  on() {}
  async close() {}
}

module.exports = { Queue, Worker };
