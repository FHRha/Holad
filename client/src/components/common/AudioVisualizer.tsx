import { useEffect, useRef, useMemo } from 'react';
import { Monitor, Smartphone, Tv2 } from 'lucide-react';
import { useAudioStore } from '../../store/audioStore';
import { usePlayerStore } from '../../store/playerStore';
import { useHoladStore } from '../../store/holadStore';
import { useSettingsStore, type VisualizerStyle } from '../../store/settingsStore';
import { useTranslation } from 'react-i18next';
import { getAudioEngine } from '../../audio/AudioEngine';
import { VisualizerEngine } from '../visualizer/VisualizerEngine';
import Dropdown from './Dropdown';
import { getCoverArtUrl } from '../../api/subsonic';

export default function AudioVisualizer() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VisualizerEngine | null>(null);
  const coverImgRef = useRef<HTMLImageElement | null>(null);

  const { audioElement } = useAudioStore();
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const queue = usePlayerStore(s => s.queue);
  const currentIndex = usePlayerStore(s => s.currentIndex);
  const currentTrack = queue[currentIndex];

  const visualizerStyle = useSettingsStore(s => s.visualizerStyle);
  const setVisualizerStyle = useSettingsStore(s => s.setVisualizerStyle);

  const activeDeviceId = useHoladStore(s => s.activeDeviceId);
  const localDeviceId = useHoladStore(s => s.deviceId);
  const devices = useHoladStore(s => s.devices);

  const isRemotePlaying = audioElement && audioElement.paused && isPlaying && activeDeviceId !== localDeviceId && activeDeviceId !== null;
  const activeDevice = devices.find(d => d.id === activeDeviceId);

  // Refs for current states to keep engine zero-allocation and without re-instantiation
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const styleRef = useRef<VisualizerStyle>(visualizerStyle);
  styleRef.current = visualizerStyle;

  // Track cover art loading for 'radial' mode
  const coverArtUrl = useMemo(() => {
    if (!currentTrack) return '';
    return getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 400);
  }, [currentTrack]);

  useEffect(() => {
    if (!coverArtUrl) {
      coverImgRef.current = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = coverArtUrl;
    img.onload = () => {
      coverImgRef.current = img;
    };
    img.onerror = () => {
      coverImgRef.current = null;
    };
  }, [coverArtUrl]);

  // Initialize Visualizer Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const audioCtxEngine = getAudioEngine();

    const engine = new VisualizerEngine({
      canvas,
      getAnalyser: () => audioCtxEngine.getAnalyserNode() || null,
      getIsPlaying: () => isPlayingRef.current,
      getStyle: () => styleRef.current,
      getCoverImage: () => coverImgRef.current,
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [audioElement]);

  // Sync state changes with the running engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.evaluateRunningState();
    }
  }, [isPlaying, visualizerStyle]);

  const styleOptions = useMemo(() => [
    { label: t('visualizer.style_classic', 'Классический спектр'), value: 'classic' },
    { label: t('visualizer.style_modern', 'Неоновый спектр'), value: 'modern' },
    { label: t('visualizer.style_wave', 'Плавная волна'), value: 'wave' },
    { label: t('visualizer.style_radial', 'Круговой'), value: 'radial' },
    { label: t('visualizer.style_peaks', 'Студийный эквалайзер'), value: 'peaks' },
  ], [t]);

  if (isRemotePlaying) {
    const getDeviceIcon = (name: string, className: string) => {
      const n = name.toLowerCase();
      if (n.includes('mobile') || n.includes('iphone') || n.includes('android')) return <Smartphone className={className} />;
      if (n.includes('tv')) return <Tv2 className={className} />;
      return <Monitor className={className} />;
    };

    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-6 animate-in fade-in duration-500">
        <div className="p-5 rounded-full bg-primary/10 animate-pulse">
          {getDeviceIcon(activeDevice?.name || '', "w-16 h-16 text-primary")}
        </div>
        <p className="text-xl md:text-2xl font-medium text-foreground text-center">
          {t('player.playing_on_device')}<span className="text-primary font-bold">{activeDevice?.name || 'Holad Connect'}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 overflow-hidden">
      {/* Visualizer Style Switcher Dropdown in Top-Right corner */}
      <div className="absolute top-4 right-4 z-20 w-44 sm:w-52">
        <Dropdown
          options={styleOptions}
          value={visualizerStyle}
          onChange={(val) => setVisualizerStyle(val as VisualizerStyle)}
          className="text-xs"
        />
      </div>

      {/* Visualizer Canvas */}
      <canvas 
        ref={canvasRef} 
        className="w-full max-w-[1100px] h-[450px] max-h-full block"
      />
    </div>
  );
}
