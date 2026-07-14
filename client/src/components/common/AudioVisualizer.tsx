import { useEffect, useRef } from 'react';
import { useAudioStore } from '../../store/audioStore';

export default function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { audioElement } = useAudioStore();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!audioElement) return;

    // We must ensure AudioContext is only created once per audio element, 
    // or we use a global audio context for the element if it was already created.
    // Actually, createMediaElementSource can only be called once per HTMLMediaElement.
    // We attach it to the audio element as a property to reuse it!
    const audioEl = audioElement as any;

    if (!audioEl._audioCtx) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioEl._audioCtx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      audioEl._analyser = analyser;
      
      try {
        const source = ctx.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioEl._source = source;
      } catch (e) {
        console.error("Already connected source?", e);
      }
    }

    const ctx = audioEl._audioCtx as AudioContext;
    const analyser = audioEl._analyser as AnalyserNode;

    // Resume context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    analyserRef.current = analyser;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      animationRef.current = requestAnimationFrame(renderFrame);
      
      const width = canvas.width;
      const height = canvas.height;
      
      analyser.getByteFrequencyData(dataArray);
      
      canvasCtx.clearRect(0, 0, width, height);
      
      // We will draw the spectrum in the top half, and a reflection in the bottom half.
      const centerY = height * 0.65; 
      
      const segmentHeight = 4;
      const segmentGap = 3;
      const barWidth = 6;
      const barGap = 4;
      
      // Calculate how many bars we can fit
      const totalBars = Math.floor(width / (barWidth + barGap));
      // Only use the first 60% of the frequency bins for a richer visual
      const usefulBuffer = Math.floor(bufferLength * 0.6);
      
      let x = (width - (totalBars * (barWidth + barGap))) / 2; // Center horizontally
      
      for (let i = 0; i < totalBars; i++) {
        // Linearly map the bar index (0 to totalBars) to the frequency bin index (0 to usefulBuffer)
        // You can also use exponential mapping for better bass representation
        const dataIndex = Math.floor(Math.pow(i / totalBars, 1.2) * usefulBuffer);
        const nextDataIndex = Math.floor(Math.pow((i + 1) / totalBars, 1.2) * usefulBuffer);
        
        let sum = 0;
        let count = 0;
        for (let j = dataIndex; j <= nextDataIndex && j < bufferLength; j++) {
           sum += dataArray[j];
           count++;
        }
        
        const value = count > 0 ? sum / count : dataArray[dataIndex];
        const normalized = value / 255; // 0 to 1
        
        // Calculate number of segments based on intensity
        const maxSegments = Math.floor(centerY / (segmentHeight + segmentGap));
        const activeSegments = Math.floor(normalized * maxSegments * 1.2); // boost a bit
        
        // Determine color based on X position (Green on left, Blue on right)
        const hue = 140 + (i / totalBars) * 80; // 140 is green, 220 is blue
        const color = `hsl(${hue}, 100%, 50%)`;
        
        canvasCtx.fillStyle = color;
        
        // Draw upper segments
        for (let s = 0; s < activeSegments; s++) {
           const y = centerY - s * (segmentHeight + segmentGap) - segmentHeight;
           canvasCtx.fillRect(x, y, barWidth, segmentHeight);
        }
        
        // Draw lower reflection segments (fading opacity)
        const reflectSegments = Math.floor(activeSegments * 0.5); // Reflection is shorter
        for (let s = 0; s < reflectSegments; s++) {
           const y = centerY + s * (segmentHeight + segmentGap) + segmentGap;
           const alpha = 0.3 * (1 - s / reflectSegments);
           canvasCtx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;
           canvasCtx.fillRect(x, y, barWidth, segmentHeight);
        }
        
        x += barWidth + barGap;
      }
    };

    renderFrame();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioElement]);

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <canvas 
        ref={canvasRef} 
        className="w-full max-w-[1000px] h-[400px] max-h-full"
        width={1000}
        height={400}
      />
    </div>
  );
}
