"use client";

import { useState, useEffect, useRef } from "react";
import { Wand2, Image as ImageIcon, Sparkles, Download, Loader2, X, Lock, Maximize, ShieldCheck, LogOut, Upload, Zap, Trash2, Layers } from "lucide-react";
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
    if (files) Array.from(files).forEach(processFile);
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
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Subject..." className="w-full glass-input rounded-xl p-4 min-h-[100px] resize-none" />
                <select value={artStyle} onChange={(e) => setArtStyle(e.target.value)} className="w-full glass-input rounded-xl p-3"> {STYLES.map(s => <option key={s} value={s}>{s}</option>)} </select>
                <div className="flex justify-between text-sm"><span>Batch Size</span><span className="text-indigo-400 font-bold">{batchSize}</span></div>
                <input type="range" min="1" max="20" value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value))} className="w-full" />
                <div className="space-y-2"> {MODES.map(m => <button key={m.id} onClick={() => setMode(m.id)} className={clsx("w-full p-3 rounded-xl border flex items-center gap-3 transition-colors", mode === m.id ? "border-pink-500 bg-pink-500/10" : "border-white/10 hover:bg-white/5")}> <m.icon className="w-5 h-5 text-indigo-400" /> <div className="text-left"><div className="text-sm font-bold">{m.name}</div><div className="text-[10px] text-zinc-500 leading-tight">{m.desc}</div></div> </button>)} </div>
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
                       {globalUpscaleState === "COOLDOWN" && activeTab === "manual" ? `Tunggu (${upscaleCooldownTime}s)` : "Hapus BG Massal"}
                    </button>
                    <button 
                      onClick={() => handleBatchManual("upscale")} 
                      disabled={manualImages.length === 0 || isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating} 
                      className="w-full py-4 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-xl font-bold disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-pink-500/10"
                    >
                       {isManualBatchProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                       {globalUpscaleState === "COOLDOWN" && activeTab === "manual" ? `Jeda API (${upscaleCooldownTime}s)` : "Upscale 4K Massal"}
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
                <div key={img.id} className="aspect-square bg-white/5 border border-white/5 rounded-xl relative group overflow-hidden animate-in fade-in duration-300">
                   {/* Status Badges */}
                   <div className="absolute top-2 left-2 flex gap-1 z-20">
                      {img.url !== img.originalUrl && <div className="bg-indigo-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">B-FREE</div>}
                      {img.upscaledUrl && <div className="bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">4K</div>}
                   </div>
                   
                   {/* Centered Processing Loader */}
                   {(img.isProcessing || img.isUpscaling) && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-30 flex items-center justify-center">
                         <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
                      </div>
                   )}

                   {/* Hover Overlay - Premium Design */}
                   <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 flex flex-col items-center justify-center p-4 gap-3">
                      <div className="flex flex-col w-full gap-2">
                         <button 
                           onClick={() => handleManualAction(idx, "remove_bg")} 
                           disabled={img.isProcessing || img.url !== img.originalUrl || globalUpscaleState !== "IDLE" || isManualBatchProcessing || isGenerating} 
                           className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 border border-white/10 disabled:opacity-40 transition-colors"
                         >
                            <ShieldCheck className="w-3.5 h-3.5" /> {globalUpscaleState === "COOLDOWN" ? `Jeda (${upscaleCooldownTime}s)` : "Hapus BG"}
                         </button>
                         <button 
                           onClick={() => handleManualAction(idx, "upscale")} 
                           disabled={img.isUpscaling || !!img.upscaledUrl || globalUpscaleState !== "IDLE" || isManualBatchProcessing || isGenerating} 
                           className="w-full py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-40 transition-colors"
                         >
                            <Sparkles className="w-3.5 h-3.5" /> {globalUpscaleState === "COOLDOWN" ? `Jeda (${upscaleCooldownTime}s)` : "Upscale 4K"}
                         </button>
                      </div>
                      
                      <div className="flex w-full gap-2 border-t border-white/10 pt-3 mt-1">
                        <button onClick={() => setPreviewImage(img.upscaledUrl || img.url)} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex justify-center transition-colors" title="Preview"><Maximize className="w-4 h-4" /></button>
                        <button onClick={() => saveAs(img.upscaledUrl || img.url, `Sticker_${idx}.png`)} className="flex-1 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg flex justify-center transition-colors shadow-inner" title="Download"><Download className="w-4 h-4" /></button>
                        <button onClick={() => setManualImages(m => m.filter(x => x.id !== img.id))} className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg flex justify-center transition-colors border border-red-500/20" title="Hapus"><Trash2 className="w-4 h-4" /></button>
                      </div>
                   </div>

                   {/* Main Image */}
                   <img 
                     src={img.upscaledUrl || img.url} 
                     alt="Manual" 
                     className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-105" 
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
    </div>
  );
}

function StickerCard({ img, onUpscale, onPreview, globalLock, upscaleCooldownTime }: any) {
  return (
    <div className="aspect-square bg-white/5 border border-white/5 rounded-xl relative group overflow-hidden cursor-zoom-in animate-in zoom-in-50 duration-500">
      {/* 4K Badge */}
      {img.upscaledUrl && (
        <div className="absolute top-2 right-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-20">
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

      {/* Hover Overlay */}
      <div className={clsx(
        "absolute inset-0 bg-zinc-950/80 backdrop-blur-sm transition-opacity duration-300 z-10 flex flex-col items-center justify-center p-4 gap-3",
        img.isUpscaling ? "hidden" : "opacity-0 group-hover:opacity-100"
      )}>
        <div className="w-full">
          {!img.upscaledUrl ? (
            <button 
              onClick={(e) => { e.stopPropagation(); onUpscale(); }} 
              disabled={globalLock || img.isUpscaling} 
              className="w-full py-2.5 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold rounded-lg border border-white/10 disabled:opacity-40 transition-all active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 mx-auto mb-1" />
              {globalLock ? `Jeda API (${upscaleCooldownTime}s)` : "Upscale ke 4K"}
            </button>
          ) : (
            <div className="w-full py-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/30 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4" /> 4K Ready
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
