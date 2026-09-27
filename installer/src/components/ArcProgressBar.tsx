import React, { useEffect, useRef } from 'react';

interface ArcProgressBarProps {
  percent: number; // 0 to 100
  stageText: string;
}

export const ArcProgressBar: React.FC<ArcProgressBarProps> = ({
  percent,
  stageText,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const render = () => {
      time += 0.03;
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height * 0.52;
      const radius = 78;

      ctx.clearRect(0, 0, width, height);

      // Arc spans from 135 deg to 405 deg (270 degrees sweep)
      const startAngle = Math.PI * 0.75; // 135 degrees
      const endAngle = Math.PI * 2.25;   // 405 degrees
      const totalSweep = endAngle - startAngle;
      const clampedPct = Math.min(Math.max(percent, 0), 100) / 100;
      const currentEndAngle = startAngle + totalSweep * clampedPct;

      // 1. Draw subtle background track
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 0;
      ctx.stroke();

      // 2. Draw Holad Audio Visualizer Bars around the arc circumference
      const barCount = 36;
      for (let i = 0; i <= barCount; i++) {
        const barAngle = startAngle + (totalSweep * i) / barCount;
        const isPassed = barAngle <= currentEndAngle;

        // Dynamic wave height based on audio frequency simulation
        const wave = Math.sin(time * 3 + i * 0.4) * 0.5 + 0.5;
        const barLen = isPassed ? 5 + wave * 9 : 3;

        const innerR = radius + 9;
        const outerR = innerR + barLen;

        const x1 = centerX + Math.cos(barAngle) * innerR;
        const y1 = centerY + Math.sin(barAngle) * innerR;
        const x2 = centerX + Math.cos(barAngle) * outerR;
        const y2 = centerY + Math.sin(barAngle) * outerR;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        if (isPassed) {
          ctx.strokeStyle = `rgba(29, 185, 84, ${0.4 + wave * 0.5})`;
          ctx.shadowColor = 'rgba(29, 185, 84, 0.6)';
          ctx.shadowBlur = 6;
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
      }

      // 3. Draw active glowing progress arc in Holad accent green
      if (clampedPct > 0.005) {
        const grad = ctx.createLinearGradient(
          centerX - radius,
          centerY + radius,
          centerX + radius,
          centerY - radius
        );
        grad.addColorStop(0, '#15803d'); // Dark green
        grad.addColorStop(0.5, '#1db954'); // Holad primary green
        grad.addColorStop(1, '#4ade80'); // Light green

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, currentEndAngle);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(29, 185, 84, 0.8)';
        ctx.shadowBlur = 14;
        ctx.stroke();

        // Glowing pulse head indicator
        const headX = centerX + Math.cos(currentEndAngle) * radius;
        const headY = centerY + Math.sin(currentEndAngle) * radius;

        ctx.beginPath();
        ctx.arc(headX, headY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255, 255, 255, 1)';
        ctx.shadowBlur = 10;
        ctx.fill();
      }

      // 4. Center percentage text
      ctx.shadowBlur = 0;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Percentage
      ctx.font = 'bold 30px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${Math.round(percent)}%`, centerX, centerY - 2);

      // Subtle label below percentage
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = 'rgba(179, 179, 179, 0.7)';
      ctx.fillText('HOLAD AUDIO ENGINE', centerX, centerY + 22);

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [percent]);

  return (
    <div className="flex flex-col items-center justify-center w-full select-none py-2">
      <div className="relative flex items-center justify-center">
        {/* Soft background ambient glow matching Holad accent */}
        <div className="absolute w-40 h-40 rounded-full bg-primary/10 blur-3xl pointer-events-none -z-10 animate-pulse-slow" />
        <canvas
          ref={canvasRef}
          width={250}
          height={210}
          className="block"
        />
      </div>

      {/* Stage detail text */}
      <div className="mt-3 flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] max-w-[360px]">
        <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
        <span className="text-xs font-medium text-zinc-300 truncate">
          {stageText}
        </span>
      </div>
    </div>
  );
};
