/**
 * Mock Web Audio API and HTMLAudioElement for Holad Audio Engine Testing
 * Provides full inspection of audio graph, nodes, gain scheduling, and element states.
 */

export class MockAudioParam {
  public value: number;
  public defaultValue: number;
  public minValue: number;
  public maxValue: number;
  public scheduledEvents: Array<{ type: string; value?: number; target?: number; time: number; timeConstant?: number; duration?: number }> = [];

  constructor(defaultValue: number = 1.0, min: number = -3.4028235e38, max: number = 3.4028235e38) {
    this.value = defaultValue;
    this.defaultValue = defaultValue;
    this.minValue = min;
    this.maxValue = max;
  }

  setValueAtTime(value: number, startTime: number): MockAudioParam {
    this.value = value;
    this.scheduledEvents.push({ type: 'setValueAtTime', value, time: startTime });
    return this;
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): MockAudioParam {
    this.value = target;
    this.scheduledEvents.push({ type: 'setTargetAtTime', target, time: startTime, timeConstant });
    return this;
  }

  linearRampToValueAtTime(value: number, endTime: number): MockAudioParam {
    this.value = value;
    this.scheduledEvents.push({ type: 'linearRampToValueAtTime', value, time: endTime });
    return this;
  }

  exponentialRampToValueAtTime(value: number, endTime: number): MockAudioParam {
    this.value = value;
    this.scheduledEvents.push({ type: 'exponentialRampToValueAtTime', value, time: endTime });
    return this;
  }

  cancelScheduledValues(startTime: number): MockAudioParam {
    this.scheduledEvents = this.scheduledEvents.filter(e => e.time < startTime);
    return this;
  }
}

export class MockAudioNode {
  public context: MockAudioContext;
  public connectedTo: MockAudioNode[] = [];
  public numberOfInputs: number = 1;
  public numberOfOutputs: number = 1;

  constructor(context: MockAudioContext) {
    this.context = context;
  }

  connect(destinationNode: MockAudioNode): MockAudioNode {
    if (!this.connectedTo.includes(destinationNode)) {
      this.connectedTo.push(destinationNode);
    }
    return destinationNode;
  }

  disconnect(destinationNode?: MockAudioNode): void {
    if (destinationNode) {
      this.connectedTo = this.connectedTo.filter(n => n !== destinationNode);
    } else {
      this.connectedTo = [];
    }
  }
}

export class MockGainNode extends MockAudioNode {
  public gain: MockAudioParam;

  constructor(context: MockAudioContext) {
    super(context);
    this.gain = new MockAudioParam(1.0);
  }
}

export class MockDynamicsCompressorNode extends MockAudioNode {
  public threshold: MockAudioParam;
  public knee: MockAudioParam;
  public ratio: MockAudioParam;
  public attack: MockAudioParam;
  public release: MockAudioParam;
  public reduction: number = 0;

  constructor(context: MockAudioContext) {
    super(context);
    this.threshold = new MockAudioParam(-18, -100, 0);
    this.knee = new MockAudioParam(30, 0, 40);
    this.ratio = new MockAudioParam(3, 1, 20);
    this.attack = new MockAudioParam(0.003, 0, 1);
    this.release = new MockAudioParam(0.25, 0, 1);
  }
}

export class MockAnalyserNode extends MockAudioNode {
  public fftSize: number = 256;
  public frequencyBinCount: number = 128;
  public minDecibels: number = -100;
  public maxDecibels: number = -30;
  public smoothingTimeConstant: number = 0.8;

  constructor(context: MockAudioContext) {
    super(context);
  }

  getByteFrequencyData(array: Uint8Array): void {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }

  getByteTimeDomainData(array: Uint8Array): void {
    for (let i = 0; i < array.length; i++) {
      array[i] = 128;
    }
  }
}

export class MockMediaElementAudioSourceNode extends MockAudioNode {
  public mediaElement: HTMLAudioElement;

  constructor(context: MockAudioContext, mediaElement: HTMLAudioElement) {
    super(context);
    this.mediaElement = mediaElement;
  }
}

export class MockAudioDestinationNode extends MockAudioNode {
  public maxChannelCount: number = 2;

  constructor(context: MockAudioContext) {
    super(context);
    this.numberOfOutputs = 0;
  }
}

export class MockAudioContext {
  public state: 'suspended' | 'running' | 'closed' = 'suspended';
  public currentTime: number = 0;
  public sampleRate: number = 44100;
  public destination: MockAudioDestinationNode;
  public createdNodes: MockAudioNode[] = [];

  constructor() {
    this.destination = new MockAudioDestinationNode(this);
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }

  createGain(): MockGainNode {
    const node = new MockGainNode(this);
    this.createdNodes.push(node);
    return node;
  }

  createAnalyser(): MockAnalyserNode {
    const node = new MockAnalyserNode(this);
    this.createdNodes.push(node);
    return node;
  }

  createDynamicsCompressor(): MockDynamicsCompressorNode {
    const node = new MockDynamicsCompressorNode(this);
    this.createdNodes.push(node);
    return node;
  }

  createMediaElementSource(element: HTMLAudioElement): MockMediaElementAudioSourceNode {
    const node = new MockMediaElementAudioSourceNode(this, element);
    this.createdNodes.push(node);
    return node;
  }

  advanceTime(seconds: number): void {
    this.currentTime += seconds;
  }
}

export class MockTimeRanges {
  private ranges: Array<{ start: number; end: number }> = [];

  constructor(ranges: Array<{ start: number; end: number }> = []) {
    this.ranges = ranges;
  }

  get length(): number {
    return this.ranges.length;
  }

  start(index: number): number {
    if (index < 0 || index >= this.ranges.length) throw new Error('IndexSizeError');
    return this.ranges[index].start;
  }

  end(index: number): number {
    if (index < 0 || index >= this.ranges.length) throw new Error('IndexSizeError');
    return this.ranges[index].end;
  }

  addRange(start: number, end: number): void {
    this.ranges.push({ start, end });
  }

  clear(): void {
    this.ranges = [];
  }
}

export function createMockAudioElement(): HTMLAudioElement {
  const el = typeof document !== 'undefined' ? document.createElement('audio') : ({} as HTMLAudioElement);
  
  (el as any).playCallCount = 0;
  (el as any).pauseCallCount = 0;
  (el as any).loadCallCount = 0;
  
  let bufferedRanges = new MockTimeRanges([{ start: 0, end: 60 }]);
  let currentPos = 0;
  let durationVal = 180;
  let isPaused = true;
  let isEnded = false;

  Object.defineProperty(el, 'buffered', {
    get: () => bufferedRanges,
    set: (val: MockTimeRanges) => { bufferedRanges = val; },
    configurable: true,
  });

  Object.defineProperty(el, 'currentTime', {
    get: () => currentPos,
    set: (val: number) => { currentPos = val; },
    configurable: true,
  });

  Object.defineProperty(el, 'duration', {
    get: () => durationVal,
    set: (val: number) => { durationVal = val; },
    configurable: true,
  });

  Object.defineProperty(el, 'paused', {
    get: () => isPaused,
    set: (val: boolean) => { isPaused = val; },
    configurable: true,
  });

  Object.defineProperty(el, 'ended', {
    get: () => isEnded,
    set: (val: boolean) => { isEnded = val; },
    configurable: true,
  });

  Object.defineProperty(el, 'readyState', {
    value: 4,
    writable: true,
    configurable: true,
  });

  el.play = async () => {
    (el as any).playCallCount++;
    isPaused = false;
    isEnded = false;
    el.dispatchEvent(new Event('play'));
    el.dispatchEvent(new Event('playing'));
  };

  el.pause = () => {
    (el as any).pauseCallCount++;
    isPaused = true;
    el.dispatchEvent(new Event('pause'));
  };

  el.load = () => {
    (el as any).loadCallCount++;
    el.dispatchEvent(new Event('loadedmetadata'));
    el.dispatchEvent(new Event('canplay'));
    el.dispatchEvent(new Event('canplaythrough'));
  };

  (el as any).simulateTimeUpdate = (time: number) => {
    currentPos = time;
    el.dispatchEvent(new Event('timeupdate'));
  };

  (el as any).simulateEnded = () => {
    currentPos = durationVal;
    isPaused = true;
    isEnded = true;
    el.dispatchEvent(new Event('ended'));
  };

  (el as any).simulateBufferProgress = (start: number, end: number) => {
    bufferedRanges = new MockTimeRanges([{ start, end }]);
    el.dispatchEvent(new Event('progress'));
  };

  (el as any).simulateWaiting = () => {
    el.dispatchEvent(new Event('waiting'));
  };

  (el as any).simulateCanPlay = () => {
    el.dispatchEvent(new Event('canplay'));
  };

  (el as any).simulateError = (error: any = new Error('Media error')) => {
    const ev = new Event('error');
    (ev as any).error = error;
    el.dispatchEvent(ev);
  };

  return el;
}

export class MockAudioElement {
  constructor() {
    return createMockAudioElement();
  }
}
