class BrowserQueue {
    constructor(maxConcurrent) {
        this.max = maxConcurrent;
        this.active = 0;
        this.waiting = [];
    }

    /**
     * Call this before starting Puppeteer work.
     * It will wait if there are already `maxConcurrent` tasks running.
     * If the client disconnects while waiting, it removes the task from the queue to save resources.
     */
    async enqueue(req) {
        if (this.active < this.max) {
            this.active++;
            return true;
        }

        return new Promise((resolve) => {
            const task = { resolve };
            this.waiting.push(task);

            // If client disconnects while waiting in queue, remove it so we don't process it later
            req.on('close', () => {
                const idx = this.waiting.indexOf(task);
                if (idx !== -1) {
                    this.waiting.splice(idx, 1);
                    console.log('[Queue] Client disconnected while waiting. Removed from queue. (Waiting: ' + this.waiting.length + ')');
                }
            });
        });
    }

    /**
     * Call this inside a `finally` block after Puppeteer work is done.
     */
    release() {
        if (this.waiting.length > 0) {
            const nextTask = this.waiting.shift();
            console.log(`[Queue] Processing next request. (Waiting: ${this.waiting.length})`);
            nextTask.resolve(true);
        } else {
            this.active--;
        }
    }
}

// 5 tabs max. This is a very safe number to prevent CPU/RAM overload.
// It will process 5 at a time, while others wait in line.
const browserQueue = new BrowserQueue(5);

module.exports = browserQueue;
