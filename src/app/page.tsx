"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Wand2, 
  Image as ImageIcon, 
  Sparkles, 
  Download, 
  Loader2, 
  Trash2, 
  Maximize, 
  Scissors, 
  ExternalLink, 
  X, 
  ShieldCheck,
  Monitor,
  MoreVertical,
  Settings,
  Settings2,
  Zap,
  Upload,
  LogOut,
  ChevronDown,
  Layout,
  Lock
} from "lucide-react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import clsx from "clsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const MODES = [
  { id: "standard", name: "Standard", desc: "Fast & budget-friendly", icon: ImageIcon },
  { id: "premium", name: "Premium", desc: "High fidelity details", icon: Sparkles },
  { id: "artistic", name: "Artistic", desc: "Highly stylized & unique", icon: Wand2 },
];

const STYLES = [
  "3D Render", "Vector Art", "Kawaii / Chibi", "Anime", "Vintage / Retro",
  "Isometric 3D", "Pixel Art", "Watercolor Painting", "Cyberpunk Neon",
  "Pop Art Comic", "Minimalist Line Art", "Low Poly", "Origami Papercraft",
  "Claymation / Plasticine", "Graffiti Street Art"
];

// Helper to create image from URL
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

// Helper to get cropped image as data URL
async function getCroppedImg(imageSrc: string, crop: Crop): Promise<string> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return "";

    // v7.12: Percentage Precision Engine - No more rendered-pixel scaling
    // Percentages (0-100) are mapped directly to natural dimensions
    const scaleX = image.naturalWidth / 100;
    const scaleY = image.naturalHeight / 100;

    canvas.width = crop.width! * scaleX;
    canvas.height = crop.height! * scaleY;

    ctx.drawImage(
      image,
      crop.x! * scaleX,
      crop.y! * scaleY,
      crop.width! * scaleX,
      crop.height! * scaleY,
      0,
      0,
      crop.width! * scaleX,
      crop.height! * scaleY
    );

    return canvas.toDataURL('image/png');
}

export default function Home() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [sessionPin, setSessionPin] = useState("");
  const [isClient, setIsClient] = useState(false);

  // Layout State
  const [activeTab, setActiveTab] = useState<"generator" | "manual">("generator");

  // Upscale Rate Limiting State
  const [globalUpscaleState, setGlobalUpscaleState] = useState<"IDLE" | "PROCESSING" | "COOLDOWN">("IDLE");
  const [upscaleCooldownTime, setUpscaleCooldownTime] = useState(0);

  // Generator State
  const [prompt, setPrompt] = useState("");
  const [batchSize, setBatchSize] = useState(1);
  const [mode, setMode] = useState("premium");
  const [artStyle, setArtStyle] = useState("3D Render");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{url: string, isUpscaling?: boolean, upscaledUrl?: string}[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");

  // Manual Mode State (BATCH ENABLED)
  const [manualImages, setManualImages] = useState<{
    id: string, 
    originalUrl: string, 
    url: string, 
    isProcessing: boolean, 
    isUpscaling: boolean, 
    upscaledUrl?: string
  }[]>([]);
  const [isManualBatchProcessing, setIsManualBatchProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isStyleOpen, setIsStyleOpen] = useState(false);
  const styleDropdownRef = useRef<HTMLDivElement>(null);

  // Cropping State (v2 - react-image-crop)
  const [croppingIdx, setCroppingIdx] = useState<number | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);
  const [isCropping, setIsCropping] = useState(false);
  const [showCropControls, setShowCropControls] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
    const savedPin = localStorage.getItem("admin_pin");
    if (savedPin) {
       setSessionPin(savedPin);
       setIsAuthenticated(true);
    } else {
       setIsAuthenticated(false);
    }
  }, []);

  // Close style dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (styleDropdownRef.current && !styleDropdownRef.current.contains(e.target as Node)) {
        setIsStyleOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Responsive Hook for CropModal
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }
  }, []);

  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setIsVerifying(true);
    setAuthError("");
    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': pinInput },
            body: JSON.stringify({ action: 'verify_pin' })
        });
        if (!res.ok) {
            setAuthError("PIN Salah!");
            setIsVerifying(false);
            return;
        }
        localStorage.setItem("admin_pin", pinInput);
        setSessionPin(pinInput);
        setIsAuthenticated(true);
    } catch (err) {
        setAuthError("Gagal verifikasi.");
    }
    setIsVerifying(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_pin");
    setSessionPin("");
    setIsAuthenticated(false);
  };

  const API_HEADERS = { 'Content-Type': 'application/json', 'x-admin-pin': sessionPin };

  // Helper Cooldown
  const triggerCooldown = (duration = 10) => {
    setGlobalUpscaleState("COOLDOWN");
    let timeLeft = duration;
    setUpscaleCooldownTime(timeLeft);
    const timer = setInterval(() => {
       timeLeft -= 1;
       setUpscaleCooldownTime(timeLeft);
       if (timeLeft <= 0) {
           clearInterval(timer);
           setGlobalUpscaleState("IDLE");
           setProgressText("");
       }
    }, 1000);
  };

  // --- GENERATOR LOGIC ---
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGeneratedImages([]);
    setProgress(0);
    try {
      const results: any[] = [];
      for (let i = 0; i < batchSize; i++) {
        setProgressText(`Mencetak [${i + 1}/${batchSize}]...`);
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: API_HEADERS,
          body: JSON.stringify({ action: "generate_image", prompt, mode, artStyle }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) throw new Error(genData.error);

        setProgressText(`Mendinginkan API (10s)...`);
        await new Promise(r => setTimeout(r, 10000));

        setProgressText(`Hapus BG [${i + 1}/${batchSize}]...`);
        const bgRes = await fetch('/api/generate', {
          method: 'POST',
          headers: API_HEADERS,
          body: JSON.stringify({ action: "remove_bg", imageUrl: genData.imageUrl }),
        });
        const bgData = await bgRes.json();
        if (!bgRes.ok) throw new Error(bgData.error);

        results.push({ url: bgData.imageUrl });
        setGeneratedImages([...results]); 
        setProgress(((i + 1) / batchSize) * 100);
        if (i < batchSize - 1) await new Promise(r => setTimeout(r, 10000));
      }
      triggerCooldown();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpscale = async (index: number) => {
    if (globalUpscaleState !== "IDLE" || isGenerating) return;
    const target = generatedImages[index];
    if (!target || target.isUpscaling || target.upscaledUrl) return;

    setGlobalUpscaleState("PROCESSING");
    const newData = [...generatedImages];
    newData[index].isUpscaling = true;
    setGeneratedImages(newData);

    try {
       const res = await fetch('/api/generate', {
         method: 'POST',
         headers: API_HEADERS,
         body: JSON.stringify({ action: "upscale", imageUrl: target.url }),
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error);
       newData[index].upscaledUrl = data.imageUrl;
    } catch(err: any) {
       alert(err.message);
    } finally {
       newData[index].isUpscaling = false;
       setGeneratedImages([...newData]);
       triggerCooldown();
    }
  };

  // --- MANUAL BATCH LOGIC ---
  const processFile = (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1024; // Guaranteed safe limit for all Replicate GPU models
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = (h/w)*MAX_DIM; w = MAX_DIM; }
          else { w = (w/h)*MAX_DIM; h = MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        
        setManualImages(prev => [
          ...prev, 
          { id: Math.random().toString(36).substr(2, 9), originalUrl: dataUrl, url: dataUrl, isProcessing: false, isUpscaling: false }
        ]);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(processFile);
      e.target.value = ""; // Reset value to allow identical re-uploads
    }
  };

  const handleSaveCrop = async () => {
    if (croppingIdx === null || !completedCrop) return;
    setIsCropping(true);
    try {
      // v7.12: Use percentage-based 'crop' for absolute accuracy
      const croppedImage = await getCroppedImg(
        manualImages[croppingIdx].upscaledUrl || manualImages[croppingIdx].url, 
        crop
      );
      const newImages = [...manualImages];
      newImages[croppingIdx] = {
        ...newImages[croppingIdx],
        id: Math.random().toString(36).substr(2, 9), // v7.11: Refresh ID to force Gallery re-render
        url: croppedImage,
        originalUrl: croppedImage,
        upscaledUrl: undefined // New crop source, reset 4K
      };
      setManualImages(newImages);
      setCroppingIdx(null);
    } catch (e) {
      console.error(e);
      alert("Gagal memotong gambar.");
    } finally {
      setIsCropping(false);
    }
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height, naturalWidth, naturalHeight } = e.currentTarget;
    const imageAspect = width / height;
    
    // Always provide an initial crop (Maximized)
    let initialCrop: Crop;
    if (cropAspect) {
      const isImageWiderThanAspect = imageAspect > cropAspect;
      initialCrop = centerCrop(
        makeAspectCrop(
          { unit: '%', [isImageWiderThanAspect ? 'height' : 'width']: 100 }, 
          cropAspect, 
          width, 
          height
        ),
        width,
        height
      );
    } else {
      initialCrop = { unit: '%' as const, x: 0, y: 0, width: 100, height: 100 };
    }
    
    setCrop(initialCrop);

    // Also calculate initial PixelCrop so Simpan button is active immediately
    const pixelCrop: PixelCrop = {
      unit: 'px',
      x: (initialCrop.x * naturalWidth) / 100,
      y: (initialCrop.y * naturalHeight) / 100,
      width: (initialCrop.width * naturalWidth) / 100,
      height: (initialCrop.height * naturalHeight) / 100,
    };
    setCompletedCrop(pixelCrop);
  };

  const handleManualAction = async (idx: number, type: "remove_bg" | "upscale") => {
    if (isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating) return;
    
    const target = manualImages[idx];
    const newImages = [...manualImages];

    if (type === "remove_bg") newImages[idx].isProcessing = true;
    else newImages[idx].isUpscaling = true;
    setManualImages([...newImages]);

    try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: API_HEADERS,
          body: JSON.stringify({ action: type, imageUrl: type === "upscale" ? (target.upscaledUrl || target.url) : target.url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (type === "remove_bg") newImages[idx].url = data.imageUrl;
        else newImages[idx].upscaledUrl = data.imageUrl;
        
        triggerCooldown();
    } catch (err: any) {
        alert(err.message);
    } finally {
        newImages[idx].isProcessing = false;
        newImages[idx].isUpscaling = false;
        setManualImages([...newImages]);
    }
  };

  const handleBatchManual = async (type: "remove_bg" | "upscale") => {
    if (isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating) return;
    setIsManualBatchProcessing(true);
    setProgressText(`Memulai Batch Manual: ${type === "remove_bg" ? "Hapus BG" : "Upscale 4K"}...`);
    
    try {
        const itemsToProcess = manualImages.filter(img => 
          type === "remove_bg" ? img.url === img.originalUrl : !img.upscaledUrl
        );
        
        if (itemsToProcess.length === 0) {
            alert(`Semua gambar sudah di-${type === "remove_bg" ? "rembg" : "upscale"}!`);
            setIsManualBatchProcessing(false);
            return;
        }

        for (let i = 0; i < manualImages.length; i++) {
           const img = manualImages[i];
           
           if (type === "remove_bg" && img.url === img.originalUrl) {
              setProgressText(`Rembg [${i+1}/${manualImages.length}]...`);
              const res = await fetch('/api/generate', {
                method: 'POST',
                headers: API_HEADERS,
                body: JSON.stringify({ action: "remove_bg", imageUrl: img.originalUrl }),
              });
              const data = await res.json();
              if (res.ok) {
                setManualImages(prev => {
                  const updated = [...prev];
                  updated[i].url = data.imageUrl;
                  return updated;
                });
                if (i < manualImages.length - 1) await new Promise(r => setTimeout(r, 10000));
              }
           }

           if (type === "upscale" && !img.upscaledUrl) {
              setProgressText(`Upscale [${i+1}/${manualImages.length}]...`);
              const res = await fetch('/api/generate', {
                method: 'POST',
                headers: API_HEADERS,
                body: JSON.stringify({ action: "upscale", imageUrl: img.url }),
              });
              const data = await res.json();
              if (res.ok) {
                 setManualImages(prev => {
                   const updated = [...prev];
                   updated[i].upscaledUrl = data.imageUrl;
                   return updated;
                 });
                 if (i < manualImages.length - 1) await new Promise(r => setTimeout(r, 10000));
              }
           }
        }
        triggerCooldown();
    } catch (err: any) {
        alert(err.message);
    } finally {
        setIsManualBatchProcessing(false);
    }
  };

  const handleDownloadZip = async (source: "gen" | "manual") => {
    const images = source === "gen" ? generatedImages : manualImages.map(m => ({ url: m.url, upscaledUrl: m.upscaledUrl }));
    if (images.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder("stickers");
    if (!folder) return;
    try {
        await Promise.all(images.map(async (item, idx) => {
            const res = await fetch(item.upscaledUrl || item.url);
            const blob = await res.blob();
            folder.file(`sticker_${idx+1}${item.upscaledUrl ? '_4k' : ''}.png`, blob);
        }));
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `stickers_${source}.zip`);
    } catch (e) { alert("ZIP error"); }
  };

  if (!isClient) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6 bg-zinc-950">
        <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-pink-500/10 opacity-50 pointer-events-none group-hover:opacity-75 transition-opacity" />
          <div className="relative z-10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-center text-white mb-2">Production Login</h1>
            <p className="text-zinc-500 text-sm text-center mb-8">Access restricted to authorized production staff only.</p>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Admin Access PIN</label>
                <input 
                  type="password" 
                  value={pinInput} 
                  onChange={(e) => setPinInput(e.target.value)} 
                  placeholder="••••••" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-2xl tracking-[0.5em] text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
                  autoFocus
                />
              </div>
              
              {authError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs text-center animate-shake">
                  {authError}
                </div>
              )}
              
              <button 
                type="submit" 
                disabled={isVerifying || !pinInput.trim()} 
                className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:bg-zinc-800 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
              >
                {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isVerifying ? "Verifying..." : "Unlock Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center p-6 md:p-12 w-full max-w-6xl mx-auto">
      
      <div className="absolute top-4 right-4 z-20"><button onClick={handleLogout} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-full text-sm font-semibold flex items-center gap-2"><LogOut className="w-4 h-4" /> Logout</button></div>

      <div className="text-center mb-8 mt-8">
        <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">StickerMaker AI</h1>
        <div className="inline-flex bg-white/5 border border-white/10 p-1 rounded-2xl backdrop-blur-md mt-6">
           <button onClick={() => setActiveTab("generator")} className={clsx("px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2", activeTab === "generator" ? "bg-indigo-500 text-white shadow-lg" : "text-zinc-500")}> <Zap className="w-4 h-4" /> AI Generator </button>
           <button onClick={() => setActiveTab("manual")} className={clsx("px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2", activeTab === "manual" ? "bg-pink-500 text-white shadow-lg" : "text-zinc-500")}> <Upload className="w-4 h-4" /> Manual Tool </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        {/* Left Column */}
        <div className="lg:col-span-4 space-y-6">
          {activeTab === "generator" ? (
            <div className="glass-panel p-6 rounded-2xl">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"> <Wand2 className="w-5 h-5 text-indigo-400" /> Settings </h2>
              <div className="space-y-5">
                {/* Subject Input */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Subject / Prompt</label>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe your sticker..." className="w-full glass-input rounded-xl p-4 min-h-[100px] resize-none text-sm" />
                </div>

                {/* Custom Art Style Dropdown */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Art Style</label>
                  <div className="relative" ref={styleDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsStyleOpen(!isStyleOpen)}
                      className="w-full glass-input rounded-xl p-3.5 flex items-center justify-between text-sm text-white hover:bg-white/5 transition-colors"
                    >
                      <span>{artStyle}</span>
                      <ChevronDown className={clsx("w-4 h-4 text-zinc-500 transition-transform", isStyleOpen && "rotate-180")} />
                    </button>
                    {isStyleOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-zinc-900 rounded-xl border border-white/10 shadow-2xl shadow-black/50 max-h-[280px] overflow-y-auto">
                        {STYLES.map(s => (
                          <button
                            key={s}
                            onClick={() => { setArtStyle(s); setIsStyleOpen(false); }}
                            className={clsx(
                              "w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2",
                              artStyle === s ? "bg-indigo-500/20 text-indigo-400 font-bold" : "text-zinc-300 hover:bg-white/5"
                            )}
                          >
                            {artStyle === s && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Batch Size */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Batch Size</span><span className="text-indigo-400 font-bold">{batchSize}</span></div>
                  <input type="range" min="1" max="20" value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value))} className="w-full" />
                </div>

                {/* AI Model Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">AI Model</label>
                  <div className="space-y-2"> {MODES.map(m => <button key={m.id} onClick={() => setMode(m.id)} className={clsx("w-full p-3 rounded-xl border flex items-center gap-3 transition-colors", mode === m.id ? "border-pink-500 bg-pink-500/10" : "border-white/10 hover:bg-white/5")}> <m.icon className="w-5 h-5 text-indigo-400" /> <div className="text-left"><div className="text-sm font-bold">{m.name}</div><div className="text-[10px] text-zinc-500 leading-tight">{m.desc}</div></div> </button>)} </div>
                </div>

                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="w-full py-4 rounded-xl bg-indigo-500 text-white font-bold disabled:opacity-50"> {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Generate Batch"} </button>
              </div>
            </div>
          ) : (
            <div className="glass-panel p-6 rounded-2xl">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"> <Upload className="w-5 h-5 text-pink-400" /> Manual Upload </h2>
              <div className="space-y-6">
                 <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => {e.preventDefault(); setIsDragging(true)}} onDragLeave={() => setIsDragging(false)} onDrop={(e) => {e.preventDefault(); setIsDragging(false); if(e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(processFile)}} className={clsx("border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all", isDragging ? "border-pink-500 bg-pink-500/10" : "border-white/10")}>
                    <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                    <Upload className="w-8 h-8 text-zinc-500" />
                    <p className="text-zinc-500 text-[10px] text-center">Seret banyak file ke sini atau klik untuk memilih.</p>
                 </div>
                 <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => handleBatchManual("remove_bg")} 
                      disabled={manualImages.length === 0 || isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating} 
                      className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold disabled:opacity-50 flex justify-center items-center gap-2 border border-white/10"
                    >
                       {isManualBatchProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5 text-indigo-400" />}
                       {globalUpscaleState === "COOLDOWN" ? `Tunggu (${upscaleCooldownTime}s)` : manualImages.some(m => m.isProcessing) ? "Memproses..." : "Hapus BG Massal"}
                    </button>
                    <button 
                      onClick={() => handleBatchManual("upscale")} 
                      disabled={manualImages.length === 0 || isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating} 
                      className="w-full py-4 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-xl font-bold disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-pink-500/10"
                    >
                       {isManualBatchProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                       {globalUpscaleState === "COOLDOWN" ? `Jeda API (${upscaleCooldownTime}s)` : manualImages.some(m => m.isUpscaling) ? "Memproses..." : "Upscale 4K Massal"}
                    </button>
                 </div>
                 <button onClick={() => setManualImages([])} disabled={manualImages.length === 0} className="w-full py-3 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold flex justify-center items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Bersihkan Daftar
                 </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8 flex flex-col min-h-[600px]">
          <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2"> <ImageIcon className="w-5 h-5 text-pink-400" /> Production Gallery </h2>
              {(activeTab === "generator" ? generatedImages.length : manualImages.length) > 0 && (
                <button onClick={() => handleDownloadZip(activeTab === "generator" ? "gen" : "manual")} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center gap-2"><Download className="w-4 h-4" /> ZIP</button>
              )}
            </div>

            {(isGenerating || isManualBatchProcessing) && (
                <div className="mb-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 animate-pulse">
                   <p className="text-sm font-bold text-center text-indigo-400">{progressText}</p>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {activeTab === "generator" ? generatedImages.map((img, idx) => (
                <StickerCard 
                  key={idx} 
                  img={img} 
                  onUpscale={() => handleUpscale(idx)} 
                  onPreview={() => setPreviewImage(img.upscaledUrl || img.url)} 
                  globalLock={globalUpscaleState !== "IDLE" || isGenerating} 
                  upscaleCooldownTime={upscaleCooldownTime}
                />
              )) : manualImages.map((img, idx) => (
                <div key={img.id} className="group relative">
                  <ManualCard 
                    img={img} 
                    idx={idx}
                    onManualAction={handleManualAction}
                    onCropOpen={(idx) => {
                      setCroppingIdx(idx); 
                      setCrop(undefined); 
                      setCropAspect(undefined);
                      setShowCropControls(true);
                    }}
                    onPreview={(url) => setPreviewImage(url)}
                    onDelete={(id) => setManualImages(m => m.filter(x => x.id !== id))}
                    globalLock={globalUpscaleState !== "IDLE" || isManualBatchProcessing || isGenerating}
                    upscaleCooldownTime={upscaleCooldownTime}
                    isManualBatchProcessing={isManualBatchProcessing}
                    isGenerating={isGenerating}
                  />
                </div>
              ))}
            </div>
            {((activeTab === "generator" ? generatedImages.length : manualImages.length) === 0) && (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-700"><ImageIcon className="w-12 h-12 mb-2 opacity-20" /> <p className="text-sm">Gallery Kosong</p></div>
            )}
          </div>
        </div>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {/* CROP MODAL v4 - NON-OVERLAPPING STUDIO */}
      {croppingIdx !== null && (
        <div className="fixed inset-0 z-[60] bg-zinc-950 flex flex-col overflow-hidden animate-in fade-in duration-300">
          {/* Header */}
          <div className="p-4 flex justify-between items-center bg-zinc-900 border-b border-white/5 z-20 shrink-0">
            <h3 className="font-bold flex items-center gap-2 text-sm text-zinc-300">
              <Scissors className="w-4 h-4 text-pink-500" /> Editor Potong Studio
            </h3>
            <button onClick={() => setCroppingIdx(null)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-500" /></button>
          </div>
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            {/* Main Stage (Image Area - Priority) */}
            <div className="flex-1 min-h-0 relative bg-black overflow-hidden transition-all duration-500">
              <div className="absolute inset-0 flex items-center justify-center p-4 md:p-12">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={cropAspect}
                  className="shadow-2xl shadow-white/5 transition-all duration-300"
                >
                  <img
                    ref={imgRef}
                    alt="Cropme"
                    src={manualImages[croppingIdx].url}
                    onLoad={(e) => {
                      const { width, height } = e.currentTarget;
                      // v7.8: Targeted Responsive Scaling - Absolute 100% Bounds
                      const initialCrop: Crop = { unit: '%', width: 100, height: 100, x: 0, y: 0 };
                      setCrop(initialCrop);
                    }}
                    style={{ 
                      maxHeight: isMobile ? 'calc(100vh - 250px)' : 'calc(100vh - 180px)',
                      maxWidth: isMobile ? '100%' : 'calc(100vw - 420px)'
                    }}
                    className="object-contain block select-none pointer-events-none rounded shadow-2xl"
                  />
                </ReactCrop>
              </div>
            </div>

            {/* Mobile Floating Toggle Bubble */}
            <button 
              onClick={() => setShowCropControls(!showCropControls)}
              className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-600/40 z-50 active:scale-95 transition-all"
            >
              {showCropControls ? <X className="w-6 h-6" /> : <Settings2 className="w-6 h-6" />}
            </button>

            {/* Controls (Adapts to Mobile Floating / Desktop Sidebar) */}
            <div className={clsx(
              "shrink-0 z-40 transition-all duration-500",
              // Mobile: Floating Glass Panel
              "fixed bottom-24 left-6 right-6 md:relative md:bottom-0 md:left-0 md:right-0",
              "md:w-80 bg-zinc-900 md:bg-zinc-900 border md:border-t-0 md:border-l border-white/5 flex flex-col p-4 md:p-6 overflow-y-auto max-h-[60vh] md:max-h-full shadow-2xl rounded-3xl md:rounded-none",
              // Mobile Visibility Toggle
              !showCropControls ? "opacity-0 translate-y-10 pointer-events-none sm:opacity-100 sm:translate-y-0 sm:pointer-events-auto" : "opacity-100 translate-y-0 pointer-events-auto",
              // Glass Effect for Mobile
              "bg-zinc-900/90 backdrop-blur-2xl md:bg-zinc-900"
            )}>
              <div className="space-y-6 flex-1 flex flex-col">
                {/* Aspect Ratios Section */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black ml-1">Aspect Ratio Matrix</span>
                    <p className="text-[10px] text-zinc-600 ml-1">Ketuk untuk ubah rasio</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Bebas", val: undefined },
                      { label: "1:1 Square", val: 1 },
                      { label: "4:5 Portrait", val: 0.8 },
                      { label: "9:16 Story", val: 0.5625 },
                      { label: "16:9 Wide", val: 1.777 },
                    ].map((ratio) => (
                      <button
                        key={ratio.label}
                        onClick={() => {
                            setCropAspect(ratio.val);
                            if (imgRef.current) {
                               const { width: dW, height: dH } = imgRef.current;
                               const imgA = dW / dH;
                               let nC: Crop;
                               
                               if (ratio.val) {
                                 // v7.14: Absolute Maximizer - Auto-fills the image centered
                                 nC = centerCrop(
                                   makeAspectCrop(
                                     { unit: '%', [imgA > ratio.val ? 'height' : 'width']: 100 }, 
                                     ratio.val, 
                                     dW, 
                                     dH
                                   ),
                                   dW,
                                   dH
                                 );
                               } else {
                                 // v7.14: Freeform (Bebas) snaps to 100% full
                                 nC = { unit: '%', x: 0, y: 0, width: 100, height: 100 };
                               }
                               setCrop(nC);
                            }
                        }}
                        className={clsx(
                          "py-2.5 rounded-xl font-bold flex flex-col items-center justify-center border transition-all active:scale-95",
                          cropAspect === ratio.val
                            ? "bg-white text-zinc-950 border-white shadow-lg"
                            : "bg-zinc-800 text-zinc-400 border-white/5 hover:border-white/10"
                        )}
                      >
                        <span className="text-[10px] font-black">{ratio.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 mt-auto pt-4">
                  <button
                    onClick={handleSaveCrop}
                    disabled={isCropping || !completedCrop}
                    className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-indigo-400 shadow-xl shadow-indigo-500/20 active:scale-95 transition-all text-sm uppercase tracking-widest"
                  >
                    {isCropping ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                    {isCropping ? "Sedang Proses..." : "SIMPAN HASIL"}
                  </button>
                  <button
                    onClick={() => setCroppingIdx(null)}
                    className="w-full py-3 bg-zinc-800 text-zinc-500 rounded-2xl font-bold border border-white/5 hover:bg-zinc-700 hover:text-white transition-all text-xs uppercase"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StickerCard({ img, onUpscale, onPreview, globalLock, upscaleCooldownTime }: any) {
  const [showMenu, setShowMenu] = useState(false);
  
  return (
    <div 
      className="aspect-square bg-white/5 border border-white/5 rounded-xl relative group overflow-hidden animate-in zoom-in-50 duration-500 cursor-pointer"
      onClick={() => setShowMenu(!showMenu)}
    >
      {/* Visual Hint for Mobile */}
      <div className={clsx(
        "absolute top-3 right-3 text-white/40 sm:hidden transition-opacity z-20",
        showMenu ? "opacity-0" : "opacity-100"
      )}>
        <MoreVertical className="w-5 h-5 drop-shadow-lg" />
      </div>

      {/* 4K Badge - Hide when menu is active for clarity */}
      {img.upscaledUrl && !showMenu && (
        <div className="absolute top-2 left-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-20">
          4K HD
        </div>
      )}
      
      {/* Loading Overlay */}
      {img.isUpscaling && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-pink-500" />
          <p className="text-white text-sm font-semibold animate-pulse">Menajamkan 4K...</p>
        </div>
      )}

      {/* Hover/Tap Overlay */}
      <div className={clsx(
        "absolute inset-0 bg-zinc-950/90 backdrop-blur-md transition-all duration-300 z-10 flex flex-col items-center justify-center pt-10 pb-4 px-4 gap-2",
        img.isUpscaling ? "hidden" : showMenu ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
      )}>
        {/* Dedicated Close Button for Mobile Overlay - Styled better */}
        {showMenu && (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
            className="absolute top-2 right-2 p-1 bg-white/20 hover:bg-white/30 backdrop-blur-xl rounded-full text-white sm:hidden z-30 border border-white/10"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}

        <div className="w-full">
          {!img.upscaledUrl ? (
            <button 
              onClick={(e) => { e.stopPropagation(); onUpscale(); }} 
              disabled={globalLock || img.isUpscaling} 
              className="w-full py-3 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-lg border border-white/10 disabled:opacity-40 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] font-bold">{globalLock ? `${upscaleCooldownTime}s` : <><span className="sm:hidden">Upscale</span><span className="hidden sm:inline">Upscale ke 4K</span></>}</span>
            </button>
          ) : (
            <div className="w-full py-3 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/30 flex flex-col items-center justify-center gap-1">
              <ShieldCheck className="w-5 h-5" /> <span className="text-[10px]">4K Ready</span>
            </div>
          )}
        </div>

        <div className="flex w-full gap-2 border-t border-white/10 pt-3 mt-1">
          <button onClick={(e) => { e.stopPropagation(); onPreview(); }} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex justify-center transition-colors" title="View"><Maximize className="w-4 h-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); saveAs(img.upscaledUrl || img.url, "sticker.png"); }} className="flex-1 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg flex justify-center transition-colors" title="Save"><Download className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Main Image */}
      <img 
        src={img.upscaledUrl || img.url} 
        alt="Sticker" 
        className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-110" 
      />
    </div>
  );
}

function ManualCard({ img, idx, onManualAction, onCropOpen, onPreview, onDelete, globalLock, upscaleCooldownTime, isManualBatchProcessing, isGenerating }: { 
  img: any, 
  idx: number, 
  onManualAction: (idx: number, type: "remove_bg" | "upscale") => void, 
  onCropOpen: (idx: number) => void, 
  onPreview: (url: string) => void, 
  onDelete: (id: string) => void, 
  globalLock: boolean, 
  upscaleCooldownTime: number, 
  isManualBatchProcessing: boolean, 
  isGenerating: boolean 
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div 
      className="aspect-square bg-white/5 border border-white/5 rounded-xl relative group overflow-hidden animate-in fade-in duration-300 cursor-pointer"
      onClick={() => setShowMenu(!showMenu)}
    >
      {/* Visual Hint for Mobile */}
      <div className={clsx(
        "absolute top-3 right-3 text-white/40 sm:hidden transition-opacity z-20",
        showMenu ? "opacity-0" : "opacity-100"
      )}>
        <MoreVertical className="w-5 h-5 drop-shadow-lg" />
      </div>

       {/* Status Badges - Hide when menu is active */}
       {!showMenu && (
         <div className="absolute top-2 left-2 flex gap-1 z-20">
            {img.url !== img.originalUrl && <div className="bg-indigo-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">B-FREE</div>}
            {img.upscaledUrl && <div className="bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">4K</div>}
         </div>
       )}
       
       {/* Centered Processing Loader */}
       {(img.isProcessing || img.isUpscaling) && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-30 flex items-center justify-center">
             <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
          </div>
       )}

       <div className={clsx(
         "absolute inset-0 bg-zinc-950/90 backdrop-blur-md transition-all duration-300 z-10 flex flex-col items-center justify-center pt-8 pb-4 px-4 gap-3",
         (img.isProcessing || img.isUpscaling) ? "hidden" : showMenu ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
       )}>
          {/* Dedicated Close Button for Mobile Overlay - Styled better */}
          {showMenu && (
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
              className="absolute top-2 right-2 p-1 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-full text-white/60 sm:hidden z-30 border border-white/10"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          <div className="grid grid-cols-3 gap-2 w-full">
             <button 
               onClick={(e) => { e.stopPropagation(); onManualAction(idx, "remove_bg"); }} 
               disabled={img.isProcessing || img.url !== img.originalUrl || globalLock} 
               className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex flex-col items-center justify-center gap-1 border border-white/10 disabled:opacity-40 transition-colors"
               title="Remove BG"
             >
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span className="text-[8px] font-bold hidden sm:inline text-zinc-400">BG</span>
             </button>
             <button 
               onClick={(e) => { e.stopPropagation(); onManualAction(idx, "upscale"); }} 
               disabled={img.isUpscaling || !!img.upscaledUrl || globalLock} 
               className="py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg flex flex-col items-center justify-center gap-1 shadow-lg shadow-indigo-500/20 disabled:opacity-40 transition-colors"
               title="Upscale 4K"
             >
                <Sparkles className="w-4 h-4" />
                <span className="text-[8px] font-bold hidden sm:inline">4K</span>
             </button>
             <button 
               onClick={(e) => { e.stopPropagation(); onCropOpen(idx); }} 
               disabled={img.isProcessing || img.isUpscaling || globalLock || isManualBatchProcessing || isGenerating} 
               className="py-2.5 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 rounded-lg flex flex-col items-center justify-center gap-1 border border-pink-500/30 disabled:opacity-40 transition-colors"
               title="Crop"
             >
                <Scissors className="w-4 h-4" />
                <span className="text-[8px] font-bold hidden sm:inline">Crop</span>
             </button>
          </div>
          
          <div className="flex w-full gap-2 border-t border-white/10 pt-3">
            <button onClick={(e) => { e.stopPropagation(); onPreview(img.upscaledUrl || img.url); }} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex justify-center transition-colors" title="Preview"><Maximize className="w-4 h-4" /></button>
            <button onClick={(e) => { e.stopPropagation(); saveAs(img.upscaledUrl || img.url, `Sticker_${idx}.png`); }} className="flex-1 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg flex justify-center transition-colors shadow-inner" title="Download"><Download className="w-4 h-4" /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(img.id); }} className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg flex justify-center transition-colors border border-red-500/20" title="Hapus"><Trash2 className="w-4 h-4" /></button>
          </div>
       </div>

       {/* Main Image */}
       <img 
         src={img.upscaledUrl || img.url} 
         alt="Manual" 
         className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-105" 
       />
    </div>
  );
}
