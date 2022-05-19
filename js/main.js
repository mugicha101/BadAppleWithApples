const maxApples = 500; // hard limit of apples spawned per frame (if diffTarget reached before this, does not reach this amount)
const diffTarget = 0.02; // max difference (1 = invert, 0 = exact match) between target and produced image (diffTarget approaches this value as apples are added per frame)
const debugMode = false; // use circles instead of apples

const rCanvas = document.getElementById("canvas"); // render canvas
const rCtx = rCanvas.getContext("2d", {alpha: false});

const dCanvas = document.getElementById("dCanvas"); // debug canvas for figuring out what computer is seeing
const dCtx = dCanvas.getContext("2d", {alpha: false});

const vCanvas = document.getElementById('vCanvas'); // video canvas (where the video data can be pulled from)
const vCtx = vCanvas.getContext('2d', {alpha: false});

const width = vCanvas.width;
const height = vCanvas.height;

const canvas = document.createElement('canvas'); // apple canvas (not directly displayed to reduce calculation times)
const c = canvas.getContext("2d", {alpha: false});
canvas.width = width;
canvas.height = height;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function transformCtx(ctx, scale, rot, hMove, vMove) {
  ctx.transform(scale, 0, 0, scale, hMove, vMove)
  if (rot !== 0)
    ctx.rotate(rot*Math.PI/180);
}

function resetCtxTrans(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function extendCtx(ctx) {
  ctx.transformCtx = function(scale, rot, hMove, vMove) {
    transformCtx(ctx, scale, rot, hMove, vMove);
  }
  ctx.resetTrans = function() {
    resetCtxTrans(ctx);
  }
}

extendCtx(c);
extendCtx(rCtx);

const fps = 12;
const frameTime = 1/fps;
const video = document.getElementById("video");
video.addEventListener('loadeddata', function() {
  start();
})

const blackAppleImg = new Image();
blackAppleImg.src = "img/black_apple.png";

const blackAppleCoreImg = new Image();
blackAppleCoreImg.src = "img/black_apple_core.png";

const whiteAppleImg = new Image();
whiteAppleImg.src = "img/white_apple.png";

const whiteAppleCoreImg = new Image();
whiteAppleCoreImg.src = "img/white_apple_core.png";

// https://stackoverflow.com/a/36481059
// Standard Normal variate using Box-Muller transform.
function randn_bm() {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while(v === 0) v = Math.random();
  return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}

function move(x, y, dir, amount) {
  let radians = dir*Math.PI/180;
  let xChange = Math.cos(radians) * amount;
  let yChange = Math.sin(radians) * amount;
  return [x + xChange, y - yChange];
}

class Apple {
  constructor(x=null, y=null, dir=null, scale=null, white=null, core=null) { // if empty, spawns in a random state
    this.x = x != null? x : Math.floor(Math.random() * width);
    this.y = y != null? y : Math.floor(Math.random() * height);
    this.dir = dir != null? dir : Math.random() * 360;
    this.scale = scale != null? scale : Math.pow(Math.E, -7 + Math.random() * (4 - 2 * tickState.amount / maxApples)); // log distribution
    this.white = white != null? white : Math.random() < 0.5;
    this.core = core != null? core : false // Math.random() < 0.5;
  }

  clone() {
    return new Apple(this.x, this.y, this.dir, this.scale, this.white, this.core);
  }

  add(ctx=c) { // adds self to canvas
    let canvas = ctx.canvas;
    let scale = canvas.width / width;
    if (ctx === c) apples.push(this); // only add to apples if rendering on apple canvas
    ctx.resetTrans();
    ctx.transformCtx(this.scale * scale, this.dir, this.x * scale, this.y * scale);
    if (debugMode) {
      ctx.beginPath();
      ctx.fillStyle = this.white? "white" : "black";
      ctx.arc(0, 0, 1500, 0, Math.PI*2, false);
      ctx.fill();
    } else {
      let img = this.core? (this.white? whiteAppleCoreImg : blackAppleCoreImg) : (this.white? whiteAppleImg : blackAppleImg);
      ctx.drawImage(img, -img.width * 0.5, -img.height * 0.5);
    }
  }

  createChild() { // creates a random child that is a slight mutation of itself
    let pos = move(this.x, this.y, Math.random() * 360, Math.random() * 10);
    let dir = (this.dir + 360 + Math.random() * 45 - 12.5) % 360
    let scale = this.scale * (0.75 + 0.5 * Math.random());
    return new Apple(pos[0], pos[1], dir, scale);
  }
}

let apples = []; // array of current apples on the canvas
let totalApples = 0; // total apples spawned in
let saveState = {};
function saveCanvasState(state=saveState) { // saves current image data of canvas and apple states for loading a previous state quickly
  state.apples = [];
  for (let i = 0; i < apples.length; i++)
    state.apples.push(apples[i].clone());
  state.imgData = c.getImageData(0, 0, width, height);
}

function loadCanvasState(state=saveState) { // loads saved canvas state
  apples = [];
  for (let i = 0; i < state.apples.length; i++)
    apples.push(state.apples[i].clone());
  c.putImageData(state.imgData, 0, 0);
}

let firstFrame = true;
function advanceVideo() { // advances video 1 frame
  if (!firstFrame) {
    video.currentTime = Math.min(video.duration, video.currentTime + frameTime);
  } else {
    firstFrame = false;
  }
  vCtx.drawImage(video, 0, 0, width, height);
}

const sampleSpacing = 2; // distance between each of the sampled pixels
function diffCalc() { // gets a sample of pixels and compares difference between pixels on apple canvas vs actual canvas
  let maxDiff = 0;
  let cumDiff = 0;
  let appleImageData = c.getImageData(0, 0, width, height).data;
  let targetImageData = vCtx.getImageData(0, 0, width, height).data;
  for (let y = sampleSpacing; y < height; y += sampleSpacing) {
    for (let x = sampleSpacing; x < width; x += sampleSpacing) {
      let index = (y * width + x) * 4;
      cumDiff += Math.abs(targetImageData[index] - appleImageData[index]); // because is monochrome, only need red value
      maxDiff += 255;
    }
  }
  return cumDiff/maxDiff;
}

function clearCanvas() { // clears apple canvas of all apples
  c.resetTrans();
  apples = [];
  c.fillStyle = "rgb(255, 255, 255)";
  c.fillRect(0, 0, canvas.width, canvas.height);
}

function renderFrame(apples) { // renders a frame from an apple array
  for (let i = 0; i < apples.length; i++) {
    apples[i].add(rCtx);
  }
}

const initialPool = 80; // amount of apples to start with
const parentPool = 5; // amount parent apples (culls worse ones)
const children = 3; // amount of children
const generations = 5; // generations of children to go through
function spawnApple() { // spawns apple using best of <spawnPool> random spawns
  saveCanvasState();
  let ogDiff = diffCalc();
  let candidates = [];
  let evalApple = function(a) {
    a.add();
    let newDiff = diffCalc();
    if (newDiff < ogDiff)
      candidates.push([a, newDiff]);
    loadCanvasState();
  }
  let cull = function() {
    candidates.sort((a, b) => a[0] - b[0]);
    candidates.splice(parentPool);
  }
  let reproduce = function() {
    for (let i = 0; i < parentPool; i++) {
      for (let i = 0; i < Math.min(candidates.length, children); i++)
        evalApple(candidates[i][0].createChild());
    }
  }

  // spawn initial pool
  for (let i = 0; i < initialPool; i++) {
    evalApple(new Apple());
  }

  // mutations
  cull();
  for (let i = 0; i < generations; i++) {
    reproduce();
    cull();
  }

  // get best
  if (candidates.length > 0) {
    candidates[0][0].add();
    totalApples++;
    return candidates[0][1];
  } else
    return ogDiff;
}

const tickState = {
  step: 1, // steps: 0 - spawn, 1 - finished
  amount: -1, // amount of operations left
}

const renderedFrames = [];
function tickApples() { // updates the apple canvas
  // advance video frame
  if (tickState.step === 1) {
    if (video.currentTime === video.duration)
      return true;
    advanceVideo();
   tickState.step = 0;
   tickState.amount = -1;
  }

  switch (tickState.step) {
    case 0:
      // spawn new apples to meet cap
      if (tickState.amount === -1) {
        apples = [];
        tickState.amount = 0;
      }
      if (spawnApple() <= diffTarget * Math.pow(tickState.amount / maxApples, 0.25) || tickState.amount >= maxApples-1) { // advance to next step
        tickState.step++;
        tickState.amount = -1;
      } else
        tickState.amount++;
      break;
  }
  if (tickState.step === 1) { // render final apple canvas
    console.log('render')
    renderFrame(apples);
    let state = {};
    saveCanvasState(state);
    renderedFrames.push(state.apples);
    console.log(apples.length);
  }
  return false;
}

let frame = -1;
let simFinished = false;
function simLoop() {
  frame++;
  for (let i = 0; (i === 0 || tickState.step !== 1) && i < 3; i++) {
    if (tickApples()) {
      simFinished = true;
      break;
    }
  }
  dCtx.drawImage(canvas, 0, 0);
  document.getElementById("count_label").textContent = "Apples: " + totalApples.toString();
  if (simFinished) {
    renderState.nextFrameTime = new Date().getTime();
    requestAnimationFrame(renderLoop);
  }
  else
    requestAnimationFrame(simLoop);
}

const renderState = {
  nextFrameTime: 0,
  frame: 0
}
function renderLoop() {
  let date = new Date();
  if (date.getTime() >= renderState.nextFrameTime) {
    renderState.nextFrameTime += 1000/fps;
    if (renderState.frame === 0) {
      rCtx.fillStyle = "white";
      rCtx.fillRect(0, 0, rCanvas.width, rCanvas.height);
    }
    renderFrame(renderedFrames[renderState.frame++]);
    if (renderState.frame >= renderedFrames.length)
      renderState.frame = 0;
  }
  requestAnimationFrame(renderLoop);
}
function start() {
  clearCanvas();
  rCtx.fillStyle = "white";
  rCtx.fillRect(0, 0, rCanvas.width, rCanvas.height);
  saveCanvasState();
  // video.currentTime += 5;
  requestAnimationFrame(simLoop);
}
