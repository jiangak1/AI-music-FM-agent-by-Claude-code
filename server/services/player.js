let queue = [];
let currentIndex = -1;

function getQueue() {
  return queue;
}

function getCurrent() {
  if (currentIndex >= 0 && currentIndex < queue.length) {
    return queue[currentIndex];
  }
  return null;
}

function addToQueue(track, toFront = false) {
  if (Array.isArray(track)) {
    if (toFront) {
      queue.unshift(...track);
      currentIndex += track.length;
    } else {
      queue.push(...track);
    }
  } else {
    if (toFront) {
      queue.unshift(track);
      if (currentIndex >= 0) currentIndex++;
    } else {
      queue.push(track);
    }
  }
}

function removeFromQueue(index) {
  if (index < 0 || index >= queue.length) return;
  queue.splice(index, 1);
  if (index < currentIndex) currentIndex--;
  if (index === currentIndex) {
    currentIndex = Math.min(currentIndex, queue.length - 1);
  }
}

function next() {
  currentIndex++;
  if (currentIndex >= queue.length) {
    currentIndex = queue.length - 1;
    return null;
  }
  return queue[currentIndex];
}

function setCurrent(index) {
  if (index >= 0 && index < queue.length) {
    currentIndex = index;
  }
}

function clearQueue() {
  queue = [];
  currentIndex = -1;
}

module.exports = {
  getQueue,
  getCurrent,
  addToQueue,
  removeFromQueue,
  next,
  setCurrent,
  clearQueue,
};
